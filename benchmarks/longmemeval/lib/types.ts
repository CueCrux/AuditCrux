// LongMemEval External Benchmark — Core Types

// ── Dataset types (match longmemeval_s_cleaned.json / longmemeval_m_cleaned.json) ──

export interface LongMemEvalRawItem {
  question_id: string;
  question_type: LmeQuestionType;
  question: string;
  question_date: string; // e.g. "2023/05/30 (Tue) 23:40"
  answer: string;
  answer_session_ids: string[];
  haystack_dates: string[]; // one per session, same format
  haystack_session_ids: string[];
  haystack_sessions: LmeSessionTurn[][]; // each session is an array of {role, content}
}

export interface LmeSessionTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

export type LmeQuestionType =
  | "single-session-user"
  | "single-session-assistant"
  | "single-session-preference"
  | "multi-session"
  | "temporal-reasoning"
  | "knowledge-update";

// ── Processed types ──

export interface LmeProblem {
  problemId: string;
  questionType: LmeQuestionType;
  question: string;
  questionDate: string;
  answer: string;
  answerSessionIds: string[];
  sessions: LmeSession[];
  totalContentChars: number;
  estimatedTokens: number;
}

export interface LmeSession {
  sessionId: string;
  date: string;
  turns: LmeSessionTurn[];
  contentText: string; // flattened turn content for ingestion
  charCount: number;
}

// ── Arm definitions ──

export type LmeArm = "C0" | "C2" | "F1" | "T2";

export type LmeArmMode = "bare" | "context_stuffed" | "raw_api" | "mcp";

export interface LmeArmConfig {
  arm: LmeArm;
  mode: LmeArmMode;
  needsVaultCrux: boolean;
  label: string;
  toolSet: "none" | "retrieval" | "full";
}

// ── Dataset variant ──

export type LmeDataset = "s" | "m";

// ── Run types ──

export interface LmeRunManifest {
  runId: string;
  dataset: LmeDataset;
  arm: LmeArm;
  armConfig: LmeArmConfig;
  model: string;
  startedAt: string;
  pilotSize?: number; // if pilot mode, number of questions
  questionFilter?: string[]; // specific question IDs
  budgetLimitUsd?: number;
  skipSeed: boolean;
}

export interface LmeAnswer {
  questionId: string;
  questionType: LmeQuestionType;
  hypothesis: string;
  receiptChainIds: string[];
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  latencyMs: number;
  costUsd: number;
  turns: number;
}

export interface LmeRunSummary {
  runId: string;
  dataset: LmeDataset;
  arm: LmeArm;
  model: string;
  timestamp: string;
  durationSeconds: number;
  totalQuestions: number;
  answers: LmeAnswer[];
  usage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCachedTokens: number;
    totalCostUsd: number;
  };
  fixtureHash?: string;
  harnessVersion?: string;
}

// ── Hypothesis output (for evaluate_qa.py) ──

export interface LmeHypothesis {
  question_id: string;
  hypothesis: string;
}

// ── Evaluation results ──

export interface LmeEvalResult {
  questionId: string;
  questionType: LmeQuestionType;
  correct: boolean;
  hypothesis: string;
  groundTruth: string;
}

export interface LmeEvalSummary {
  accuracy: number;
  totalQuestions: number;
  correct: number;
  byType: Record<LmeQuestionType, { accuracy: number; total: number; correct: number }>;
}
