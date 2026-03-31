// Proposition-level partial-credit scoring for CueCrux memory benchmarks
//
// Pipeline:
//   1. Decompose ground-truth answer into atomic propositions
//   2. Verify each proposition against hypothesis (SUPPORTED / NOT_MENTIONED / CONTRADICTED)
//   3. Compute recall, contradiction rate, and partial credit
//
// Uses OpenAI for consistency with evaluate_qa.py judge.

import OpenAI from "openai";

// ── Types ──

export type PropVerdict = "supported" | "not_mentioned" | "contradicted";

export interface Proposition {
  text: string;
  verdict?: PropVerdict;
}

export interface PropositionScore {
  questionId: string;
  questionType: string;
  question: string;
  groundTruth: string;
  hypothesis: string;
  propositions: Proposition[];
  recall: number;           // supported / total
  contradictionRate: number; // contradicted / total
  partialCredit: number;    // (supported - contradicted) / total, clamped [0,1]
}

export interface PropositionAggregate {
  overall: {
    meanRecall: number;
    meanContradictionRate: number;
    meanPartialCredit: number;
    totalQuestions: number;
  };
  byType: Record<
    string,
    {
      meanRecall: number;
      meanContradictionRate: number;
      meanPartialCredit: number;
      totalQuestions: number;
    }
  >;
}

// ── Decomposition prompt ──

const DECOMPOSE_SYSTEM = `You decompose answers into atomic propositions — the smallest independently verifiable facts.

Rules:
- Each proposition must be ONE fact that can be checked true/false independently.
- Preserve specific details: names, numbers, dates, locations.
- If the answer is a single fact (e.g. "Business Administration"), still output it as one proposition.
- Output ONLY a JSON array of strings. No markdown, no explanation.

Example:
  Question: "What is my daily commute?"
  Answer: "45 minutes each way by train"
  Output: ["The user's daily commute is 45 minutes each way", "The user commutes by train"]`;

function decomposeUserMsg(question: string, answer: string): string {
  return `Question: ${JSON.stringify(question)}\nAnswer: ${JSON.stringify(answer)}`;
}

// ── Verification prompt ──

const VERIFY_SYSTEM = `You verify whether propositions are supported by a given hypothesis text.

For each proposition, respond with one of:
- "supported" — the hypothesis clearly states or directly implies this fact
- "not_mentioned" — the hypothesis does not address this fact
- "contradicted" — the hypothesis states something that conflicts with this fact

Output ONLY a JSON array of objects: [{"proposition": "...", "verdict": "supported|not_mentioned|contradicted"}]
No markdown, no explanation.`;

function verifyUserMsg(
  question: string,
  hypothesis: string,
  propositions: string[],
): string {
  return [
    `Question: ${JSON.stringify(question)}`,
    `Hypothesis (model answer): ${JSON.stringify(hypothesis)}`,
    `Propositions to verify:\n${propositions.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
  ].join("\n\n");
}

// ── Scorer class ──

export class PropositionScorer {
  private client: OpenAI;
  private model: string;
  private decompositionCache = new Map<string, string[]>();

  constructor(opts?: { model?: string }) {
    this.client = new OpenAI(); // uses OPENAI_API_KEY from env
    this.model = opts?.model ?? "gpt-4o-mini";
  }

  /**
   * Decompose a ground-truth answer into atomic propositions.
   * Results are cached by questionId so the same ground truth
   * isn't re-decomposed when comparing multiple arms/models.
   */
  async decompose(
    questionId: string,
    question: string,
    answer: string,
  ): Promise<string[]> {
    const cached = this.decompositionCache.get(questionId);
    if (cached) return cached;

    const resp = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      messages: [
        { role: "system", content: DECOMPOSE_SYSTEM },
        { role: "user", content: decomposeUserMsg(question, answer) },
      ],
      response_format: { type: "json_object" },
    });

    const raw = resp.choices[0]?.message?.content?.trim() ?? "[]";
    let propositions: string[];
    try {
      const parsed = JSON.parse(raw);
      // Handle both bare array and { propositions: [...] } wrapper
      propositions = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.propositions)
          ? parsed.propositions
          : [answer]; // fallback: treat whole answer as one proposition
    } catch {
      propositions = [answer];
    }

    // Safety: at least one proposition
    if (propositions.length === 0) propositions = [answer];

    this.decompositionCache.set(questionId, propositions);
    return propositions;
  }

  /**
   * Verify each proposition against the hypothesis.
   */
  async verify(
    question: string,
    hypothesis: string,
    propositions: string[],
  ): Promise<Proposition[]> {
    if (!hypothesis || hypothesis.trim().length === 0) {
      // No answer given — everything is not_mentioned
      return propositions.map((p) => ({ text: p, verdict: "not_mentioned" }));
    }

    const resp = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      messages: [
        { role: "system", content: VERIFY_SYSTEM },
        {
          role: "user",
          content: verifyUserMsg(question, hypothesis, propositions),
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = resp.choices[0]?.message?.content?.trim() ?? "[]";
    let verdicts: Array<{ proposition: string; verdict: string }>;
    try {
      const parsed = JSON.parse(raw);
      verdicts = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.verdicts)
          ? parsed.verdicts
          : [];
    } catch {
      verdicts = [];
    }

    // Map back to propositions by index (order preserved)
    return propositions.map((text, i) => {
      const v = verdicts[i]?.verdict;
      const verdict: PropVerdict =
        v === "supported" || v === "not_mentioned" || v === "contradicted"
          ? v
          : "not_mentioned";
      return { text, verdict };
    });
  }

  /**
   * Full pipeline: decompose ground truth, verify against hypothesis, compute scores.
   */
  async score(opts: {
    questionId: string;
    questionType: string;
    question: string;
    groundTruth: string;
    hypothesis: string;
  }): Promise<PropositionScore> {
    const propositions = await this.decompose(
      opts.questionId,
      opts.question,
      opts.groundTruth,
    );

    const verified = await this.verify(
      opts.question,
      opts.hypothesis,
      propositions,
    );

    const total = verified.length;
    const supported = verified.filter((p) => p.verdict === "supported").length;
    const contradicted = verified.filter(
      (p) => p.verdict === "contradicted",
    ).length;

    const recall = total > 0 ? supported / total : 0;
    const contradictionRate = total > 0 ? contradicted / total : 0;
    const partialCredit = total > 0
      ? Math.max(0, Math.min(1, (supported - contradicted) / total))
      : 0;

    return {
      questionId: opts.questionId,
      questionType: opts.questionType,
      question: opts.question,
      groundTruth: opts.groundTruth,
      hypothesis: opts.hypothesis,
      propositions: verified,
      recall,
      contradictionRate,
      partialCredit,
    };
  }
}

// ── Aggregation ──

export function aggregatePropositionScores(
  scores: PropositionScore[],
): PropositionAggregate {
  const byType: PropositionAggregate["byType"] = {};

  for (const s of scores) {
    if (!byType[s.questionType]) {
      byType[s.questionType] = {
        meanRecall: 0,
        meanContradictionRate: 0,
        meanPartialCredit: 0,
        totalQuestions: 0,
      };
    }
    byType[s.questionType].meanRecall += s.recall;
    byType[s.questionType].meanContradictionRate += s.contradictionRate;
    byType[s.questionType].meanPartialCredit += s.partialCredit;
    byType[s.questionType].totalQuestions++;
  }

  for (const stats of Object.values(byType)) {
    if (stats.totalQuestions > 0) {
      stats.meanRecall /= stats.totalQuestions;
      stats.meanContradictionRate /= stats.totalQuestions;
      stats.meanPartialCredit /= stats.totalQuestions;
    }
  }

  const n = scores.length;
  return {
    overall: {
      meanRecall: n > 0 ? scores.reduce((a, s) => a + s.recall, 0) / n : 0,
      meanContradictionRate:
        n > 0
          ? scores.reduce((a, s) => a + s.contradictionRate, 0) / n
          : 0,
      meanPartialCredit:
        n > 0 ? scores.reduce((a, s) => a + s.partialCredit, 0) / n : 0,
      totalQuestions: n,
    },
    byType,
  };
}
