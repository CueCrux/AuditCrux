// MemoryCrux Benchmark — Core Types

export type BenchProject = "alpha" | "beta" | "gamma" | "delta" | "epsilon" | "zeta";

export type BenchArm =
  | "C0"  // Flat-32k
  | "C1"  // Flat-128k
  | "C2"  // Flat-max
  | "C3"  // Flat+provider-compaction
  | "F1"  // File-based-32k (real alternative)
  | "T1"  // MemoryCrux-8k
  | "T2"  // MemoryCrux-16k (default treatment)
  | "T3"; // MemoryCrux-32k

export type BenchModel =
  | "claude-sonnet-4-6"
  | "claude-opus-4-6"
  | "claude-haiku-4-5"
  | "gpt-5.4"
  | "gpt-5.4-mini"
  | "gpt-5.4-nano"
  | "qwen2.5-32b";

export type ReasoningProfile = "balanced" | "deep" | "minimal";

export type ArmMode = "flat" | "memorycrux" | "compound" | "file_based";

export interface ArmConfig {
  arm: BenchArm;
  mode: ArmMode;
  contextCapTokens: number;
  compactionEnabled: boolean;
  label: string;
}

export interface RunManifest {
  runId: string;
  project: BenchProject;
  phase: number;
  model: BenchModel;
  reasoningProfile: ReasoningProfile;
  arm: BenchArm;
  armConfig: ArmConfig;
  variant: string;
  startedAt: string;
  fixtureVariantId: string;
}

export interface TurnTelemetry {
  turnIndex: number;
  role: "assistant" | "tool_result";
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  latencyMs: number;
  toolCalls: ToolCallRecord[];
  stopReason: string;
}

export interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface SessionRecord {
  sessionId: string;
  phaseIndex: number;
  phaseName: string;
  turns: TurnTelemetry[];
  killType?: "dirty" | "clean" | "graceful" | "none";
  killAtTurn?: number;
  output: string;
  firstSubstantiveActionMs?: number; // ms from phase start to first tool call or substantive output
}

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  billableTokens: number;
  estimatedCostUsd: number;
}

export interface TrackAResults {
  latency: Record<string, { p50: number; p95: number; p99: number; count: number }>;
  receiptIntegrity: {
    chainIntact: boolean;
    signaturesValid: boolean;
    totalReceipts: number;
  };
  retrieval: Record<string, number>;
  allTargetsMet: boolean;

  // v1.1 extensions (LongMemEval-motivated)
  temporalAccuracy?: { score: number; correct: string[]; incorrect: string[] };
  supersessionAccuracy?: { score: number; correct: string[]; stale: string[] };
  abstentionPrecision?: { score: number; correctAbstentions: string[]; falseAnswers: string[] };
  crossSessionSynthesis?: { score: number; synthesised: string[]; missed: string[] };
  retrievalRecall?: { score: number; retrieved: string[]; missed: string[] };

  // v1.3 extensions
  reasoningProvenance?: {
    traceability: number;
    refinementScore: number;
    traced: Array<{ key: string; toolName: string; turnIndex: number }>;
    untraced: string[];
  };
  temporalReconstruction?: {
    score: number;
    currentAnswerScore: number;
    orderingScore: number;
    chainResults: Array<{
      chainId: string;
      correctCurrent: boolean;
      correctOrder: boolean;
    }>;
  };
  novelSynthesis?: {
    score: number;
    synthesised: Array<{ key: string; sourceAFound: boolean; sourceBFound: boolean }>;
    missed: string[];
    invalidFixture: string[];
  };
  falsePremiseDetection?: {
    score: number;
    rejected: Array<{ falseClaim: string; correctionFound: boolean }>;
    accepted: string[];
  };
}

export interface TrackBResults {
  primary: Record<string, unknown>;
  secondary: Record<string, unknown>;
  blindPackId?: string;
  evaluators: string[];
}

export interface RunSummary {
  runId: string;
  project: BenchProject;
  fixtureVariant: string;
  phase: number;
  arm: BenchArm;
  timestamp: string;
  durationSeconds: number;
  llm: {
    provider: "anthropic" | "openai";
    model: string;
    reasoningProfile: ReasoningProfile;
    providerSettings: Record<string, unknown>;
    contextCapTokens: number;
  };
  usage: UsageSummary;
  sessions: SessionRecord[];
  trackA: TrackAResults;
  trackB: TrackBResults;
  deltaVsControls: Record<string, unknown>;
  receiptChainRoot?: string;
  cruxScore?: import("./scoring/crux-score.js").CruxScore;
  // Reproducibility metadata (v3.0+)
  fixtureHash?: string;
  harnessVersion?: string;
  scoringVersion?: string;
}

// ---------- Fixture types ----------

export interface CorpusDocument {
  id: string;
  type: "document" | "decision" | "constraint" | "incident";
  title: string;
  content: string;
  tokens: number;
  domain?: string;
  phase?: string | number;
  metadata?: Record<string, unknown>;
}

export interface FixtureConstraint {
  id: string;
  assertion: string;
  severity: "critical" | "high" | "medium" | "low";
  scope?: string;
  resource?: string;
  actionClass?: string;
}

export interface ScenarioPhase {
  index: number;
  name: string;
  taskPrompt: string;
  T_human_s?: number;            // Human baseline seconds (METRICS.md §4.3)
  newDocuments?: string[];       // IDs added this phase
  newConstraints?: string[];     // IDs added this phase
  expectedDecisionKeys?: string[]; // Key terms agent should preserve
  expectedToolCalls?: string[];  // Tool names agent should invoke (treatment)
  coverageGaps?: string[];       // Known gaps for A_coverage scoring
  staleItems?: string[];         // Known stale items for S_stale scoring

  // v1.1 extensions (LongMemEval-motivated)
  temporalKeys?: string[];       // Expected answers to time-dependent queries (I6)
  supersessionPairs?: Array<{ current: string; superseded: string }>; // Knowledge update pairs (I7)
  unanswerableKeys?: string[];   // Questions the agent should abstain from answering (I8)
  synthesisKeys?: string[];      // Facts requiring cross-session synthesis (K4)
  relevantDocIds?: string[];     // Ground truth relevant doc IDs for retrieval recall (I9)

  // v1.3 extensions (provenance, temporal reconstruction, novel synthesis)
  provenanceMap?: ProvenanceExpectation[];         // I10: expected tool→evidence chains
  temporalChains?: TemporalChain[];                // Enhanced temporal reconstruction
  novelSynthesisKeys?: NovelSynthesisExpectation[]; // K5: novel cross-session synthesis
  falsePremiseTraps?: FalsePremiseTrap[];           // I11: false-premise detection
}

// ---------- v1.3 fixture types ----------

/** Maps a decision key to the tool call + result pattern that should provide its evidence. */
export interface ProvenanceExpectation {
  /** The decision key that should appear in the agent's output */
  decisionKey: string;
  /** Tool name that should have been called to retrieve the evidence */
  expectedToolName: string;
  /** Substring that should appear in that tool call's result */
  expectedResultPattern: string;
}

/** A single link in a temporal chain — one fact at one point in time. */
export interface TemporalChainLink {
  /** Corpus document containing this fact */
  docId: string;
  /** ISO date when this fact was established */
  timestamp: string;
  /** The fact as stated in this document */
  fact: string;
  /** If this fact supersedes a prior fact, the docId of the superseded source */
  supersedes?: string;
}

/** A chain of temporally-ordered facts that the agent must reconstruct correctly. */
export interface TemporalChain {
  /** Unique identifier for this chain (e.g., "retention-policy-evolution") */
  chainId: string;
  /** Ordered oldest-to-newest links */
  links: TemporalChainLink[];
  /** The correct current answer after temporal resolution */
  currentAnswer: string;
  /** The question the agent should be able to answer from this chain */
  question: string;
}

/** A novel conclusion that requires combining information from separate sources. */
export interface NovelSynthesisExpectation {
  /** The novel conclusion — must NOT appear in any single corpus document */
  synthesisKey: string;
  /** First source providing one piece of the synthesis */
  sourceA: { docId: string; fact: string; sessionHint?: number };
  /** Second source providing the other piece */
  sourceB: { docId: string; fact: string; sessionHint?: number };
  /** Human-readable explanation of why A + B → synthesisKey */
  reasoning: string;
}

/**
 * A question whose premise is factually wrong given the corpus.
 * The agent should reject the premise, not answer the question as asked.
 */
export interface FalsePremiseTrap {
  /** The question containing the false premise */
  question: string;
  /** The false claim embedded in the question */
  falseClaim: string;
  /** What the corpus actually says (the truth the agent should assert) */
  correction: string;
  /** Corpus doc ID that contains the correct information */
  correctionDocId: string;
}

export interface KillVariant {
  id: string;
  label: string;
  type: "dirty" | "clean" | "graceful";
  killAfterPhase?: number;
  killAtTurnInPhase?: number;
  description: string;
}

export interface ProjectFixture {
  project: BenchProject;
  version: string;
  corpus: CorpusDocument[];
  constraints: FixtureConstraint[];
  phases: ScenarioPhase[];
  killVariants?: KillVariant[];
  expectedMetrics: Record<string, { target: string; description: string }>;
}

// ---------- Config ----------

export interface BenchConfig {
  anthropicApiKey: string;
  openaiApiKey: string;
  vaultcruxApiBase: string;
  vaultcruxMcpUrl: string;
  vaultcruxApiKey: string;
  benchTenantPrefix: string;
  outputDir: string;
  timeoutMs: number;
  maxTurnsPerPhase: number;
  skipSeed?: boolean;
}
