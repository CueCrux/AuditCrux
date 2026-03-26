// MemoryCrux Benchmark — Flat context builder for control arms

import type { CorpusDocument, FixtureConstraint } from "./types.js";

/**
 * Estimate tokens from text (rough: 4 chars per token).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build a flat context string from corpus documents, truncated to a token cap.
 * Priority: constraints > decisions > documents > incidents.
 */
export function buildFlatContext(
  corpus: CorpusDocument[],
  constraints: FixtureConstraint[],
  capTokens: number,
): { context: string; includedDocs: number; omittedDocs: number; estimatedTokens: number } {
  const sections: string[] = [];

  // Constraints get priority
  if (constraints.length > 0) {
    sections.push("## Active Constraints\n");
    for (const c of constraints) {
      sections.push(`- [${c.severity.toUpperCase()}] ${c.assertion}`);
    }
    sections.push("");
  }

  // Sort by priority
  const priorityOrder: CorpusDocument["type"][] = ["constraint", "decision", "document", "incident"];
  const sorted = [...corpus].sort((a, b) => {
    return priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type);
  });

  let tokenBudget = capTokens - estimateTokens(sections.join("\n"));
  let includedDocs = 0;
  let omittedDocs = 0;

  for (const doc of sorted) {
    const docText = `### ${doc.title} [${doc.type}]\n${doc.content}\n\n`;
    const docTokens = estimateTokens(docText);
    if (docTokens <= tokenBudget) {
      sections.push(docText);
      tokenBudget -= docTokens;
      includedDocs++;
    } else {
      omittedDocs++;
    }
  }

  if (omittedDocs > 0) {
    sections.push(`*[${omittedDocs} document(s) omitted due to ${capTokens}-token context cap]*\n`);
  }

  const context = sections.join("\n");
  return {
    context,
    includedDocs,
    omittedDocs,
    estimatedTokens: estimateTokens(context),
  };
}
