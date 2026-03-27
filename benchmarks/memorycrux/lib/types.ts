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
  | "gpt-5.4-nano";

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
