/**
 * Query Decomposition — breaks compound questions into sub-queries.
 *
 * Targets multi-session aggregation and temporal comparison questions where
 * a single embedding/search pass misses evidence because the question mentions
 * multiple entities, time periods, or actions.
 *
 * Examples:
 *   "How many total hours of jogging and yoga did I do?" → ["jogging hours", "yoga hours"]
 *   "Which did I buy first, the dog bed or the training pads?" → ["dog bed purchase date", "training pads purchase date"]
 *   "Total money raised across all charity events" → ["charity event 1 amount", "charity event 2 amount", ...]
 *
 * Only fires for aggregation/temporal questions with compound signals.
 * Simple questions pass through unchanged.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

export interface DecomposedQuery {
  original: string;
  isCompound: boolean;
  subQueries: string[];
  mergeStrategy: "count" | "sum" | "compare" | "order" | "union";
}

// Patterns that indicate a compound question needing decomposition
const COMPOUND_SIGNALS = [
  /\band\b.*\b(total|how many|how much)\b/i,
  /\b(total|how many|how much)\b.*\band\b/i,
  /\bacross all\b/i,
  /\bin total\b.*\b(from|across|between)\b/i,
  /\b(compare|comparison|versus|vs)\b/i,
  /\bwhich.*(first|last|earlier|later|before|after)\b.*\bor\b/i,
  /\border of\b.*\b(the|my)\b/i,
  /\bfrom earliest to latest\b/i,
  /\b(all the|every)\b.*\b(I|my)\b/i,
];

/**
 * Detect if a question is compound and should be decomposed.
 * Conservative — only fires when there are clear compound signals.
 */
export function isCompoundQuestion(question: string): boolean {
  return COMPOUND_SIGNALS.some((p) => p.test(question));
}

/**
 * Decompose a compound question into sub-queries using Haiku.
 * Returns the original question unchanged if decomposition fails or isn't needed.
 */
export async function decomposeQuery(question: string): Promise<DecomposedQuery> {
  if (!isCompoundQuestion(question)) {
    return { original: question, isCompound: false, subQueries: [question], mergeStrategy: "union" };
  }

  if (!ANTHROPIC_API_KEY) {
    return { original: question, isCompound: true, subQueries: [question], mergeStrategy: "union" };
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        temperature: 0.1,
        messages: [{
          role: "user",
          content: `Break this question into independent sub-queries for a memory search system. Each sub-query should search for ONE specific piece of information.

Also determine the merge strategy:
- "count" if the final answer is a count of items
- "sum" if the final answer is a sum of values
- "compare" if comparing two things (which is more/less/first/last)
- "order" if putting things in chronological order
- "union" if just collecting all relevant information

Output ONLY valid JSON:
{"sub_queries": ["query1", "query2", ...], "merge": "count|sum|compare|order|union"}

Question: ${question}

JSON:`,
        }],
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!resp.ok) {
      return { original: question, isCompound: true, subQueries: [question], mergeStrategy: "union" };
    }

    const data = await resp.json() as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text?.trim() ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { original: question, isCompound: true, subQueries: [question], mergeStrategy: "union" };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { sub_queries?: string[]; merge?: string };
    const subQueries = parsed.sub_queries?.filter((q) => q.length > 5) ?? [question];
    const mergeStrategy = (["count", "sum", "compare", "order", "union"].includes(parsed.merge ?? "")
      ? parsed.merge
      : "union") as DecomposedQuery["mergeStrategy"];

    // Don't decompose into too many or too few
    if (subQueries.length < 2 || subQueries.length > 6) {
      return { original: question, isCompound: true, subQueries: [question], mergeStrategy };
    }

    return { original: question, isCompound: true, subQueries, mergeStrategy };
  } catch {
    return { original: question, isCompound: true, subQueries: [question], mergeStrategy: "union" };
  }
}

/**
 * Build a merged evidence summary from multiple investigate_question results.
 * Injected into the system prompt so the model sees all sub-query evidence together.
 */
export function buildDecomposedEvidence(
  decomposition: DecomposedQuery,
  results: Array<{ subQuery: string; facts: unknown[]; chunks: unknown[]; derived?: unknown }>,
): string {
  if (!decomposition.isCompound || results.length <= 1) return "";

  const lines: string[] = [];
  lines.push(`=== DECOMPOSED QUERY EVIDENCE ===`);
  lines.push(`Original question: ${decomposition.original}`);
  lines.push(`Decomposed into ${results.length} sub-queries (merge strategy: ${decomposition.mergeStrategy}):\n`);

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const facts = Array.isArray(r.facts) ? r.facts : [];
    const chunks = Array.isArray(r.chunks) ? r.chunks : [];

    lines.push(`--- Sub-query ${i + 1}: "${r.subQuery}" ---`);
    lines.push(`  Facts found: ${facts.length}`);
    lines.push(`  Chunks found: ${chunks.length}`);

    // Show top facts
    for (const f of facts.slice(0, 5)) {
      const fact = f as Record<string, unknown>;
      lines.push(`  - ${fact.subject ?? "?"} ${fact.predicate ?? "?"} ${fact.object ?? "?"}${fact.date ? ` [${String(fact.date).slice(0, 10)}]` : ""}`);
    }

    // Show top chunk snippets
    for (const c of chunks.slice(0, 2)) {
      const chunk = c as Record<string, unknown>;
      const content = String(chunk.content ?? "").slice(0, 100);
      lines.push(`  > "${content}"`);
    }

    if (r.derived) {
      const d = r.derived as Record<string, unknown>;
      lines.push(`  Derived: ${d.operation ?? "?"} = ${d.result ?? "?"}`);
    }
    lines.push("");
  }

  lines.push(`MERGE INSTRUCTION: Combine the evidence from all sub-queries using "${decomposition.mergeStrategy}" strategy.`);
  if (decomposition.mergeStrategy === "count") {
    lines.push(`Count ALL unique items across ALL sub-queries. Deduplicate by name/entity.`);
  } else if (decomposition.mergeStrategy === "sum") {
    lines.push(`Sum ALL numeric values found across sub-queries. Show your arithmetic.`);
  } else if (decomposition.mergeStrategy === "compare") {
    lines.push(`Compare the values/dates from each sub-query to determine which is more/less/first/last.`);
  } else if (decomposition.mergeStrategy === "order") {
    lines.push(`Sort all events chronologically using the dates found in each sub-query.`);
  }
  lines.push(`=== END DECOMPOSED EVIDENCE ===`);

  return lines.join("\n");
}
