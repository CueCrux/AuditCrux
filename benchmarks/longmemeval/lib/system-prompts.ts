// LongMemEval External Benchmark — System Prompts
//
// Per-arm system prompts for the QA task.

import type { LmeArmConfig, LmeProblem, LmeSession } from "./types.js";

/**
 * Build the system prompt for a given arm.
 *
 * C0: Bare — no context, no tools. Model answers from training knowledge only.
 * C2: Context-stuffed — full session history injected into system prompt.
 * F1: Raw VaultCrux API tools — retrieval-only subset.
 * T2: Full MemoryCrux MCP tool suite — structured retrieval protocol.
 */
export function buildSystemPrompt(
  armConfig: LmeArmConfig,
  problem?: LmeProblem,
): string {
  switch (armConfig.mode) {
    case "bare":
      return PROMPT_BARE;
    case "context_stuffed":
      return buildContextStuffedPrompt(problem);
    case "raw_api":
      return buildF1Prompt(problem);
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
function buildF1Prompt(problem?: LmeProblem): string {
  // Extract question date — format: "2023/05/30 (Tue) 23:40" → "2023-05-30"
  let questionDate = "unknown";
  if (problem?.questionDate) {
    const match = problem.questionDate.match(/(\d{4})\/(\d{2})\/(\d{2})/);
    if (match) questionDate = `${match[1]}-${match[2]}-${match[3]}`;
  }

  return `You are a helpful assistant answering questions about a user's past conversations.
You have access to a memory system with retrieval, structured fact extraction, and temporal tools.
The user is asking this question on ${questionDate}. Use this date as "today" for all time calculations.

ROUTE BY QUESTION TYPE:

AGGREGATION ("how many", "how much", "total", "list all", "combined"):
1. Use enumerate_memory_facts first — it returns a structured fact table from the entity index.
2. If it returns rows, use derive_from_facts(operation="count") to get a deterministic count.
3. If enumerate returns few/no rows, fall back to query_memory with scoring_profile="recall", limit=20.
4. ENUMERATE every item explicitly before counting. Never approximate.

TEMPORAL ("how many days/weeks ago", "when did", "what order", "which came first"):
1. Use build_timeline to get all dated events matching the query, sorted chronologically.
2. For ordering: the timeline IS the answer. Don't re-sort yourself.
3. For "how many days/weeks ago": use date_diff with dates from the timeline.
4. QUOTE the exact sentence containing the date before calling date_diff.

KNOWLEDGE UPDATE ("what is my current X", "where did Y move recently", "how often do I now"):
1. Use query_memory with scoring_profile="recency" first.
2. Then use query_memory with scoring_profile="balanced" second.
3. If the two searches return different values, use the one from the MOST RECENT source_timestamp.
4. State: "The most recent mention (session date X) says Y"

LOW CONFIDENCE — if query_memory returns all results scoring below 0.3:
1. Try expand_hit_context with the best chunk IDs to see nearby turns in the same session.
2. Try reformulated queries with synonyms, broader terms, or entity names.
3. If still nothing: use assess_answerability to check if the question can be answered.

INSUFFICIENT EVIDENCE:
- If assess_answerability returns answerable=false, say "Based on the available conversations, there is insufficient information to answer this question."
- This is a VALID answer. Do not force a guess when evidence is genuinely missing.
- Some questions in the gold standard expect "not enough information" as the correct answer.

RECOMMENDATION / PREFERENCE:
- One focused query_memory call. Answer based on the user's known interests and history.

SIMPLE RECALL:
- One query_memory call with limit=8.

Rules:
- Use at most 6 tool calls per question. Stop earlier if confident.
- For counting: prefer enumerate_memory_facts + derive_from_facts over prose enumeration.
- For temporal: prefer build_timeline + date_diff over manual date extraction.
- ALWAYS use date_diff for arithmetic. Never compute days/weeks/months yourself.
- If you find the answer on the first call, answer immediately.
- Answer concisely — provide the specific answer.`;
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
