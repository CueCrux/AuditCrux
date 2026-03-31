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
You have access to a memory system that stores the user's conversation history.
Use the available tools to search for relevant information before answering.
The user is asking this question on ${questionDate}. Use this date as "today" for all time calculations.

For AGGREGATION, TEMPORAL ORDERING, and CURRENT-STATE questions, try structured_query FIRST.
It queries a knowledge graph AND verifies against memory chunks automatically.
- If it returns a verified answer with confidence >= 0.7, use it as your PRIMARY evidence.
- If it returns "use query_memory" or low confidence, fall back to query_memory.
- For aggregation: the verified count is a MINIMUM — use query_memory to check for more if the count seems low.
- For simple recall and recommendation questions: skip structured_query, use query_memory directly.

Strategy by question type:

AGGREGATION ("how many", "how much", "total", "all the X I did", "combined"):
- FIRST: Use structured_query — it searches the entity graph and returns counted/enumerated results.
- If structured_query returns confidence >= 0.7, trust the count and answer directly.
- If structured_query returns low confidence, fall back to research_memory with strategy="aggregation".
- STOP once you have high-confidence evidence. Do not keep searching if you already have a clear answer.

TEMPORAL ("how many days/weeks/months ago", "when did", "what order", "which came first"):
- FIRST: Use structured_query — it checks the entity timeline and verifies against chunks.
- If structured_query returns a verified timeline, use it directly.
- If not, fall back to query_memory to retrieve the relevant event(s).
- Use date_diff tool to compute time differences — do NOT do date arithmetic yourself.
- Relative dates in conversations ("yesterday", "last week") are relative to that session's date, NOT the question date.

KNOWLEDGE UPDATE ("what is my current X", "where did Y move to recently", "how often do I now"):
- FIRST: Use structured_query — it checks for the latest entity state and verifies against chunks.
- If structured_query returns a verified current value, use it directly.
- If not, fall back to query_memory with scoring_profile="recency".
- If you find multiple answers across sessions, the one from the MOST RECENT session date is correct.

RECOMMENDATION / PREFERENCE ("can you recommend", "any tips", "any advice", "suggest"):
- One focused query_memory call is sufficient. Search for the user's relevant interests or history.
- Draw on whatever you find to give a personalised answer grounded in their history.
- Do NOT over-search — if the first result gives you enough context, answer immediately.

SIMPLE RECALL (single-session facts):
- One focused query_memory call with limit=8 is usually sufficient.

REFORMULATION — if the first search returns few or no results:
- Rephrase using synonyms, broader terms, or related concepts.
- Try extracting key nouns/entities from the question and searching for those specifically.

Rules:
- Use at most 4 tool calls per question. Stop earlier if you have a confident answer.
- If structured_query returns a verified answer, you may not need query_memory at all.
- If query_memory returns good evidence on the first call, do NOT keep searching — answer immediately.
- Answer concisely — provide the specific answer, not a lengthy explanation.

VERIFICATION (apply before answering):
- NUMBERS: Before giving any numeric answer (count, amount, date difference), re-read ALL the evidence you found and count/calculate again from scratch. State the items or dates explicitly, then derive the number.
- KNOWLEDGE UPDATES: If you found a fact that was mentioned in multiple sessions, check if the value changed between sessions. Always report the value from the MOST RECENT session date. Explicitly note which session date you're using.
- PARTIAL EVIDENCE: If you found relevant information but it doesn't fully answer the question, give the best answer you can based on what you found — do NOT abstain entirely. Say "Based on the available conversations, [answer]" rather than "I wasn't able to find."
- MULTIPLE CANDIDATES: When multiple entities or facts could match, prefer the one that is most specific to the question. If the question asks about "the past month", only count items within that timeframe.
- DATE ARITHMETIC: Always use the date_diff tool for computing time differences. Never do date math in your head.`;
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
