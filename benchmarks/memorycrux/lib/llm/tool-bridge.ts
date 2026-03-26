// MemoryCrux Benchmark — MCP tool to LLM tool_use bridge
//
// Defines the benchmark-relevant MemoryCrux tools as LLM tool definitions.
// These are static definitions (not imported from VaultCrux) to avoid cross-package deps.

import type { ToolDef } from "./adapter.js";

export const MEMORYCRUX_TOOL_DEFS: ToolDef[] = [
  {
    name: "query_memory",
    description: "Search organisational memory for relevant knowledge, decisions, and context. Use this to recall prior work, find documents, and retrieve decision history.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search query" },
        topic: { type: "string", description: "Optional topic filter" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_relevant_context",
    description: "Retrieve a prioritised context briefing for the current task. Returns constraints, alerts, knowledge, and decisions ranked by relevance within a token budget.",
    inputSchema: {
      type: "object",
      properties: {
        task_description: { type: "string", description: "Description of the current task" },
        token_budget: { type: "number", description: "Max tokens for the briefing (default 8000)" },
        include_constraints: { type: "boolean", description: "Include active constraints (default true)" },
        include_alerts: { type: "boolean", description: "Include active alerts (default true)" },
        include_knowledge: { type: "boolean", description: "Include relevant knowledge (default true)" },
      },
      required: ["task_description"],
    },
  },
  {
    name: "check_constraints",
    description: "Check if a planned action violates any active organisational constraints. Returns matching constraints with severity levels.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Description of the planned action" },
        resource: { type: "string", description: "Target resource (e.g., database name, service)" },
        action_class: { type: "string", description: "Category of action (e.g., destructive_db_operation, schema_migration)" },
      },
      required: ["action"],
    },
  },
  {
    name: "verify_before_acting",
    description: "Composite safety gate. Checks constraints, assesses risk, and returns a go/no-go verdict for a planned action. Use this before any destructive or high-risk operation.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Description of the planned action" },
        resource: { type: "string", description: "Target resource" },
        action_class: { type: "string", description: "Category of action" },
        context: { type: "string", description: "Additional context for risk assessment" },
      },
      required: ["action"],
    },
  },
  {
    name: "record_decision_context",
    description: "Record a decision with its reasoning and context for future sessions. This persists your architectural and design decisions across session boundaries.",
    inputSchema: {
      type: "object",
      properties: {
        decision: { type: "string", description: "The decision made" },
        reasoning: { type: "string", description: "Why this decision was made" },
        alternatives_considered: {
          type: "array",
          items: { type: "string" },
          description: "Alternatives that were evaluated",
        },
        context: { type: "string", description: "Relevant context at time of decision" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for categorisation" },
      },
      required: ["decision", "reasoning"],
    },
  },
  {
    name: "checkpoint_decision_state",
    description: "Create a checkpoint of the current decision state for session continuity. Use this before a session ends or at natural breakpoints in work.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Current session identifier" },
        summary: { type: "string", description: "Summary of work completed and decisions made" },
        next_steps: {
          type: "array",
          items: { type: "string" },
          description: "Recommended next steps for the following session",
        },
        open_questions: {
          type: "array",
          items: { type: "string" },
          description: "Unresolved questions that need attention",
        },
      },
      required: ["session_id", "summary"],
    },
  },
  {
    name: "get_checkpoints",
    description: "Retrieve decision state checkpoints from prior sessions. Use this when resuming work to understand what was decided previously.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Filter by session ID" },
        limit: { type: "number", description: "Max checkpoints to return (default 5)" },
      },
      required: [],
    },
  },
  {
    name: "assess_coverage",
    description: "Assess whether you have sufficient knowledge to complete a task. Identifies gaps in coverage across relevant domains.",
    inputSchema: {
      type: "object",
      properties: {
        task_description: { type: "string", description: "Description of the task to assess coverage for" },
        domains: {
          type: "array",
          items: { type: "string" },
          description: "Domains to check coverage for (e.g., ['auth', 'billing', 'compliance'])",
        },
      },
      required: ["task_description"],
    },
  },
  {
    name: "escalate_with_context",
    description: "Escalate to a human with full context when you cannot safely proceed. Use this when you encounter uncertainty that requires human judgment.",
    inputSchema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why escalation is needed" },
        context: { type: "string", description: "Relevant context for the human" },
        suggested_action: { type: "string", description: "What you think should happen" },
        severity: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Urgency level" },
      },
      required: ["reason", "context"],
    },
  },
  {
    name: "suggest_constraint",
    description: "Suggest a new organisational constraint based on a pattern or requirement you discovered. The suggestion will be reviewed by a human before activation.",
    inputSchema: {
      type: "object",
      properties: {
        assertion: { type: "string", description: "The constraint assertion" },
        severity: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Suggested severity" },
        scope: { type: "string", description: "Scope of the constraint" },
        evidence: { type: "string", description: "Evidence supporting this constraint" },
        source: { type: "string", description: "Where you discovered this pattern" },
      },
      required: ["assertion", "severity", "evidence"],
    },
  },
  {
    name: "get_constraints",
    description: "List active organisational constraints, optionally filtered by scope or severity.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", description: "Filter by scope" },
        severity: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Filter by severity" },
        active_only: { type: "boolean", description: "Only return active constraints (default true)" },
      },
      required: [],
    },
  },
  {
    name: "get_decision_context",
    description: "Retrieve a specific decision's full context including reasoning, alternatives, and metadata.",
    inputSchema: {
      type: "object",
      properties: {
        decision_id: { type: "string", description: "Decision ID to look up" },
        query: { type: "string", description: "Search for decisions by keyword" },
      },
      required: [],
    },
  },
  {
    name: "list_topics",
    description: "List available memory topics for navigation and exploration.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max topics to return" },
      },
      required: [],
    },
  },
  {
    name: "get_platform_capabilities",
    description: "Discover available platform capabilities. Returns a manifest of tools, their trust tiers, and credit costs.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter by capability category" },
        min_trust_tier: { type: "string", description: "Minimum trust tier filter" },
      },
      required: [],
    },
  },
];

export function getToolDefsForBenchmark(): ToolDef[] {
  return MEMORYCRUX_TOOL_DEFS;
}
