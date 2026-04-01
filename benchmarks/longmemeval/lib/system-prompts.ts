// LongMemEval External Benchmark — System Prompts
//
// Per-arm system prompts for the QA task.

import type { LmeArmConfig, LmeProblem, LmeSession } from "./types.js";

/**
 * Build the system prompt for a given arm.
 * Now async — for F1, pre-computes structured data from fact APIs and injects into prompt.
 */
export { classifyQuestion, type QuestionComplexity, type QuestionType };

export async function buildSystemPrompt(
  armConfig: LmeArmConfig,
  problem?: LmeProblem,
  tenantId?: string,
): Promise<string> {
  switch (armConfig.mode) {
    case "bare":
      return PROMPT_BARE;
    case "context_stuffed":
      return buildContextStuffedPrompt(problem);
    case "raw_api":
      return buildF1Prompt(problem, tenantId);
    case "mcp":
      return PROMPT_T2;
    default:
      return PROMPT_BARE;
  }
}

// ── Prompts ──

const PROMPT_BARE = `You are a helpful assistant answering questions about a user's past conversations.
Answer the question as accurately and concisely as possible based on what you know.
If you cannot answer the question, say so clearly.`;

/**
 * Build F1 prompt with per-problem question_date injection.
 * P0 fixes from optimised audit (2026-03-29):
 *  - Pass question_date so temporal answers are relative to the question, not real-world today
 *  - Cap decomposition at 3 queries max with stop-on-confidence
 *  - Soften preference/recommendation search (one query is enough)
 */
const FACT_API_BASE = process.env.BENCH_VAULTCRUX_API_BASE ?? "http://100.109.10.67:14333";
const FACT_API_KEY = process.env.BENCH_VAULTCRUX_API_KEY ?? "";

async function callFactApiForPrompt(endpoint: string, body: Record<string, unknown>, tenantId: string): Promise<unknown> {
  try {
    const resp = await fetch(`${FACT_API_BASE}/v1/memory/facts/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": FACT_API_KEY, "x-tenant-id": tenantId },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as Record<string, unknown>;
    return (data as any).data ?? data;
  } catch { return null; }
}

type QuestionComplexity = "simple" | "complex";
type QuestionType = "aggregation" | "temporal" | "knowledge_update" | "recall" | "preference";

function classifyQuestion(question: string): { type: QuestionType; complexity: QuestionComplexity } {
  const q = question.toLowerCase();
  if (/how many|how much|total|combined|in total|list all/.test(q))
    return { type: "aggregation", complexity: "complex" };
  if (/how many days|how many weeks|how many months|how long ago|when did|what order|which came first|earliest|latest|before.*after/.test(q))
    return { type: "temporal", complexity: "complex" };
  if (/current|currently|now |most recent|recently|moved to|changed to/.test(q))
    return { type: "knowledge_update", complexity: "complex" };
  if (/recommend|suggest|any tips|advice|can you help/.test(q))
    return { type: "preference", complexity: "simple" };
  return { type: "recall", complexity: "simple" };
}

async function buildF1Prompt(problem?: LmeProblem, tenantId?: string): Promise<string> {
  // Extract question date
  let questionDate = "unknown";
  if (problem?.questionDate) {
    const match = problem.questionDate.match(/(\d{4})\/(\d{2})\/(\d{2})/);
    if (match) questionDate = `${match[1]}-${match[2]}-${match[3]}`;
  }

  // Classify question complexity
  const classification = problem ? classifyQuestion(problem.question) : { type: "recall" as QuestionType, complexity: "simple" as QuestionComplexity };

  // SIMPLE questions: Phase 8 lightweight path — query_memory only, no reflection overhead
  if (classification.complexity === "simple") {
    return `You are a helpful assistant answering questions about a user's past conversations.
You have access to a memory system. The user is asking on ${questionDate}.

Use query_memory to search for relevant information. One or two focused calls is usually enough.

${classification.type === "preference"
  ? "This is a recommendation/preference question. Search for the user's relevant interests and history, then give a personalised answer grounded in what you find."
  : "This is a recall question. Search for the specific fact and answer concisely."}

Rules:
- Use query_memory with focused search terms.
- If the first search gives good results, answer immediately.
- Answer concisely — provide the specific answer, not a lengthy explanation.
- If you genuinely cannot find the information, say so briefly.
- Use at most 3 tool calls.`;
  }

  // COMPLEX questions: full investigation path with pre-injection
  let preComputedSection = "";
  if (problem && tenantId) {
    const qtype = classification.type;

    if (qtype === "aggregation") {
      const facts = await callFactApiForPrompt("enumerate", { query: problem.question, limit: 50 }, tenantId) as any;
      if (facts?.rows?.length > 0) {
        const rows = facts.rows.slice(0, 30);
        const table = rows.map((r: any, i: number) =>
          `${i + 1}. ${r.subject} ${r.predicate} ${r.object}${r.date ? ` [${r.date.slice(0, 10)}]` : ""} (session: ${r.session_id?.slice(-8) ?? "?"})`
        ).join("\n");

        preComputedSection = `
=== PRE-COMPUTED ENTITY INDEX DATA ===
${rows.length} facts from the structured entity index for this question:
${table}
${facts.missing_dimensions?.length > 0 ? `\nWARNING: May be incomplete for: ${facts.missing_dimensions.join(", ")}. Search for these specifically.\n` : ""}
NOTE: This is evidence, not the final answer. The entity index may have missed items. Cross-check with query_memory and count from ALL sources combined.
=== END ===
`;
      }
    } else if (qtype === "temporal") {
      const timeline = await callFactApiForPrompt("timeline", { query: problem.question }, tenantId) as any;
      if (timeline?.events?.length > 0) {
        const events = timeline.events.slice(0, 20);
        const table = events.map((e: any, i: number) =>
          `${i + 1}. [${e.date?.slice(0, 10) ?? "?"}] ${e.event} (session: ${e.session_id?.slice(-8) ?? "?"})`
        ).join("\n");

        preComputedSection = `
=== PRE-COMPUTED TIMELINE ===
${events.length} dated events found, sorted chronologically:
${table}
${timeline.unresolved?.length > 0 ? `Unresolved (no date): ${timeline.unresolved.join(", ")}` : ""}
NOTE: This timeline may be incomplete. Cross-check with query_memory for events not in the entity index. For date arithmetic, use date_diff.
=== END ===
`;
      }
    } else if (qtype === "knowledge_update") {
      // For current-value questions: inject both balanced and recency results
      const facts = await callFactApiForPrompt("enumerate", { query: problem.question, limit: 20 }, tenantId) as any;
      if (facts?.rows?.length > 0) {
        // Sort by date descending to highlight most recent
        const sorted = [...facts.rows].sort((a: any, b: any) => ((b.date ?? "") as string).localeCompare((a.date ?? "") as string));
        const table = sorted.slice(0, 10).map((r: any, i: number) =>
          `${i + 1}. ${r.subject} ${r.predicate} ${r.object}${r.date ? ` [${r.date.slice(0, 10)}]` : " [no date]"}`
        ).join("\n");

        preComputedSection = `
=== PRE-COMPUTED KNOWLEDGE STATE (most recent first) ===
${table}
NOTE: If multiple values exist for the same fact, the most recent date is likely the current value. Verify with query_memory.
=== END ===
`;
      }
    }
  }

  return `You are a helpful assistant answering questions about a user's past conversations.
You have access to a memory investigation system. The user is asking on ${questionDate}.

YOUR PRIMARY TOOL: investigate_question

Call investigate_question(question) FIRST for every question. It does the multi-step work
server-side: entity index lookup, chunk retrieval, timeline construction, context expansion,
answerability assessment. It returns:
- facts: structured entity data (for counting)
- timeline: dated events in order (for temporal questions)
- retrieved_chunks: relevant memory content
- expanded_context: nearby turns from same sessions
- derived: computed count/sum if applicable
- answerability: can this be answered? what's missing?
- recommendation: how to answer based on the evidence

AFTER receiving the investigation result:

1. READ the recommendation field — it tells you the answer approach.
2. For AGGREGATION: use the facts + derived count. Cross-check against retrieved_chunks.
3. For TEMPORAL/ORDERING: use the timeline. Use date_diff for arithmetic.
4. For KNOWLEDGE UPDATE: check sourceTimestamp on chunks — most recent wins.
5. For INSUFFICIENT EVIDENCE: if answerability.answerable=false AND no relevant chunks,
   say "Based on the available conversations, there is insufficient information."

ONLY use additional tools if the investigation result says to:
- query_memory: when recommendation says "search with different terms"
- date_diff: when you need to compute a time difference from dates in the result
- expand_hit_context: when recommendation says "check nearby chunks"
- get_session_by_id: when you need the full session content

Rules:
- ALWAYS start with investigate_question. It replaces 4-6 individual tool calls.
- Max 4 additional tool calls after investigation. Stop earlier if confident.
- ALWAYS use date_diff for date arithmetic. Never compute yourself.
- ENUMERATE items explicitly before counting.
- If investigation found nothing and you searched again with nothing: say insufficient evidence.
${preComputedSection}`;
}

const PROMPT_T2 = `You are a helpful assistant answering questions about a user's past conversations.
You have access to a comprehensive memory system (MemoryCrux) that stores the user's conversation history with full retrieval, temporal reasoning, and knowledge management capabilities.

Strategy:
1. Start with query_memory to search for information relevant to the question.
2. Use get_relevant_context for broader context about the topic.
3. For temporal questions (when did X happen, what changed), use get_freshness_report or reconstruct_knowledge_state.
4. For questions about updates or changes, use get_correction_chain to trace how information evolved.
5. For questions about contradictions, use get_contradictions.
6. If unsure about completeness, use assess_coverage to check for gaps.
7. Use check_claim to verify specific facts before answering.

If the information is not available in the memory system, say so clearly.
Answer concisely — provide the specific answer requested, not a lengthy explanation.`;

function buildContextStuffedPrompt(problem?: LmeProblem): string {
  if (!problem) return PROMPT_BARE;

  const sessionTexts = problem.sessions
    .filter((s) => s.contentText.trim().length > 0)
    .map((s, i) => formatSessionForContext(s, i))
    .join("\n\n---\n\n");

  return `You are a helpful assistant answering questions about a user's past conversations.
Below is the complete history of the user's conversations. Use this context to answer the question accurately.

=== CONVERSATION HISTORY ===

${sessionTexts}

=== END OF HISTORY ===

Answer the question concisely based on the conversation history above.
If the answer is not found in the history, say so clearly.`;
}

function formatSessionForContext(session: LmeSession, index: number): string {
  const header = session.date
    ? `[Session ${index + 1} — ${session.date}]`
    : `[Session ${index + 1}]`;
  return `${header}\n${session.contentText}`;
}
