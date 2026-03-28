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
import type { LmeAnswer, LmeArmConfig, LmeProblem, LmeRunManifest, LmeRunSummary } from "./types.js";
import { buildSystemPrompt } from "./system-prompts.js";
import { ingestProblem, waitForEmbeddings, verifyIngestion } from "./ingest-sessions.js";

const MAX_TURNS_PER_QUESTION = 10;

interface OrchestratorConfig {
  adapter: LlmAdapter;
  toolDefs: ToolDef[];
  armConfig: LmeArmConfig;
  manifest: LmeRunManifest;
  benchConfig: BenchConfig; // For creating per-problem proxies
  concurrency?: number;
  onAnswer?: (answer: LmeAnswer) => void;
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

    // Answer the question
    const answer = await answerQuestion(problem, config, proxy);
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

/**
 * Answer a single question using the configured arm.
 */
async function answerQuestion(
  problem: LmeProblem,
  config: OrchestratorConfig,
  proxy?: McProxy,
): Promise<LmeAnswer> {
  const systemPrompt = buildSystemPrompt(config.armConfig, problem);

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: problem.question },
  ];

  const tools = config.toolDefs.length > 0 ? config.toolDefs : undefined;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  let totalLatencyMs = 0;
  let toolCallCount = 0;
  let turnCount = 0;
  const receiptChainIds: string[] = [];

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
      messages.push({
        role: "assistant",
        content: result.content,
        toolCalls: result.toolUse,
      });

      for (const tc of result.toolUse) {
        toolCallCount++;
        const record = await proxy.callTool(tc.name, tc.input);

        // Capture receipt chain IDs from VaultCrux responses
        if (record.success && record.result) {
          const r = record.result as { receiptId?: string; receipt_id?: string };
          const receiptId = r.receiptId ?? r.receipt_id;
          if (receiptId) receiptChainIds.push(receiptId);
        }

        messages.push({
          role: "tool",
          content: JSON.stringify(record.result ?? record.error ?? ""),
          toolCallId: tc.id,
        });
      }

      continue; // Loop back for model to process tool results
    }

    // No tool calls — this is the final answer
    const hypothesis = extractHypothesis(result.content);
    const costUsd = estimateCost(
      config.manifest.model as BenchModel,
      totalInputTokens,
      totalOutputTokens,
      totalCachedTokens,
    );

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
    costUsd: estimateCost(
      config.manifest.model as BenchModel,
      totalInputTokens,
      totalOutputTokens,
      totalCachedTokens,
    ),
    turns: turnCount,
  };
}

/**
 * Extract the hypothesis from the model's text response.
 * Strips common preambles like "Based on the conversation history..."
 */
function extractHypothesis(text: string): string {
  // The model's response IS the hypothesis. Minimal cleanup.
  return text.trim();
}
