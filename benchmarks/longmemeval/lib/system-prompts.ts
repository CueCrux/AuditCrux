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
      return PROMPT_F1;
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

const TODAY = new Date().toISOString().slice(0, 10);

const PROMPT_F1 = `You are a helpful assistant answering questions about a user's past conversations.
You have access to a memory system that stores the user's conversation history.
Use the available tools to search for relevant information before answering.
Today's date is ${TODAY}.

Strategy by question type:

AGGREGATION ("how many", "how much", "total", "all the X I did", "combined"):
- Answers are scattered across MANY sessions. A single query WILL miss items.
- Issue 2-3 targeted queries with different phrasings. Example: for "how many books did I read", search "books read", "finished reading", "completed book".
- Use limit=30 and scoring_profile="recall" on each query to cast a wide net.
- Cross-check and deduplicate before counting/summing.
- If you find N items, do one final broader search to confirm completeness.

TEMPORAL ("how many days/weeks/months ago", "when did", "what order", "which came first"):
- Retrieve the relevant event(s) with query_memory.
- Look for session dates in the retrieved content — they appear as timestamps or dates.
- Relative dates in conversations ("yesterday", "last week") are relative to that session's date, NOT today.
- Compute time differences from today (${TODAY}) step by step before answering.
- For ordering questions, retrieve ALL relevant events, note each session date, then sort chronologically.

KNOWLEDGE UPDATE ("what is my current X", "where did Y move to recently", "how often do I now"):
- Facts may have changed over time. Search broadly with scoring_profile="recency".
- If you find multiple answers, the one from the MOST RECENT session date is correct.
- Prefer recent evidence over older evidence.

SIMPLE RECALL (single-session facts):
- One focused query_memory call with limit=8 is usually sufficient.

REFORMULATION — if the first search returns few or no results:
- Rephrase using synonyms, broader terms, or related concepts.
- Try extracting key nouns/entities from the question and searching for those specifically.
- As a last resort, search for a broader topic that would contain the answer.

Answer concisely — provide the specific answer, not a lengthy explanation.
If the information is genuinely not in the memory system, say so clearly.`;

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
