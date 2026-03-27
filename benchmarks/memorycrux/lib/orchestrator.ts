// MemoryCrux Benchmark — Session orchestrator
//
// Core loop: fixture → arm config → LLM conversation → tool proxy → telemetry → output

import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import type {
  BenchConfig,
  RunManifest,
  RunSummary,
  SessionRecord,
  TurnTelemetry,
  ToolCallRecord,
  ProjectFixture,
  ScenarioPhase,
  KillVariant,
  UsageSummary,
} from "./types.js";
import type { LlmAdapter, Message, ToolDef } from "./llm/adapter.js";
import { createAdapter } from "./llm/factory.js";
import { estimateCost } from "./llm/cost.js";
import { getToolDefsForBenchmark, getFileToolDefs, getCompoundToolDefs } from "./llm/tool-bridge.js";
import { McProxy } from "./mc-proxy.js";
import { FileProxy } from "./file-proxy.js";
import { CompoundProxy } from "./compound-proxy.js";
import { seedCorpus } from "./corpus-seeder.js";
import { buildFlatContext } from "./flat-context.js";
import { flatContextSystemPrompt, memoryCruxSystemPrompt, fileBasedSystemPrompt, compoundSystemPrompt, BENCHMARK_TOOLS } from "../fixtures/_shared/system-prompts.js";
import { getModelProvider } from "./arms.js";

/** Unified interface for tool routing (McProxy or FileProxy) */
interface ToolRouter {
  callTool(name: string, args: Record<string, unknown>): Promise<import("./types.js").ToolCallRecord>;
}

/** Auto-provision benchmark tenant in VaultCrux Postgres (rate limiter FK requires it). */
async function ensureBenchTenant(_config: BenchConfig, tenantId: string): Promise<void> {
  try {
    const sql = `INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'MemoryCrux Benchmark ${tenantId}') ON CONFLICT (id) DO NOTHING;`;
    execSync(`docker exec vaultcrux-postgres psql -U vaultcrux -d vaultcrux -c "${sql}"`, {
      timeout: 5000,
      stdio: "pipe",
    });
  } catch (err) {
    console.warn(`  Warning: could not auto-provision tenant ${tenantId}:`, err instanceof Error ? err.message : err);
  }
}

export interface OrchestratorResult {
  summary: RunSummary;
  sessions: SessionRecord[];
}

export async function executeRun(
  manifest: RunManifest,
  fixture: ProjectFixture,
  config: BenchConfig,
): Promise<OrchestratorResult> {
  const startTime = Date.now();
  const adapter = createAdapter(manifest.model, config);
  const armConfig = manifest.armConfig;
  const isMemoryCrux = armConfig.mode === "memorycrux";
  const isCompound = armConfig.mode === "compound";
  const isFileBased = armConfig.mode === "file_based";
  const needsVaultCrux = isMemoryCrux || isCompound;

  // Prepare tool router and defs for non-flat arms
  let toolRouter: ToolRouter | undefined;
  let mcProxy: McProxy | undefined;
  let fileProxy: FileProxy | undefined;
  let toolDefs: ToolDef[] | undefined;

  if (needsVaultCrux) {
    mcProxy = McProxy.fromConfig(config, `${manifest.project}_${manifest.arm}_${manifest.variant}`);

    // Probe VaultCrux
    const alive = await mcProxy.probe();
    if (!alive) {
      throw new Error(`VaultCrux API not reachable at ${config.vaultcruxApiBase}`);
    }

    // Ensure tenant exists (rate limiter FK requires it)
    await ensureBenchTenant(config, mcProxy.tenantId);

    // Seed corpus
    console.log("  Seeding MemoryCrux corpus...");
    const seedResult = await seedCorpus(mcProxy, fixture);
    console.log(`  Seeded: ${seedResult.documentsSeeded} docs, ${seedResult.constraintsSeeded} constraints (${seedResult.durationMs}ms)`);
    if (seedResult.documentsFailed > 0 || seedResult.constraintsFailed > 0) {
      console.warn(`  WARNING: ${seedResult.documentsFailed} doc failures, ${seedResult.constraintsFailed} constraint failures`);
    }

    if (isCompound) {
      toolRouter = new CompoundProxy(mcProxy);
      toolDefs = getCompoundToolDefs();
      console.log("  Compound arm: 4 smart tools wrapping VaultCrux API");
    } else {
      toolRouter = mcProxy;
      toolDefs = getToolDefsForBenchmark();
    }
  } else if (isFileBased) {
    fileProxy = new FileProxy(fixture);
    toolRouter = fileProxy;
    toolDefs = getFileToolDefs();
    console.log("  File-based arm: corpus materialised as in-memory file tree");
  }

  // Determine kill variant
  const killVariant = fixture.killVariants?.find((v) => v.id === manifest.variant) ?? undefined;

  // Execute phases
  const sessions: SessionRecord[] = [];
  const allTurns: TurnTelemetry[] = [];

  for (const phase of fixture.phases) {
    console.log(`  Phase ${phase.index}: ${phase.name}`);

    const session = await executePhase({
      phase,
      fixture,
      manifest,
      adapter,
      mcProxy,
      toolRouter,
      toolDefs,
      config,
      killVariant,
      isMemoryCrux,
      isCompound,
      isFileBased,
      fileProxy,
    });

    sessions.push(session);
    allTurns.push(...session.turns);

    // Check for kill after this phase
    if (killVariant && killVariant.killAfterPhase === phase.index) {
      console.log(`  [KILL] ${killVariant.label} after phase ${phase.index}`);
      if (killVariant.type === "graceful" && needsVaultCrux && mcProxy) {
        // Graceful: checkpoint before kill
        console.log("  [CHECKPOINT] Creating graceful handoff checkpoint...");
        await mcProxy.callTool("checkpoint_decision_state", {
          session_id: session.sessionId,
          summary: `Phase ${phase.index} (${phase.name}) completed. ${session.output.slice(0, 500)}`,
          next_steps: fixture.phases
            .filter((p) => p.index > phase.index)
            .map((p) => `Phase ${p.index}: ${p.name}`),
        });
      }
      // Remaining phases get a fresh session (no conversation history)
    }
  }

  // Aggregate usage
  const usage = aggregateUsage(allTurns, manifest.model);

  const durationSeconds = (Date.now() - startTime) / 1000;

  const summary: RunSummary = {
    runId: manifest.runId,
    project: manifest.project,
    fixtureVariant: manifest.variant,
    phase: manifest.phase,
    arm: manifest.arm,
    timestamp: new Date().toISOString(),
    durationSeconds,
    llm: {
      provider: getModelProvider(manifest.model),
      model: manifest.model,
      reasoningProfile: manifest.reasoningProfile,
      providerSettings: {},
      contextCapTokens: manifest.armConfig.contextCapTokens,
    },
    usage,
    sessions,
    trackA: {
      latency: computeLatencyStats(allTurns),
      receiptIntegrity: { chainIntact: true, signaturesValid: true, totalReceipts: 0 },
      retrieval: {},
      allTargetsMet: false, // Scored later
    },
    trackB: {
      primary: {},
      secondary: {},
      evaluators: [],
    },
    deltaVsControls: {},
  };

  return { summary, sessions };
}

interface PhaseContext {
  phase: ScenarioPhase;
  fixture: ProjectFixture;
  manifest: RunManifest;
  adapter: LlmAdapter;
  mcProxy?: McProxy;
  toolRouter?: ToolRouter;
  toolDefs?: ToolDef[];
  config: BenchConfig;
  killVariant?: KillVariant;
  isMemoryCrux: boolean;
  isCompound: boolean;
  isFileBased: boolean;
  fileProxy?: FileProxy;
}

async function executePhase(ctx: PhaseContext): Promise<SessionRecord> {
  const sessionId = randomUUID();
  const turns: TurnTelemetry[] = [];
  const outputParts: string[] = [];
  const phaseStartTime = Date.now();
  let firstSubstantiveActionMs: number | undefined;

  // Build system prompt
  const projectContext = `Project: ${ctx.fixture.project}, Phase: ${ctx.phase.name}`;
  let systemPrompt: string;

  if (ctx.isCompound) {
    systemPrompt = compoundSystemPrompt({
      capTokens: ctx.manifest.armConfig.contextCapTokens,
      projectContext,
    });
  } else if (ctx.isMemoryCrux) {
    systemPrompt = memoryCruxSystemPrompt({
      capTokens: ctx.manifest.armConfig.contextCapTokens,
      projectContext,
      availableTools: [...BENCHMARK_TOOLS],
    });
  } else if (ctx.isFileBased && ctx.fileProxy) {
    systemPrompt = fileBasedSystemPrompt({
      memoryIndex: ctx.fileProxy.getMemoryIndex(),
      projectContext,
    });
  } else {
    systemPrompt = flatContextSystemPrompt({
      corpus: ctx.fixture.corpus,
      constraints: ctx.fixture.constraints,
      capTokens: ctx.manifest.armConfig.contextCapTokens,
      projectContext,
    });
  }

  // Build initial messages
  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: ctx.phase.taskPrompt },
  ];

  // Conversation loop
  let turnIndex = 0;
  while (turnIndex < ctx.config.maxTurnsPerPhase) {
    const result = await ctx.adapter.chat(
      messages,
      ctx.toolDefs,
      { maxTokens: 16384, temperature: 0.3 },
    );

    const toolCallRecords: ToolCallRecord[] = [];

    // Record turn telemetry
    const turn: TurnTelemetry = {
      turnIndex,
      role: "assistant",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cachedTokens: result.cachedTokens,
      latencyMs: result.latencyMs,
      toolCalls: toolCallRecords,
      stopReason: result.stopReason,
    };

    if (result.content) {
      outputParts.push(result.content);
    }

    // Track first substantive action (tool call or non-trivial content)
    if (firstSubstantiveActionMs == null) {
      if (result.toolUse.length > 0 || (result.content && result.content.trim().length > 50)) {
        firstSubstantiveActionMs = Date.now() - phaseStartTime;
      }
    }

    // Handle tool calls
    if (result.toolUse.length > 0 && ctx.toolRouter) {
      // Add assistant message with tool calls to conversation
      messages.push({
        role: "assistant",
        content: result.content,
        toolCalls: result.toolUse,
      });

      // Execute each tool call via the active router
      for (const tc of result.toolUse) {
        const record = await ctx.toolRouter.callTool(tc.name, tc.input);
        toolCallRecords.push(record);

        // Add tool result to conversation
        messages.push({
          role: "tool",
          content: JSON.stringify(record.result),
          toolCallId: tc.id,
        });
      }

      turns.push(turn);
      turnIndex++;

      // Check for in-phase kill
      if (ctx.killVariant?.killAtTurnInPhase != null && turnIndex >= ctx.killVariant.killAtTurnInPhase) {
        console.log(`    [KILL] ${ctx.killVariant.label} at turn ${turnIndex}`);
        break;
      }

      continue; // Let the LLM respond to tool results
    }

    // No tool calls — this is a final text response
    messages.push({ role: "assistant", content: result.content });
    turns.push(turn);
    turnIndex++;
    break; // Always break on text-only response (no tool calls = final turn)
  }

  if (turnIndex >= ctx.config.maxTurnsPerPhase) {
    console.log(`    [MAX TURNS] Hit ${ctx.config.maxTurnsPerPhase} turn limit`);
  }

  return {
    sessionId,
    phaseIndex: ctx.phase.index,
    phaseName: ctx.phase.name,
    turns,
    killType: ctx.killVariant?.type as SessionRecord["killType"],
    output: outputParts.join("\n\n"),
    firstSubstantiveActionMs,
  };
}

function aggregateUsage(turns: TurnTelemetry[], model: string): UsageSummary {
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;

  for (const turn of turns) {
    inputTokens += turn.inputTokens;
    outputTokens += turn.outputTokens;
    cachedTokens += turn.cachedTokens;
  }

  const billableTokens = inputTokens + outputTokens;
  const estimatedCostUsd = estimateCost(
    model as Parameters<typeof estimateCost>[0],
    inputTokens,
    outputTokens,
    cachedTokens,
  );

  return { inputTokens, outputTokens, cachedTokens, billableTokens, estimatedCostUsd };
}

function computeLatencyStats(turns: TurnTelemetry[]): Record<string, { p50: number; p95: number; p99: number; count: number }> {
  const byTool: Record<string, number[]> = {};

  for (const turn of turns) {
    for (const tc of turn.toolCalls) {
      if (!byTool[tc.toolName]) byTool[tc.toolName] = [];
      byTool[tc.toolName].push(tc.latencyMs);
    }
  }

  const stats: Record<string, { p50: number; p95: number; p99: number; count: number }> = {};
  for (const [tool, latencies] of Object.entries(byTool)) {
    const sorted = latencies.sort((a, b) => a - b);
    stats[tool] = {
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      count: sorted.length,
    };
  }

  return stats;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
