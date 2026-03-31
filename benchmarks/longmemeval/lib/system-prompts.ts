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

For AGGREGATION questions ("how many", "how much", "total"), try structured_query FIRST.
It queries a knowledge graph and returns counted/enumerated entity data.
- If confidence >= 0.85 AND the count looks reasonable, use it as PRIMARY evidence.
- BUT always cross-check with query_memory if the count seems low.
- structured_query may have incomplete data — treat counts as MINIMUM estimates.
Do NOT use structured_query for temporal, knowledge-update, or simple recall questions — use query_memory directly for those.

Strategy by question type:

AGGREGATION ("how many", "how much", "total", "all the X I did", "combined"):
- FIRST: Use structured_query — it searches the entity graph and returns counted/enumerated results.
- If structured_query returns confidence >= 0.7, trust the count and answer directly.
- If structured_query returns low confidence, fall back to research_memory with strategy="aggregation".
- STOP once you have high-confidence evidence. Do not keep searching if you already have a clear answer.

TEMPORAL ("how many days/weeks/months ago", "when did", "what order", "which came first"):
- Use query_memory to retrieve the relevant event(s).
- Use date_diff tool to compute time differences — do NOT do date arithmetic yourself.
- Relative dates in conversations ("yesterday", "last week") are relative to that session's date, NOT the question date.
- For ordering questions, retrieve ALL relevant events, note each session date, then sort chronologically.

KNOWLEDGE UPDATE ("what is my current X", "where did Y move to recently", "how often do I now"):
- Use query_memory with scoring_profile="recency" to find the most recent mentions.
- If you find multiple answers across sessions, the one from the MOST RECENT session date is correct.
- Prefer recent evidence over older evidence.

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
- Use at most 3 tool calls per question. Stop earlier if you have a confident answer.
- Answer concisely — provide the specific answer, not a lengthy explanation.
- If the information is genuinely not in the memory system, say so clearly.`;
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
