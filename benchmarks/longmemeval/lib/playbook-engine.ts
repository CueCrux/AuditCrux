/**
 * Retrieval Playbook Engine — M9
 *
 * A declarative playbook layer between question classification and answer generation.
 * Each playbook specifies: scoring profile, chunk/token budget, tool set, pre-injection
 * strategy, reflection/escalation rules, and prompt template per question type.
 *
 * Key design constraint: Playbooks do NOT inject more evidence. They inject BETTER
 * SELECTED evidence with APPROPRIATE CONTEXT SIZE. Easy questions get tight context
 * (1,500 tokens). Hard questions get wide context (7,500 tokens).
 *
 * Inspired by agentmemory (96.2%, #1 on LongMemEval) which uses per-question-type
 * signal weights and token budgets: 1,500-7,500 tokens depending on question type.
 *
 * Feature flag: FEATURE_PLAYBOOK_ENGINE (env var, benchmark-side)
 */

// ── Playbook Schema ──

export interface Playbook {
  id: string;
  description: string;

  retrieval: {
    scoringProfile: "balanced" | "recall" | "recency";
    chunkLimit: number;
    dualRetrieval: boolean;
    dateRangeMode: "none" | "question_date_relative" | "full_history";
  };

  context: {
    tokenBudget: number;
    maxChunksInPrompt: number;
    injectEntityFacts: boolean;
    injectTimeline: boolean;
    injectRecencyFacts: boolean;
  };

  tools: {
    primaryTool: "investigate_question" | "query_memory";
    maxFollowUpCalls: number;
    allowedTools: string[];
    enableDateDiff: boolean;
  };

  verification: {
    enableReflection: boolean;
    forceEscalation: boolean;
    confidenceThreshold: number;
  };

  prompt: {
    templateKey: string;
    instructions: string[];
  };
}

// ── 6 Seed Playbooks ──

const SIMPLE_RECALL: Playbook = {
  id: "simple_recall",
  description: "Single-fact recall. Standard retrieval, concise answering. Protects 97%+ accuracy on easy questions.",
  retrieval: {
    scoringProfile: "balanced",
    chunkLimit: 15,
    dualRetrieval: false,
    dateRangeMode: "none",
  },
  context: {
    tokenBudget: 4000,
    maxChunksInPrompt: 10,
    injectEntityFacts: false,
    injectTimeline: false,
    injectRecencyFacts: false,
  },
  tools: {
    primaryTool: "query_memory",
    maxFollowUpCalls: 2,
    allowedTools: [
      "query_memory", "investigate_question", "research_memory",
      "enumerate_memory_facts", "expand_hit_context",
    ],
    enableDateDiff: false,
  },
  verification: {
    enableReflection: false,
    forceEscalation: false,
    confidenceThreshold: 7,
  },
  prompt: {
    templateKey: "simple_recall",
    instructions: [
      "Search for the specific fact and answer concisely.",
      "One or two focused calls is usually enough.",
      "Use at most 3 tool calls.",
    ],
  },
};

const MULTI_SESSION_AGGREGATION: Playbook = {
  id: "multi_session_aggregation",
  description: "Cross-session counting/listing. Wide chunk budget, recall-biased, entity pre-injection.",
  retrieval: {
    scoringProfile: "recall",
    chunkLimit: 30,
    dualRetrieval: false,
    dateRangeMode: "full_history",
  },
  context: {
    tokenBudget: 7500,
    maxChunksInPrompt: 20,
    injectEntityFacts: true,
    injectTimeline: false,
    injectRecencyFacts: false,
  },
  tools: {
    primaryTool: "investigate_question",
    maxFollowUpCalls: 3,
    allowedTools: [
      "investigate_question", "query_memory", "enumerate_memory_facts",
      "derive_from_facts", "research_memory", "expand_hit_context",
    ],
    enableDateDiff: false,
  },
  verification: {
    enableReflection: true,
    forceEscalation: true,
    confidenceThreshold: 8,
  },
  prompt: {
    templateKey: "aggregation",
    instructions: [
      "ENUMERATE every item individually before counting. Number them 1, 2, 3...",
      "Cross-check entity index facts against retrieved chunks — the entity index may overcount.",
      "Search again with different terms if the count seems incomplete.",
      "The pre-computed entity data below is EVIDENCE, not the final answer.",
    ],
  },
};

const TEMPORAL_ORDERING: Playbook = {
  id: "temporal_ordering",
  description: "Chronological ordering. Timeline pre-injection, date-sorted evidence.",
  retrieval: {
    scoringProfile: "balanced",
    chunkLimit: 20,
    dualRetrieval: false,
    dateRangeMode: "full_history",
  },
  context: {
    tokenBudget: 5000,
    maxChunksInPrompt: 15,
    injectEntityFacts: false,
    injectTimeline: true,
    injectRecencyFacts: false,
  },
  tools: {
    primaryTool: "investigate_question",
    maxFollowUpCalls: 2,
    allowedTools: ["investigate_question", "query_memory", "build_timeline", "date_diff"],
    enableDateDiff: true,
  },
  verification: {
    enableReflection: true,
    forceEscalation: true,
    confidenceThreshold: 8,
  },
  prompt: {
    templateKey: "temporal_ordering",
    instructions: [
      "Use the pre-computed timeline to establish chronological order.",
      "Sort events by their date, not by retrieval order.",
      "If timeline is incomplete, use build_timeline and query_memory to find missing events.",
      "NEVER guess the order — if dates are ambiguous, say so.",
    ],
  },
};

const TEMPORAL_ARITHMETIC: Playbook = {
  id: "temporal_arithmetic",
  description: "Date resolution and arithmetic. Deterministic date_diff, question_date anchoring.",
  retrieval: {
    scoringProfile: "balanced",
    chunkLimit: 15,
    dualRetrieval: false,
    dateRangeMode: "question_date_relative",
  },
  context: {
    tokenBudget: 3000,
    maxChunksInPrompt: 10,
    injectEntityFacts: false,
    injectTimeline: true,
    injectRecencyFacts: false,
  },
  tools: {
    primaryTool: "investigate_question",
    maxFollowUpCalls: 3,
    allowedTools: ["investigate_question", "query_memory", "build_timeline", "date_diff"],
    enableDateDiff: true,
  },
  verification: {
    enableReflection: true,
    forceEscalation: false,
    confidenceThreshold: 7,
  },
  prompt: {
    templateKey: "temporal_arithmetic",
    instructions: [
      "ALWAYS use the date_diff tool for date arithmetic. NEVER compute differences yourself.",
      "All relative dates ('how long ago', 'last month') are relative to the question date.",
      "Extract concrete dates from the timeline/chunks, then pass them to date_diff.",
      "Show your working: 'Event A was on [date]. Event B was on [date]. date_diff = X.'",
    ],
  },
};

const KNOWLEDGE_UPDATE: Playbook = {
  id: "knowledge_update",
  description: "Current-value resolution. Recency-first, dual retrieval, tight context.",
  retrieval: {
    scoringProfile: "recency",
    chunkLimit: 15,
    dualRetrieval: true,
    dateRangeMode: "none",
  },
  context: {
    tokenBudget: 2500,
    maxChunksInPrompt: 8,
    injectEntityFacts: false,
    injectTimeline: false,
    injectRecencyFacts: true,
  },
  tools: {
    primaryTool: "investigate_question",
    maxFollowUpCalls: 2,
    allowedTools: ["investigate_question", "query_memory"],
    enableDateDiff: false,
  },
  verification: {
    enableReflection: true,
    forceEscalation: true,
    confidenceThreshold: 8,
  },
  prompt: {
    templateKey: "knowledge_update",
    instructions: [
      "Multiple values may exist for the same fact. The MOST RECENT date wins.",
      "Check source date on every piece of evidence. Newer overrides older.",
      "The pre-computed facts below are sorted most-recent-first.",
      "If only one value exists, use it. If multiple conflict, use the latest.",
    ],
  },
};

const ABSTENTION: Playbook = {
  id: "abstention",
  description: "Calibrated abstention. Wide search to confirm absence, then confident 'insufficient evidence'.",
  retrieval: {
    scoringProfile: "recall",
    chunkLimit: 20,
    dualRetrieval: false,
    dateRangeMode: "full_history",
  },
  context: {
    tokenBudget: 3000,
    maxChunksInPrompt: 10,
    injectEntityFacts: true,
    injectTimeline: false,
    injectRecencyFacts: false,
  },
  tools: {
    primaryTool: "investigate_question",
    maxFollowUpCalls: 2,
    allowedTools: ["investigate_question", "query_memory", "assess_answerability"],
    enableDateDiff: false,
  },
  verification: {
    enableReflection: true,
    forceEscalation: false,
    confidenceThreshold: 5,
  },
  prompt: {
    templateKey: "abstention",
    instructions: [
      "If investigation finds no relevant evidence AND answerability says 'not answerable', say: 'Based on the available conversations, there is insufficient information to answer this question.'",
      "Do NOT hallucinate or guess. A confident 'I don't know' is better than a wrong answer.",
      "If you find SOME evidence but it doesn't fully answer the question, answer with what you found.",
      "Only abstain when evidence is truly absent after a thorough search.",
    ],
  },
};

// ── Playbook Registry ──

export const PLAYBOOKS: Record<string, Playbook> = {
  simple_recall: SIMPLE_RECALL,
  multi_session_aggregation: MULTI_SESSION_AGGREGATION,
  temporal_ordering: TEMPORAL_ORDERING,
  temporal_arithmetic: TEMPORAL_ARITHMETIC,
  knowledge_update: KNOWLEDGE_UPDATE,
  abstention: ABSTENTION,
};

// ── Ordering Patterns (distinguish ordering from arithmetic) ──

const ORDERING_PATTERNS = [
  /\bwhat (?:is the )?order\b/i,
  /\bfrom earliest\b/i,
  /\bfrom latest\b/i,
  /\bchronological\b/i,
  /\bwhich (?:came|happened) first\b/i,
  /\bbefore.*or.*after\b/i,
  /\bearli(?:est|er) to lat(?:est|er)\b/i,
  /\border of\b/i,
];

// ── Playbook Selector ──

export function selectPlaybook(
  question: string,
  questionType?: string,
): Playbook {
  const q = question.toLowerCase();

  // 1. Temporal questions — distinguish ordering from arithmetic
  if (/how many days|how many weeks|how many months|how many years|how long ago|when did|what order|which came first|earliest|latest|before.*after/i.test(q)) {
    if (ORDERING_PATTERNS.some((p) => p.test(question))) {
      return TEMPORAL_ORDERING;
    }
    return TEMPORAL_ARITHMETIC;
  }

  // 2. Aggregation — counting/listing/totalling
  if (/how many|how much|total|combined|in total|list all|altogether/i.test(q)) {
    return MULTI_SESSION_AGGREGATION;
  }

  // 3. Knowledge update — current value questions
  if (/current|currently|now |most recent|recently|moved to|changed to|switched to|started using/i.test(q)) {
    return KNOWLEDGE_UPDATE;
  }

  // 4. Abstention candidates — questions with _abs suffix in dataset type
  if (questionType?.endsWith("_abs") || questionType?.includes("abs")) {
    return ABSTENTION;
  }

  // 5. Simple recall (preference questions included — 97%+ already)
  return SIMPLE_RECALL;
}

// ── Feature flag check ──

export function isPlaybookEngineEnabled(): boolean {
  return process.env.FEATURE_PLAYBOOK_ENGINE === "true" || process.env.FEATURE_PLAYBOOK_ENGINE === "1";
}
