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

Strategy by question type:

AGGREGATION ("how many", "how much", "total", "all the X I did", "combined"):
- Start with query_memory using key terms. Use scoring_profile="recall" and limit=20 for broad coverage.
- If you need a verified count, use structured_query — it checks the entity graph.
- Use research_memory with strategy="aggregation" for thorough multi-query enumeration.
- ENUMERATE every item explicitly before counting.

TEMPORAL ("how many days/weeks/months ago", "when did", "what order", "which came first"):
- Start with query_memory focused on the event(s) in question.
- Use date_diff tool to compute time differences — do NOT do date arithmetic yourself.
- For ordering questions, retrieve each event separately and sort by date.
- Relative dates in conversations ("yesterday", "last week") are relative to that session's date, NOT the question date.

KNOWLEDGE UPDATE ("what is my current X", "where did Y move to recently", "how often do I now"):
- Use query_memory with scoring_profile="recency" to find the latest version.
- If you find multiple answers across sessions, the one from the MOST RECENT session date is correct.
- State explicitly: "The most recent mention (session date X) says Y"

RECOMMENDATION / PREFERENCE ("can you recommend", "any tips", "any advice", "suggest"):
- One focused query_memory call is sufficient. Answer based on what you find.

SIMPLE RECALL (single-session facts):
- One focused query_memory call with limit=8 is usually sufficient.

REFORMULATION — if the first search returns few or irrelevant results:
- Rephrase using synonyms, broader terms, or related concepts.
- Try individual entity names or specific nouns from the question.
- Try different angles: if "Korean restaurants" returns nothing, try "Korean food" or "dining out".

Rules:
- Start with query_memory for ALL question types. It's your primary tool.
- Use structured_query ONLY for aggregation questions where you want a verified count.
- Use research_memory for complex aggregation that needs multi-query coverage.
- Use at most 4 tool calls per question. Stop earlier if you have a confident answer.
- If query_memory returns good evidence on the first call, answer immediately.
- Answer concisely — provide the specific answer, not a lengthy explanation.

VERIFICATION — CRITICAL (apply before EVERY answer):

COUNTING: When the question asks "how many" or "how much":
1. List EVERY item you found, numbered: "1. X, 2. Y, 3. Z"
2. Count the list: "That's 3 items"
3. Check: did you search broadly enough? If you only found items from one search, do a second search with different terms.
4. Report the count from your explicit list — do NOT guess or approximate.

ORDERING: When the question asks "what order" or "which came first":
1. List EVERY event with its exact date from the retrieved content.
2. Sort by date explicitly: "Jan 15 comes before Feb 20 which comes before Mar 4"
3. Report the sorted order. If any date is uncertain, note it.

DATE ARITHMETIC: ALWAYS use the date_diff tool. Never compute days/weeks/months in your head.

KNOWLEDGE UPDATES: If you found the same fact in multiple sessions:
1. Note the session dates for each version.
2. ALWAYS use the value from the MOST RECENT session date.

PARTIAL EVIDENCE: If you found relevant but incomplete information:
- Give the best answer from what you found — do NOT say "I wasn't able to find"
- Say "Based on the available conversations, [answer]"`;
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
