// LongMemEval External Benchmark — QA Orchestrator
//
// Question-by-question execution loop. Each problem gets its own VaultCrux tenant
// (for F1/T2). Each question triggers a tool loop until the model produces a
// text-only response (the hypothesis).

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import type { LlmAdapter, Message, ToolDef } from "../../memorycrux/lib/llm/adapter.js";
import { McProxy } from "../../memorycrux/lib/mc-proxy.js";
import { estimateCost } from "../../memorycrux/lib/llm/cost.js";
import type { BenchModel, BenchConfig } from "../../memorycrux/lib/types.js";
import { createAdapter } from "../../memorycrux/lib/llm/factory.js";
import type { LmeAnswer, LmeArmConfig, LmeProblem, LmeRunManifest, LmeRunSummary, LmeToolStep, LmeReflection, LmeEscalation, LmeEscalationStep } from "./types.js";
import { buildSystemPrompt, buildPlaybookPrompt, classifyQuestion } from "./system-prompts.js";
import { decomposeQuery, buildDecomposedEvidence, isCompoundQuestion } from "./query-decomposer.js";
import { selectPlaybook, isPlaybookEngineEnabled, type Playbook } from "./playbook-engine.js";
import { ingestProblem, waitForEmbeddings, verifyIngestion } from "./ingest-sessions.js";
import { ingestProblemViaCorecrux, waitForCorecruxIndex, verifyCorecruxIngestion } from "./ingest-corecrux.js";
import { routeQuery, type RouterResult } from "./entity-router.js";
import { verifiedQuery, matchQATemplate, type VerifiedResult } from "./verified-query.js";

const MAX_TURNS_PER_QUESTION = 12;

// ── Local tool handlers (run in benchmark process, not on VaultCrux) ──

/**
 * date_diff — compute the difference between two dates.
 * Eliminates LLM arithmetic errors on temporal questions.
 */
function handleDateDiff(args: Record<string, unknown>): Record<string, unknown> {
  const from = String(args.from_date ?? "");
  const to = String(args.to_date ?? "");
  const unit = String(args.unit ?? "days");

  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return { error: `Invalid date(s): from="${from}", to="${to}"` };
  }

  const diffMs = toMs - fromMs;
  const diffDays = diffMs / 86_400_000;

  let value: number;
  switch (unit) {
    case "weeks":
      value = Math.round(diffDays / 7 * 10) / 10;
      break;
    case "months":
      value = Math.round(diffDays / 30.44 * 10) / 10;
      break;
    case "years":
      value = Math.round(diffDays / 365.25 * 10) / 10;
      break;
    default:
      value = Math.round(diffDays);
  }

  return {
    from_date: from,
    to_date: to,
    difference: value,
    unit,
    raw_days: Math.round(diffDays),
  };
}

/**
 * LLM-powered query expansion — generates 3-5 synonym-varied reformulations.
 * Uses Haiku for cost efficiency (~$0.001/call). Falls back to empty on failure.
 */
async function expandQueryWithLlm(question: string): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        temperature: 0.5,
        messages: [{
          role: "user",
          content: `Generate 4 alternative search queries for this question. Use synonyms, specific names, and different phrasings. Return ONLY the queries, one per line, no numbering.

Question: ${question}

Alternative queries:`,
        }],
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!resp.ok) return [];
    const data = await resp.json() as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text?.trim();
    if (!text) return [];

    return text
      .split("\n")
      .map((l) => l.replace(/^\d+[\.\)]\s*/, "").replace(/^[-•*]\s*/, "").trim())
      .filter((l) => l.length > 5 && l.length < 200);
  } catch {
    return [];
  }
}

/**
 * research_memory — iterative plan/search/reflect loop.
 * Issues multiple query_memory calls with different strategies,
 * assesses completeness, and retries until confident or max rounds hit.
 */
async function handleResearchMemory(
  args: Record<string, unknown>,
  proxy: McProxy,
): Promise<Record<string, unknown>> {
  const question = String(args.question ?? "");
  const maxRounds = Math.min(Number(args.max_rounds) || 3, 5);
  const strategy = String(args.strategy ?? "broad");

  const allResults: Array<Record<string, unknown>> = [];
  const seenChunkIds = new Set<string>();
  const queries: string[] = [];

  // Round 1: primary query with high limit
  const r1 = await proxy.callTool("query_memory", {
    query: question,
    limit: 30,
    scoring_profile: strategy === "aggregation" ? "recall" : "balanced",
  });
  if (r1.success && r1.result) {
    const items = extractItems(r1.result);
    for (const item of items) {
      const cid = String((item as Record<string, unknown>).chunkId ?? (item as Record<string, unknown>).chunk_id ?? "");
      if (cid && !seenChunkIds.has(cid)) {
        seenChunkIds.add(cid);
        allResults.push(item as Record<string, unknown>);
      }
    }
  }
  queries.push(question);

  // Rounds 2+: generate reformulated queries.
  // Use LLM expansion when available (generates synonym-varied queries),
  // fall back to rule-based entity extraction.
  let reformulations: string[];
  const llmExpansions = await expandQueryWithLlm(question);
  if (llmExpansions.length > 0) {
    reformulations = llmExpansions.filter((q) => q.length > 3 && !queries.includes(q));
  } else {
    const keyEntities = extractEntities(question);
    reformulations = [
      ...keyEntities.map((e) => e),
      question.replace(/how many|how much|total|what is the/gi, "").trim(),
    ].filter((q) => q.length > 3 && !queries.includes(q));
  }

  let consecutiveEmpty = 0;
  for (let round = 1; round < maxRounds && reformulations.length > 0; round++) {
    const nextQuery = reformulations.shift()!;
    queries.push(nextQuery);

    const rN = await proxy.callTool("query_memory", {
      query: nextQuery,
      limit: 20,
      scoring_profile: strategy === "aggregation" ? "recall" : "balanced",
    });
    if (rN.success && rN.result) {
      const items = extractItems(rN.result);
      let newFound = 0;
      for (const item of items) {
        const cid = String((item as Record<string, unknown>).chunkId ?? (item as Record<string, unknown>).chunk_id ?? "");
        if (cid && !seenChunkIds.has(cid)) {
          seenChunkIds.add(cid);
          allResults.push(item as Record<string, unknown>);
          newFound++;
        }
      }
      // Only stop after 2 consecutive empty rounds (not first miss)
      consecutiveEmpty = newFound === 0 ? consecutiveEmpty + 1 : 0;
      if (consecutiveEmpty >= 2) break;
    }
  }

  return {
    total_results: allResults.length,
    unique_chunks: seenChunkIds.size,
    rounds_used: queries.length,
    queries_issued: queries,
    results: allResults.slice(0, 15), // C1: cap at 15 to prevent noise drowning signal (was 50)
  };
}

function extractItems(result: unknown): unknown[] {
  if (!result || typeof result !== "object") return [];
  const r = result as Record<string, unknown>;
  if (Array.isArray(r.results)) return r.results;
  if (Array.isArray(r.items)) return r.items;
  if (r.data && typeof r.data === "object") {
    const d = r.data as Record<string, unknown>;
    if (Array.isArray(d.results)) return d.results;
    if (Array.isArray(d.items)) return d.items;
  }
  return [];
}

function extractEntities(question: string): string[] {
  // Extract quoted strings and capitalized noun phrases as entity candidates
  const entities: string[] = [];
  const quoted = question.match(/"([^"]+)"|'([^']+)'/g);
  if (quoted) {
    for (const q of quoted) entities.push(q.replace(/['"]/g, ""));
  }
  // Extract capitalized words that aren't at sentence start
  const words = question.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!.replace(/[^a-zA-Z]/g, "");
    if (w.length > 2 && w[0] === w[0]!.toUpperCase() && w[0] !== w[0]!.toLowerCase()) {
      entities.push(w);
    }
  }
  return [...new Set(entities)].slice(0, 3);
}

/**
 * get_session_by_id — direct doc/session content lookup by document ID.
 * When the model finds a reference to another session, it can fetch it directly.
 */
async function handleGetSessionById(
  args: Record<string, unknown>,
  proxy: McProxy,
): Promise<Record<string, unknown>> {
  const docId = String(args.doc_id ?? "");
  if (!docId) return { error: "doc_id is required" };

  // Use query_memory with a doc-specific search
  const result = await proxy.callTool("query_memory", {
    query: docId,
    limit: 10,
  });
  return result.result as Record<string, unknown> ?? { error: "No results" };
}

const ENTITY_DB_URL = process.env.ENTITY_DB_URL ?? "postgres://vaultcrux:Et-lpNvPE-wdOKG1K3neNqLeFoinBmES-1a1aBPxkU19@100.75.64.43:5432/vaultcrux";

/**
 * structured_query — Phase 5+6: verified query with answer-first approach.
 * Proposes candidate from entity index, verifies against chunks, returns
 * only verified facts. Falls back to vector search when verification fails.
 */
async function handleStructuredQuery(
  args: Record<string, unknown>,
  dataset: string,
  problemId: string,
  proxy?: McProxy,
): Promise<Record<string, unknown>> {
  const question = String(args.question ?? "");
  if (!question) return { error: "question is required" };

  try {
    const result = await verifiedQuery(question, {
      databaseUrl: ENTITY_DB_URL,
      tenantId: problemId,
      dataset,
    }, proxy);

    if (!result.useFallback && result.answer) {
      return {
        intent: result.intent,
        confidence: result.confidence,
        answer: result.answer,
        verified: result.verified,
        method: result.method,
        entities: result.candidate?.entities?.slice(0, 20) ?? [],
      };
    }

    // Entity index didn't have an answer — try QA template matching
    const tenantId = `__longmemeval_${dataset}_${problemId}`;
    const qaMatch = await matchQATemplate(question, tenantId, ENTITY_DB_URL);
    if (qaMatch.matched && qaMatch.confidence >= 0.6) {
      return {
        intent: result.intent,
        confidence: qaMatch.confidence,
        answer: qaMatch.answer,
        method: qaMatch.method,
        verified: false,
      };
    }

    return {
      intent: result.intent,
      confidence: 0,
      answer: null,
      method: result.method + (qaMatch.method !== "qa_template_no_match" ? "+" + qaMatch.method : ""),
      note: "Entity index and QA templates insufficient — use query_memory for vector search",
    };
  } catch (err) {
    return { error: `structured_query failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Call VaultCrux fact API endpoints directly (new deterministic tools).
 */
async function callFactApi(
  endpoint: string,
  body: Record<string, unknown>,
  tenantId: string,
): Promise<Record<string, unknown>> {
  const apiBase = process.env.BENCH_VAULTCRUX_API_BASE ?? "http://100.109.10.67:14333";
  const apiKey = process.env.BENCH_VAULTCRUX_API_KEY ?? "";
  try {
    const resp = await fetch(`${apiBase}/v1/memory/facts/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return { error: `API returned ${resp.status}` };
    const data = await resp.json() as Record<string, unknown>;
    return (data as any).data ?? data;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Check if a tool should be handled locally (not sent to VaultCrux) */
const LOCAL_TOOLS = new Set(["date_diff", "research_memory", "get_session_by_id", "structured_query",
  "enumerate_memory_facts", "build_timeline", "expand_hit_context", "assess_answerability", "derive_from_facts",
  "investigate_question"]);

export interface OrchestratorConfig {
  adapter: LlmAdapter;
  toolDefs: ToolDef[];
  armConfig: LmeArmConfig;
  manifest: LmeRunManifest;
  benchConfig: BenchConfig; // For creating per-problem proxies
  concurrency?: number;
  onAnswer?: (answer: LmeAnswer) => void;
  /** Enable cascade mode: haiku → sonnet → opus escalation */
  cascade?: boolean;
  /** Custom cascade chain (defaults to CASCADE_CHAIN) */
  cascadeChain?: BenchModel[];
}

/**
 * Pre-create tenant rows in VaultCrux Postgres so the rate limiter FK doesn't reject.
 * Uses BENCH_VAULTCRUX_DB_URL env var or falls back to SSH + psql on CueCrux-Data-1.
 */
function provisionTenants(problems: LmeProblem[], dataset: string): void {
  const tenantIds = problems.map((p) => `__longmemeval_${dataset}_${p.problemId}`);
  // Also provision the probe tenant
  tenantIds.push("__longmemeval_probe");

  // Build a single VALUES clause
  const values = tenantIds
    .map((id) => `('${id}', 'LongMemEval Benchmark ${id}')`)
    .join(",\n    ");
  const sql = `INSERT INTO tenants (id, name) VALUES\n    ${values}\n    ON CONFLICT (id) DO NOTHING;`;

  const dbUrl = process.env.BENCH_VAULTCRUX_DB_URL;
  try {
    if (dbUrl) {
      // Direct psql connection
      execSync(`psql "${dbUrl}" -c "${sql.replace(/"/g, '\\"')}"`, {
        timeout: 15000,
        stdio: "pipe",
      });
    } else {
      // SSH to CueCrux-Data-1 (Tailscale)
      // Write SQL to temp file to avoid shell quoting issues
      const tmpSql = `/tmp/lme-provision-${Date.now()}.sql`;
      writeFileSync(tmpSql, sql, "utf-8");
      execSync(`cat ${tmpSql} | ssh -o ConnectTimeout=5 root@100.75.64.43 "docker exec -i postgres-vaultcrux psql -U vaultcrux -d vaultcrux"`, {
        timeout: 15000,
        stdio: "pipe",
      });
      unlinkSync(tmpSql);
    }
    console.log(`[provision] Created ${tenantIds.length} tenant rows`);
  } catch (err) {
    console.warn(`[provision] Warning: could not provision tenants:`, err instanceof Error ? err.message : String(err));
    console.warn(`[provision] Set BENCH_VAULTCRUX_DB_URL or ensure SSH access to CueCrux-Data-1`);
  }
}

/**
 * Execute the full benchmark run for a set of problems.
 */
export async function executeRun(
  problems: LmeProblem[],
  config: OrchestratorConfig,
): Promise<LmeRunSummary> {
  const startTime = Date.now();
  const answers: LmeAnswer[] = [];
  let totalCost = 0;

  console.log(`\n[run] ${config.manifest.runId}`);
  console.log(`[run] Dataset: ${config.manifest.dataset} | Arm: ${config.manifest.arm} | Model: ${config.manifest.model}`);
  console.log(`[run] Problems: ${problems.length}\n`);

  // Pre-provision tenants for VaultCrux arms
  if (config.armConfig.needsVaultCrux) {
    provisionTenants(problems, config.manifest.dataset);
  }

  const concurrency = config.concurrency ?? 1;
  let budgetExceeded = false;
  let completedCount = 0;

  async function processProblem(i: number): Promise<LmeAnswer | null> {
    const problem = problems[i];

    // Budget guard (approximate — checked per-completion, not per-start)
    if (budgetExceeded) return null;

    // Create per-problem proxy for treatment arms
    let proxy: McProxy | undefined;
    if (config.armConfig.needsVaultCrux) {
      const tenantId = `__longmemeval_${config.manifest.dataset}_${problem.problemId}`;
      proxy = new McProxy({
        apiBase: config.benchConfig.vaultcruxApiBase,
        apiKey: config.benchConfig.vaultcruxApiKey,
        tenantId,
        agentId: "longmemeval-bench",
        timeoutMs: config.benchConfig.timeoutMs,
      });

      if (!config.manifest.skipSeed) {
        const useCorecrux = process.env.LME_INGEST_BACKEND === "corecrux";

        if (useCorecrux) {
          // CoreCrux v5 ingest path — append to spine, seal, .ccxi
          console.log(`[${i + 1}/${problems.length}] ${problem.problemId} — seeding ${problem.sessions.length} sessions via CoreCrux...`);
          const result = await ingestProblemViaCorecrux(problem, tenantId);
          console.log(`[${i + 1}/${problems.length}] ${problem.problemId} — ${result.seeded}/${problem.sessions.length} seeded in ${(result.durationMs / 1000).toFixed(1)}s`);
          if (result.failed > 0) {
            console.warn(`[${i + 1}/${problems.length}] ${problem.problemId} — WARNING: ${result.failed} sessions failed`);
          }
          await waitForCorecruxIndex(problem.sessions.length);
          const verified = await verifyCorecruxIngestion(tenantId, problem.question);
          if (!verified) {
            console.warn(`[${i + 1}/${problems.length}] ${problem.problemId} — WARNING: CoreCrux verification returned no results`);
          }
        } else {
          // Legacy VaultCrux Postgres ingest path
          console.log(`[${i + 1}/${problems.length}] ${problem.problemId} — seeding ${problem.sessions.length} sessions...`);
          const result = await ingestProblem(proxy, problem);
          console.log(`[${i + 1}/${problems.length}] ${problem.problemId} — ${result.seeded}/${result.totalSessions} seeded in ${(result.durationMs / 1000).toFixed(1)}s`);
          if (result.failed > 0) {
            console.warn(`[${i + 1}/${problems.length}] ${problem.problemId} — WARNING: ${result.failed} sessions failed`);
          }
          await waitForEmbeddings(problem.sessions.length);
          const verified = await verifyIngestion(proxy, problem.question);
          if (!verified) {
            console.warn(`[${i + 1}/${problems.length}] ${problem.problemId} — WARNING: verification returned no results`);
          }
        }
      }
    }

    // Answer the question — cascade mode uses tiered model escalation
    const answer = config.cascade
      ? await answerQuestionCascade(problem, config, proxy, config.cascadeChain)
      : await answerQuestion(problem, config, proxy);
    completedCount++;

    console.log(`[${completedCount}/${problems.length}] ${problem.problemId} (${problem.questionType}) → ${answer.hypothesis.slice(0, 60)}... [${answer.turns}t, ${answer.toolCalls}tc, $${answer.costUsd.toFixed(4)}]`);
    return answer;
  }

  if (concurrency <= 1) {
    // Serial execution (original behaviour)
    for (let i = 0; i < problems.length; i++) {
      if (config.manifest.budgetLimitUsd && totalCost >= config.manifest.budgetLimitUsd) {
        console.log(`[run] Budget limit reached ($${totalCost.toFixed(2)} >= $${config.manifest.budgetLimitUsd}). Stopping.`);
        break;
      }
      const answer = await processProblem(i);
      if (answer) {
        answers.push(answer);
        totalCost += answer.costUsd;
        config.onAnswer?.(answer);
      }
    }
  } else {
    // Concurrent execution with worker pool
    console.log(`[run] Concurrency: ${concurrency} workers\n`);
    let nextIndex = 0;

    async function worker(): Promise<void> {
      while (nextIndex < problems.length && !budgetExceeded) {
        const i = nextIndex++;
        if (i >= problems.length) break;

        const answer = await processProblem(i);
        if (answer) {
          answers.push(answer);
          totalCost += answer.costUsd;
          config.onAnswer?.(answer);

          if (config.manifest.budgetLimitUsd && totalCost >= config.manifest.budgetLimitUsd) {
            console.log(`[run] Budget limit reached ($${totalCost.toFixed(2)} >= $${config.manifest.budgetLimitUsd}). Stopping.`);
            budgetExceeded = true;
          }
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  }

  const durationSeconds = Math.round((Date.now() - startTime) / 1000);

  const summary: LmeRunSummary = {
    runId: config.manifest.runId,
    dataset: config.manifest.dataset,
    arm: config.manifest.arm,
    model: config.manifest.model,
    timestamp: new Date().toISOString(),
    durationSeconds,
    totalQuestions: answers.length,
    answers,
    usage: {
      totalInputTokens: answers.reduce((s, a) => s + a.inputTokens, 0),
      totalOutputTokens: answers.reduce((s, a) => s + a.outputTokens, 0),
      totalCachedTokens: answers.reduce((s, a) => s + a.cachedTokens, 0),
      totalCostUsd: totalCost,
    },
  };

  console.log(`\n[run] Complete: ${answers.length} questions, $${totalCost.toFixed(2)}, ${durationSeconds}s`);
  return summary;
}

const ENABLE_TRACE = process.env.BENCH_TRACE !== "0"; // on by default
const ENABLE_REFLECTION = process.env.BENCH_REFLECTION !== "0"; // on by default

const REFLECTION_PROMPT = `PAUSE. Before giving your final answer, reflect:

1. WHAT DID I FIND? List the key facts, items, or events retrieved.
2. IS MY COUNT COMPLETE? If counting, enumerate every item numbered. Is this plausibly ALL of them?
3. CONFIDENCE (1-10)? Rate honestly.

If confident (7+): Give your final answer now. Do NOT search again.
If NOT confident AND you can name a SPECIFIC different query that would help: Make ONE more tool call with that specific query.
If NOT confident but you've already searched 3+ times with varied terms: Give your best answer from what you found. Say "Based on available conversations" — do NOT say "I wasn't able to find".

IMPORTANT: Do NOT repeat a search you already did with slightly different words. That wastes a tool call and finds the same results.`;

/**
 * Answer a single question using the configured arm.
 * Now with full tool trace capture and optional reflection loop.
 */
async function answerQuestion(
  problem: LmeProblem,
  config: OrchestratorConfig,
  proxy?: McProxy,
): Promise<LmeAnswer> {
  const tenantId = `__longmemeval_${config.manifest.dataset}_${problem.problemId}`;
  const classification = classifyQuestion(problem.question);

  // M9: Playbook Engine — select per-question-type retrieval recipe
  const playbook = isPlaybookEngineEnabled()
    ? selectPlaybook(problem.question, problem.questionType)
    : null;

  const isComplex = playbook
    ? playbook.id !== "simple_recall"
    : classification.complexity === "complex";

  let systemPrompt = playbook
    ? await buildPlaybookPrompt(playbook, problem, tenantId)
    : await buildSystemPrompt(config.armConfig, problem, tenantId);

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: problem.question },
  ];

  // M9: Filter tools based on playbook's allowedTools (if playbook is active)
  const filteredToolDefs = playbook
    ? config.toolDefs.filter((t) => playbook.tools.allowedTools.includes(t.name) || LOCAL_TOOLS.has(t.name))
    : config.toolDefs;
  const tools = filteredToolDefs.length > 0 ? filteredToolDefs : undefined;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  let totalLatencyMs = 0;
  let toolCallCount = 0;
  let turnCount = 0;
  const receiptChainIds: string[] = [];
  const toolTrace: LmeToolStep[] = [];
  let reflection: LmeReflection | undefined;

  let draftHypothesis: string | null = null;
  let reflected = false;

  for (let turn = 0; turn < MAX_TURNS_PER_QUESTION; turn++) {
    const result = await config.adapter.chat(messages, tools, {
      temperature: 0.3,
      maxTokens: 1024,
    });

    totalInputTokens += result.inputTokens;
    totalOutputTokens += result.outputTokens;
    totalCachedTokens += result.cachedTokens;
    totalLatencyMs += result.latencyMs;
    turnCount++;

    // Handle tool calls
    if (result.toolUse.length > 0 && proxy) {
      // Capture agent reasoning (text before/alongside tool calls)
      const agentReasoning = result.content.trim();

      messages.push({
        role: "assistant",
        content: result.content,
        toolCalls: result.toolUse,
      });

      for (const tc of result.toolUse) {
        toolCallCount++;
        const toolStart = Date.now();

        let toolResult: unknown;

        // Handle local tools (run in benchmark process, not on VaultCrux)
        if (LOCAL_TOOLS.has(tc.name)) {
          if (tc.name === "date_diff") {
            toolResult = handleDateDiff(tc.input);
          } else if (tc.name === "research_memory" && proxy) {
            toolResult = await handleResearchMemory(tc.input, proxy);
          } else if (tc.name === "get_session_by_id" && proxy) {
            toolResult = await handleGetSessionById(tc.input, proxy);
          } else if (tc.name === "structured_query") {
            toolResult = await handleStructuredQuery(tc.input, config.manifest.dataset, problem.problemId, proxy);
          } else if (tc.name === "enumerate_memory_facts") {
            const tenantId = `__longmemeval_${config.manifest.dataset}_${problem.problemId}`;
            toolResult = await callFactApi("enumerate", { query: tc.input.query, limit: tc.input.limit }, tenantId);
          } else if (tc.name === "build_timeline") {
            const tenantId = `__longmemeval_${config.manifest.dataset}_${problem.problemId}`;
            toolResult = await callFactApi("timeline", { query: tc.input.query, relation: tc.input.relation }, tenantId);
          } else if (tc.name === "expand_hit_context") {
            const tenantId = `__longmemeval_${config.manifest.dataset}_${problem.problemId}`;
            toolResult = await callFactApi("expand", { hit_ids: tc.input.hit_ids, radius_turns: tc.input.radius_turns }, tenantId);
          } else if (tc.name === "assess_answerability") {
            const tenantId = `__longmemeval_${config.manifest.dataset}_${problem.problemId}`;
            toolResult = await callFactApi("answerability", { query: tc.input.query }, tenantId);
          } else if (tc.name === "derive_from_facts") {
            const tenantId = `__longmemeval_${config.manifest.dataset}_${problem.problemId}`;
            toolResult = await callFactApi("derive", { operation: tc.input.operation, rows: tc.input.rows }, tenantId);
          } else if (tc.name === "investigate_question") {
            const tenantId = `__longmemeval_${config.manifest.dataset}_${problem.problemId}`;
            const apiBase = process.env.BENCH_VAULTCRUX_API_BASE ?? "http://100.109.10.67:14333";
            const apiKey = process.env.BENCH_VAULTCRUX_API_KEY ?? "";
            // Use the original user question verbatim — model may paraphrase away ordering/temporal cues
            const questionForInvestigation = problem.question;
            try {
              const resp = await fetch(`${apiBase}/v1/memory/investigate`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-api-key": apiKey, "x-tenant-id": tenantId },
                body: JSON.stringify({ question: questionForInvestigation, question_date: tc.input.question_date }),
                signal: AbortSignal.timeout(20000),
              });
              if (resp.ok) { const d = await resp.json() as any; toolResult = d.data ?? d; }
              else toolResult = { error: `investigate API returned ${resp.status}` };
            } catch (err) { toolResult = { error: err instanceof Error ? err.message : String(err) }; }
          } else {
            toolResult = { error: `Local tool ${tc.name} requires proxy` };
          }
        } else if (proxy) {
          const record = await proxy.callTool(tc.name, tc.input);
          toolResult = record.result ?? record.error ?? "";

          // Capture receipt chain IDs from VaultCrux responses
          if (record.success && record.result) {
            const r = record.result as { receiptId?: string; receipt_id?: string };
            const receiptId = r.receiptId ?? r.receipt_id;
            if (receiptId) receiptChainIds.push(receiptId);
          }
        } else {
          toolResult = { error: "No proxy available" };
        }

        const toolDurationMs = Date.now() - toolStart;

        // Capture tool trace
        if (ENABLE_TRACE) {
          toolTrace.push({
            turn: turnCount,
            toolName: tc.name,
            toolArgs: tc.input,
            toolResult: truncateForTrace(toolResult),
            agentReasoning,
            durationMs: toolDurationMs,
          });
        }

        messages.push({
          role: "tool",
          content: JSON.stringify(toolResult),
          toolCallId: tc.id,
        });
      }

      continue; // Loop back for model to process tool results
    }

    // No tool calls — this is a text-only response (draft or final answer)
    const hypothesis = extractHypothesis(result.content);

    // Reflection: after first draft answer, inject self-critique prompt
    // Reflection only for complex questions — simple recall doesn't benefit and often regresses
    if (ENABLE_REFLECTION && isComplex && !reflected && toolCallCount > 0 && tools) {
      reflected = true;
      draftHypothesis = hypothesis;

      // Inject reflection prompt
      messages.push({
        role: "assistant",
        content: result.content,
      });
      messages.push({
        role: "user",
        content: REFLECTION_PROMPT,
      });

      // Get reflection response
      const reflectionResult = await config.adapter.chat(messages, tools, {
        temperature: 0.2,
        maxTokens: 1024,
      });

      totalInputTokens += reflectionResult.inputTokens;
      totalOutputTokens += reflectionResult.outputTokens;
      totalCachedTokens += reflectionResult.cachedTokens;
      totalLatencyMs += reflectionResult.latencyMs;
      turnCount++;

      const critique = reflectionResult.content.trim();
      const continuedSearching = reflectionResult.toolUse.length > 0;

      if (continuedSearching && proxy) {
        // Agent wants to search more — process tool calls
        messages.push({
          role: "assistant",
          content: reflectionResult.content,
          toolCalls: reflectionResult.toolUse,
        });

        for (const tc of reflectionResult.toolUse) {
          toolCallCount++;
          const toolStart = Date.now();

          let toolResult: unknown;
          if (LOCAL_TOOLS.has(tc.name)) {
            const tenantId = `__longmemeval_${config.manifest.dataset}_${problem.problemId}`;
            if (tc.name === "date_diff") toolResult = handleDateDiff(tc.input);
            else if (tc.name === "research_memory" && proxy) toolResult = await handleResearchMemory(tc.input, proxy);
            else if (tc.name === "get_session_by_id" && proxy) toolResult = await handleGetSessionById(tc.input, proxy);
            else if (tc.name === "structured_query") toolResult = await handleStructuredQuery(tc.input, config.manifest.dataset, problem.problemId, proxy);
            else if (tc.name === "enumerate_memory_facts") toolResult = await callFactApi("enumerate", { query: tc.input.query, limit: tc.input.limit }, tenantId);
            else if (tc.name === "build_timeline") toolResult = await callFactApi("timeline", { query: tc.input.query, relation: tc.input.relation }, tenantId);
            else if (tc.name === "expand_hit_context") toolResult = await callFactApi("expand", { hit_ids: tc.input.hit_ids, radius_turns: tc.input.radius_turns }, tenantId);
            else if (tc.name === "assess_answerability") toolResult = await callFactApi("answerability", { query: tc.input.query }, tenantId);
            else if (tc.name === "derive_from_facts") toolResult = await callFactApi("derive", { operation: tc.input.operation, rows: tc.input.rows }, tenantId);
            else toolResult = { error: `Local tool ${tc.name} requires proxy` };
          } else if (proxy) {
            const record = await proxy.callTool(tc.name, tc.input);
            toolResult = record.result ?? record.error ?? "";
          } else {
            toolResult = { error: "No proxy available" };
          }

          if (ENABLE_TRACE) {
            toolTrace.push({
              turn: turnCount,
              toolName: tc.name,
              toolArgs: tc.input,
              toolResult: truncateForTrace(toolResult),
              agentReasoning: `[REFLECTION] ${critique.slice(0, 200)}`,
              durationMs: Date.now() - toolStart,
            });
          }

          messages.push({
            role: "tool",
            content: JSON.stringify(toolResult),
            toolCallId: tc.id,
          });
        }

        // Get final answer after reflection search
        const finalResult = await config.adapter.chat(messages, undefined, {
          temperature: 0.3,
          maxTokens: 1024,
        });

        totalInputTokens += finalResult.inputTokens;
        totalOutputTokens += finalResult.outputTokens;
        totalCachedTokens += finalResult.cachedTokens;
        totalLatencyMs += finalResult.latencyMs;
        turnCount++;

        const revisedAnswer = extractHypothesis(finalResult.content);

        reflection = {
          draftAnswer: draftHypothesis!,
          reflectionPrompt: REFLECTION_PROMPT,
          critique,
          continuedSearching: true,
          revisedAnswer,
        };

        const costUsd = estimateCost(config.manifest.model as BenchModel, totalInputTokens, totalOutputTokens, totalCachedTokens);
        return {
          questionId: problem.problemId,
          questionType: problem.questionType,
          hypothesis: revisedAnswer,
          receiptChainIds,
          toolCalls: toolCallCount,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cachedTokens: totalCachedTokens,
          latencyMs: totalLatencyMs,
          costUsd,
          turns: turnCount,
          toolTrace: ENABLE_TRACE ? toolTrace : undefined,
          reflection,
        };
      }

      // Agent was confident — reflection didn't trigger more searches
      // Check if the reflection itself contains a revised answer
      const revisedAnswer = extractHypothesis(critique);
      const answerChanged = revisedAnswer.length > 20 && revisedAnswer !== critique;

      reflection = {
        draftAnswer: draftHypothesis!,
        reflectionPrompt: REFLECTION_PROMPT,
        critique,
        continuedSearching: false,
        revisedAnswer: answerChanged ? revisedAnswer : draftHypothesis!,
      };

      const costUsd = estimateCost(config.manifest.model as BenchModel, totalInputTokens, totalOutputTokens, totalCachedTokens);
      return {
        questionId: problem.problemId,
        questionType: problem.questionType,
        hypothesis: reflection.revisedAnswer,
        receiptChainIds,
        toolCalls: toolCallCount,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cachedTokens: totalCachedTokens,
        latencyMs: totalLatencyMs,
        costUsd,
        turns: turnCount,
        toolTrace: ENABLE_TRACE ? toolTrace : undefined,
        reflection,
      };
    }

    // No reflection (C0/C2 arms or reflection disabled) — return directly
    const costUsd = estimateCost(config.manifest.model as BenchModel, totalInputTokens, totalOutputTokens, totalCachedTokens);
    return {
      questionId: problem.problemId,
      questionType: problem.questionType,
      hypothesis,
      receiptChainIds,
      toolCalls: toolCallCount,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cachedTokens: totalCachedTokens,
      latencyMs: totalLatencyMs,
      costUsd,
      turns: turnCount,
      toolTrace: ENABLE_TRACE ? toolTrace : undefined,
    };
  }

  // Hit max turns — extract whatever we have
  const lastMsg = messages[messages.length - 1];
  const hypothesis = lastMsg?.role === "assistant"
    ? extractHypothesis(lastMsg.content)
    : "[max turns exceeded]";

  return {
    questionId: problem.problemId,
    questionType: problem.questionType,
    hypothesis,
    receiptChainIds,
    toolCalls: toolCallCount,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cachedTokens: totalCachedTokens,
    latencyMs: totalLatencyMs,
    costUsd: estimateCost(config.manifest.model as BenchModel, totalInputTokens, totalOutputTokens, totalCachedTokens),
    turns: turnCount,
    toolTrace: ENABLE_TRACE ? toolTrace : undefined,
  };
}

/** Truncate tool results for trace storage — keep structure but cap content length */
function truncateForTrace(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const str = JSON.stringify(result);
  if (str.length <= 2000) return result;
  // Truncate individual content fields to keep trace manageable
  const r = result as Record<string, unknown>;
  const truncated: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "string" && v.length > 500) {
      truncated[k] = v.slice(0, 500) + `... [truncated, ${v.length} chars total]`;
    } else if (Array.isArray(v) && v.length > 10) {
      truncated[k] = [...v.slice(0, 10), `... [${v.length} items total]`];
    } else {
      truncated[k] = v;
    }
  }
  return truncated;
}

/**
 * Extract the hypothesis from the model's text response.
 * Strips common preambles like "Based on the conversation history..."
 */
function extractHypothesis(text: string): string {
  // The model's response IS the hypothesis. Minimal cleanup.
  return text.trim();
}

// ── Cascade model escalation ──

// ── Verification gate ──
//
// Models are confidently wrong on certain question types. The gate checks:
// 1. Aggregation: "how many", "how much", "total" — model overcounts/undercounts
// 2. Temporal ordering: "what order", "earliest to latest" — model gets sequence wrong
// 3. Knowledge-update with contradiction: "most recent", "current" — model picks stale value
// 4. Abstention signals: answer says "no information" but question implies data should exist
//
// Gate fires AFTER confidence check. If triggered, forces escalation to next tier
// even if the model self-assessed high confidence.

interface GateResult {
  escalate: boolean;
  reason: string;
}

const AGGREGATION_GATE = [
  /\bhow many\b/i, /\bhow much\b/i, /\btotal\b/i, /\bcombined\b/i,
  /\bin total\b/i, /\bcount\b/i, /\blist all\b/i, /\baltogether\b/i,
];

const ORDERING_GATE = [
  /\bwhat (is the )?order\b/i, /\bfrom earliest\b/i, /\bfrom latest\b/i,
  /\bearlieset to latest\b/i, /\bchronological\b/i,
  /\bwhich (came|happened) first\b/i, /\bbefore.*or.*after\b/i,
];

const KNOWLEDGE_UPDATE_GATE = [
  /\bmost recent\b/i, /\bcurrently\b/i, /\bwhat is my current\b/i,
  /\bwhere did .* move\b/i, /\bstarted using\b/i,
];

const ABSTENTION_SIGNALS = [
  /\bno information\b/i, /\bunable to find\b/i, /\bcouldn't find\b/i,
  /\bcould not find\b/i, /\binsufficient\b/i, /\bno relevant\b/i,
  /\bno records?\b/i, /\bno mention\b/i,
];

function verificationGate(question: string, hypothesis: string, tier?: number): GateResult {
  // A1: Aggregation questions always escalate (even at tier 0) because Haiku
  // confidently miscounts cross-session items. 9 of 33 persistent multi-session
  // failures were SHALLOW_PATH — Haiku answered with a single query_memory call.
  const isAggregation = AGGREGATION_GATE.some((p) => p.test(question));
  if (isAggregation) {
    return { escalate: true, reason: "aggregation_question — counting errors are common, escalating for verification" };
  }

  // For non-aggregation gates, only fire at tier 1+ (Sonnet).
  // At tier 0, the confidence check alone handles escalation.
  if (tier !== undefined && tier < 1) {
    return { escalate: false, reason: "" };
  }

  // Gate 2: Temporal ordering — model often gets sequence wrong
  const isOrdering = ORDERING_GATE.some((p) => p.test(question));
  if (isOrdering) {
    return { escalate: true, reason: "ordering_question — sequence errors are common, escalating for verification" };
  }

  // Gate 3: Knowledge-update — model might pick stale value
  const isKnowledgeUpdate = KNOWLEDGE_UPDATE_GATE.some((p) => p.test(question));
  if (isKnowledgeUpdate) {
    return { escalate: true, reason: "knowledge_update_question — stale value risk, escalating for verification" };
  }

  // Gate 4: Abstention on a question that implies data should exist
  const isAbstaining = ABSTENTION_SIGNALS.some((p) => p.test(hypothesis));
  const impliesDataExists = /\bI\b.*\b(did|went|bought|attended|mentioned|told|said)\b/i.test(question)
    || /\bmy\b.*\b(trip|visit|purchase|event|class|session)\b/i.test(question);
  if (isAbstaining && impliesDataExists) {
    return { escalate: true, reason: "abstention_on_personal_question — model says 'no info' but question implies data exists" };
  }

  return { escalate: false, reason: "" };
}

/**
 * Emit an orchestration receipt to VaultCrux enrichment_receipts for each
 * cascade escalation decision. Non-blocking — failures are logged but don't
 * affect the benchmark.
 */
async function emitOrchestrationReceipt(
  config: OrchestratorConfig,
  problem: LmeProblem,
  decision: {
    tier: number;
    model: string;
    confidence: number;
    disposition: string;
    costUsd: number;
    toolCalls: number;
    nextModel?: string;
  },
): Promise<void> {
  const apiBase = process.env.BENCH_VAULTCRUX_API_BASE ?? "http://100.109.10.67:14333";
  const apiKey = process.env.BENCH_VAULTCRUX_API_KEY ?? "";
  const tenantId = `__longmemeval_${config.manifest.dataset}_${problem.problemId}`;

  try {
    await fetch(`${apiBase}/v1/memory/facts/enumerate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-tenant-id": tenantId,
        "x-orchestration-receipt": JSON.stringify({
          type: "cascade_escalation",
          questionId: problem.problemId,
          tier: decision.tier,
          model: decision.model,
          confidence: decision.confidence,
          disposition: decision.disposition,
          costUsd: decision.costUsd,
          toolCalls: decision.toolCalls,
          nextModel: decision.nextModel ?? null,
          timestamp: new Date().toISOString(),
        }),
      },
      body: JSON.stringify({ query: "__orchestration_receipt_noop", limit: 1 }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Non-blocking — orchestration receipts are best-effort
  }
}

/** The model tower for cascade mode: cheap → mid → expensive */
export const CASCADE_CHAIN: BenchModel[] = [
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
];

/** Confidence threshold — escalate if self-assessed confidence is below this */
const CASCADE_CONFIDENCE_THRESHOLD = 7;

/**
 * Extract numeric confidence (1-10) from a reflection critique or answer text.
 * Looks for patterns like "CONFIDENCE: 8", "confidence: 3/10", "Confidence (1-10): 6".
 */
export function extractConfidence(text: string): number {
  // Direct "CONFIDENCE: N" or "confidence: N/10"
  const directMatch = text.match(/confidence[:\s]*(\d+)(?:\s*\/\s*10)?/i);
  if (directMatch) return Math.min(10, Math.max(1, parseInt(directMatch[1]!, 10)));

  // "I'm fairly confident" / "I'm not confident" heuristics
  if (/\b(very confident|highly confident|certain)\b/i.test(text)) return 9;
  if (/\b(fairly confident|reasonably confident)\b/i.test(text)) return 7;
  if (/\b(not confident|uncertain|unsure|not sure|insufficient|unable to find|couldn't find|no information)\b/i.test(text)) return 3;
  if (/\bbased on available conversations\b/i.test(text)) return 4;

  // No signal — default to moderate
  return 5;
}

/**
 * Extract confidence from a direct answer (no reflection critique available).
 * Uses answer text heuristics + tool call count to estimate confidence.
 * Higher baseline than extractConfidence() since a direct answer implies the model
 * found something and committed to it.
 */
function extractConfidenceFromAnswer(hypothesis: string, toolCalls: number): number {
  const h = hypothesis.toLowerCase();

  // C2: Tool narration leak — model emitted chain-of-thought instead of an answer.
  // Force escalation by returning very low confidence.
  if (/\b(let me search|let me try|the expand didn't return|let me get the full|let me look at)\b/.test(h)) return 1;

  // Strong uncertainty signals → low confidence, escalate
  if (/\b(no information|unable to find|couldn't find|could not find|not able to find|insufficient|i don't have|no relevant|no results)\b/.test(h)) return 2;
  if (/\b(i'm not sure|i am not sure|uncertain|unsure)\b/.test(h)) return 3;
  if (/\bbased on (the )?available conversations\b/.test(h)) return 4;

  // Hedging signals → moderate confidence
  if (/\b(might be|could be|possibly|perhaps|i think|it seems|appears to be)\b/.test(h)) return 5;

  // Model used tools and produced a specific answer → likely confident
  if (toolCalls > 0 && hypothesis.length > 30) return 8;

  // Model answered directly without tools (C0-style) → moderate
  if (toolCalls === 0 && hypothesis.length > 30) return 6;

  // Very short answer → uncertain
  if (hypothesis.length < 20) return 4;

  // Default: accept direct answers
  return 7;
}

/**
 * Answer a question using cascading model escalation.
 *
 * Starts with the cheapest model (Haiku). If confidence is low after
 * reflection, escalates to the next tier (Sonnet), then Opus.
 *
 * Key efficiency: higher tiers receive the full message history INCLUDING
 * tool results from tier 1. They don't re-query VaultCrux — they just
 * re-reason over the same evidence with a stronger model.
 */
export async function answerQuestionCascade(
  problem: LmeProblem,
  config: OrchestratorConfig,
  proxy: McProxy | undefined,
  chain: BenchModel[] = CASCADE_CHAIN,
): Promise<LmeAnswer> {
  const escalationSteps: LmeEscalationStep[] = [];
  let lastAnswer: LmeAnswer | null = null;

  for (let tier = 0; tier < chain.length; tier++) {
    const model = chain[tier]!;
    const isLastTier = tier === chain.length - 1;

    // Create adapter for this tier's model
    const tierAdapter = createAdapter(model, config.benchConfig);

    // Build a tier-specific config — swap the adapter and model name
    const tierConfig: OrchestratorConfig = {
      ...config,
      adapter: tierAdapter,
      manifest: {
        ...config.manifest,
        model,
      },
    };

    // Run the question through the standard answerQuestion flow
    const answer = await answerQuestion(problem, tierConfig, proxy);

    // Extract confidence from reflection critique (explicit) or answer text (heuristic).
    // If reflection happened, the critique has an explicit CONFIDENCE: N score.
    // If no reflection (simple question), use answer text heuristics with a higher baseline —
    // a direct answer from any model is more confident than the default.
    let confidence: number;
    if (answer.reflection?.critique) {
      confidence = extractConfidence(answer.reflection.critique);
    } else {
      // No reflection — use answer heuristics.
      // Direct answers with tool calls = model found something and answered.
      // Boost baseline for direct answers (default 7 = accept unless clear uncertainty).
      confidence = extractConfidenceFromAnswer(answer.hypothesis, answer.toolCalls);
    }

    // Determine disposition
    let disposition: LmeEscalationStep["disposition"];
    if (confidence >= CASCADE_CONFIDENCE_THRESHOLD || isLastTier) {
      disposition = isLastTier && confidence < CASCADE_CONFIDENCE_THRESHOLD
        ? "accepted_max_tier"
        : "accepted";
    } else {
      disposition = confidence <= 3 ? "escalated_unsure" : "escalated_low_confidence";
    }

    // ── Verification gate: override "accepted" for high-risk question types ──
    // Models are confidently wrong on counting, ordering, and knowledge-update questions.
    // If the question matches a gate pattern and we're NOT at the last tier, force escalation.
    if (disposition === "accepted" && !isLastTier) {
      const gateResult = verificationGate(problem.question, answer.hypothesis, tier);
      if (gateResult.escalate) {
        disposition = "escalated_gate_override";
        console.log(`[cascade] ${problem.problemId} GATE: ${gateResult.reason}`);
      }
    }

    escalationSteps.push({
      model,
      confidence,
      hypothesis: answer.hypothesis,
      disposition,
      inputTokens: answer.inputTokens,
      outputTokens: answer.outputTokens,
      cachedTokens: answer.cachedTokens,
      costUsd: answer.costUsd,
      latencyMs: answer.latencyMs,
      toolCalls: answer.toolCalls,
      turns: answer.turns,
    });

    const label = `[cascade] ${problem.problemId} tier=${tier} model=${model} confidence=${confidence} → ${disposition}`;
    console.log(label);

    // Emit orchestration receipt for this escalation decision
    void emitOrchestrationReceipt(config, problem, {
      tier,
      model,
      confidence,
      disposition,
      costUsd: answer.costUsd,
      toolCalls: answer.toolCalls,
      nextModel: !isLastTier && disposition.startsWith("escalated") ? chain[tier + 1] : undefined,
    });

    lastAnswer = answer;

    // If accepted, we're done
    if (disposition === "accepted" || disposition === "accepted_max_tier") {
      break;
    }

    // Otherwise, escalate — next tier will re-run the question from scratch
    // (the tool results from VaultCrux are cached server-side, so re-queries are fast)
  }

  // Build the final merged answer
  const finalStep = escalationSteps[escalationSteps.length - 1]!;
  const totalCost = escalationSteps.reduce((s, step) => s + step.costUsd, 0);
  const totalInput = escalationSteps.reduce((s, step) => s + step.inputTokens, 0);
  const totalOutput = escalationSteps.reduce((s, step) => s + step.outputTokens, 0);
  const totalCached = escalationSteps.reduce((s, step) => s + step.cachedTokens, 0);
  const totalLatency = escalationSteps.reduce((s, step) => s + step.latencyMs, 0);
  const totalToolCalls = escalationSteps.reduce((s, step) => s + step.toolCalls, 0);
  const totalTurns = escalationSteps.reduce((s, step) => s + step.turns, 0);

  const escalation: LmeEscalation = {
    chain: escalationSteps,
    finalTier: escalationSteps.length - 1,
    totalCostUsd: totalCost,
    escalated: escalationSteps.length > 1,
  };

  return {
    questionId: lastAnswer!.questionId,
    questionType: lastAnswer!.questionType,
    hypothesis: finalStep.hypothesis,
    receiptChainIds: lastAnswer!.receiptChainIds,
    toolCalls: totalToolCalls,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    cachedTokens: totalCached,
    latencyMs: totalLatency,
    costUsd: totalCost,
    turns: totalTurns,
    toolTrace: lastAnswer!.toolTrace,
    reflection: lastAnswer!.reflection,
    escalation,
  };
}
