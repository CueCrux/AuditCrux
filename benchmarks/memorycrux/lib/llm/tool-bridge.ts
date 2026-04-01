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
        limit: { type: "number", description: "Max results (1-50, default 8). Use 24-30 for aggregation queries." },
        scoring_profile: { type: "string", enum: ["balanced", "recall", "recency"], description: "Scoring profile: 'balanced' (default), 'recall' (aggregation/enumeration), 'recency' (knowledge updates)" },
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
  // --- M1: 7 newly wired tools ---
  {
    name: "get_freshness_report",
    description: "Get a freshness report showing how current your knowledge is across topics. Identifies stale information that may need updating.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max items to return" },
        stale_after_days: { type: "number", description: "Days after which knowledge is considered stale" },
      },
      required: [],
    },
  },
  {
    name: "check_claim",
    description: "Validate a specific claim or statement against memory records. Returns supporting and contradicting evidence.",
    inputSchema: {
      type: "object",
      properties: {
        claim_text: { type: "string", description: "The claim to verify against memory" },
        limit: { type: "number", description: "Max evidence items to return" },
      },
      required: ["claim_text"],
    },
  },
  {
    name: "get_contradictions",
    description: "Detect contradictions across memory records. Surfaces conflicting information that should be resolved before acting.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max contradictions to return" },
      },
      required: [],
    },
  },
  {
    name: "get_causal_chain",
    description: "Retrieve the causal chain (DAG) of a decision — what receipts, cursors, and prior decisions led to it.",
    inputSchema: {
      type: "object",
      properties: {
        decision_id: { type: "string", description: "Decision ID to trace the causal chain for" },
      },
      required: ["decision_id"],
    },
  },
  {
    name: "reconstruct_knowledge_state",
    description: "Time-travel: reconstruct what was known at the time a decision was made, including superseded artifacts.",
    inputSchema: {
      type: "object",
      properties: {
        decision_id: { type: "string", description: "Decision ID to reconstruct state for" },
        at_timestamp: { type: "string", description: "ISO timestamp to reconstruct state at" },
        include_superseded: { type: "boolean", description: "Include superseded artifacts (default false)" },
      },
      required: ["decision_id"],
    },
  },
  {
    name: "get_decisions_on_stale_context",
    description: "Flag decisions that were made on outdated memory. Identifies risky decisions that should be re-evaluated.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session ID to check for stale-context decisions" },
      },
      required: ["session_id"],
    },
  },
  {
    name: "get_correction_chain",
    description: "Show how a decision was revised or superseded over time. Traces the correction history.",
    inputSchema: {
      type: "object",
      properties: {
        decision_id: { type: "string", description: "Decision ID to trace corrections for" },
      },
      required: ["decision_id"],
    },
  },
];

// ---------- File-based arm tools (F1) ----------

export const FILE_TOOL_DEFS: ToolDef[] = [
  {
    name: "search_files",
    description: "Search for files by name pattern. Returns matching file paths.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Substring to match against file paths (case-insensitive)" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "read_file",
    description: "Read the full contents of a file.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "search_content",
    description: "Search across all files for a text query. Returns matching lines with file paths and line numbers.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for (case-insensitive substring match)" },
        glob: { type: "string", description: "Optional path filter (e.g., 'constraints' to search only constraint files)" },
      },
      required: ["query"],
    },
  },
];

// ---------- Compound arm tools (T3) ----------

export const COMPOUND_TOOL_DEFS: ToolDef[] = [
  {
    name: "brief_me",
    description:
      "Get a complete briefing for your current task. Returns relevant context, active constraints, prior session checkpoints, coverage gaps, freshness report, and any contradictions — all in one call. Use this at the start of every session.",
    inputSchema: {
      type: "object",
      properties: {
        task_description: {
          type: "string",
          description: "Description of the current task or goal",
        },
        token_budget: {
          type: "number",
          description: "Max tokens for the context briefing (default 8000)",
        },
        session_id: {
          type: "string",
          description: "Prior session ID to retrieve checkpoints from (if resuming work)",
        },
      },
      required: ["task_description"],
    },
  },
  {
    name: "search",
    description:
      "Search organisational memory for knowledge, decisions, and documents. Optionally verify a specific claim against memory or browse available topics.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language search query",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 10)",
        },
        topic: {
          type: "string",
          description: "Optional topic filter to narrow results",
        },
        verify_claim: {
          type: "string",
          description: "A specific claim to verify against memory (returns supporting + contradicting evidence)",
        },
        browse_topics: {
          type: "boolean",
          description: "Also return available memory topics (default false)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "safe_to_proceed",
    description:
      "Check whether a planned action is safe. Validates against active constraints and runs a composite safety assessment. Returns a go/no-go verdict. Use this before any destructive, high-risk, or irreversible action.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Description of the planned action",
        },
        resource: {
          type: "string",
          description: "Target resource (e.g., database name, service, server)",
        },
        is_mutation: {
          type: "boolean",
          description: "Whether this action modifies state (default false)",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "save_decision",
    description:
      "Record a decision with its reasoning so it persists across session boundaries. Optionally creates a checkpoint of the current session state. Use this after every significant architectural or design decision.",
    inputSchema: {
      type: "object",
      properties: {
        decision: {
          type: "string",
          description: "The decision that was made",
        },
        reasoning: {
          type: "string",
          description: "Why this decision was made",
        },
        alternatives: {
          type: "array",
          items: { type: "string" },
          description: "Alternatives that were considered",
        },
        context: {
          type: "string",
          description: "Relevant context at time of decision",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorisation",
        },
        session_id: {
          type: "string",
          description: "Current session ID (needed for checkpointing)",
        },
        checkpoint: {
          type: "boolean",
          description: "Also create a session checkpoint (default false)",
        },
        checkpoint_summary: {
          type: "string",
          description: "Summary for the checkpoint (defaults to the decision text)",
        },
        open_questions: {
          type: "array",
          items: { type: "string" },
          description: "Unresolved questions to carry forward",
        },
      },
      required: ["decision", "reasoning"],
    },
  },
];

// ── Local benchmark tools (handled in orchestrator, not on VaultCrux) ──

export const LOCAL_BENCHMARK_TOOL_DEFS: ToolDef[] = [
  {
    name: "research_memory",
    description: "Iterative multi-query investigation tool. Searches memory with multiple reformulated queries, deduplicates results, and returns a comprehensive evidence set. Use for aggregation questions ('how many', 'total') where a single query_memory call is unlikely to find ALL items. Also good for multi-session questions where facts are scattered. The tool persists across rounds — if round 1 finds 3 items, round 2 searches for more with different terms. More thorough than query_memory but uses multiple API calls internally.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The full question to research" },
        strategy: { type: "string", enum: ["broad", "aggregation", "temporal"], description: "Search strategy: 'broad' (default), 'aggregation' (for counting/summing), 'temporal' (for time-ordered events)" },
        max_rounds: { type: "number", description: "Max search rounds (1-5, default 3)" },
      },
      required: ["question"],
    },
  },
  {
    name: "date_diff",
    description: "Calculate the exact difference between two dates. ALWAYS use this for temporal questions — never compute days/weeks/months in your head. Before calling, QUOTE the exact sentence from the retrieved content that contains the date, then extract the date from the quote. This prevents picking the wrong date when multiple dates appear in one session.",
    inputSchema: {
      type: "object",
      properties: {
        from_date: { type: "string", description: "Start date (ISO 8601 or YYYY-MM-DD)" },
        to_date: { type: "string", description: "End date (ISO 8601 or YYYY-MM-DD)" },
        unit: { type: "string", enum: ["days", "weeks", "months", "years"], description: "Unit for the result (default: days)" },
      },
      required: ["from_date", "to_date"],
    },
  },
  {
    name: "get_session_by_id",
    description: "Fetch memory content by document/session ID. Use this when a retrieved result references another session or document that you want to inspect directly.",
    inputSchema: {
      type: "object",
      properties: {
        doc_id: { type: "string", description: "The document or session ID to fetch" },
      },
      required: ["doc_id"],
    },
  },
  {
    name: "structured_query",
    description: "Query the entity knowledge graph for a verified count or timeline. Only useful for aggregation questions where the entity index has extracted data. Returns structured results with confidence. If confidence >= 0.7, the count is reliable. If confidence is 0 or low, the entity index has no data for this question — use query_memory instead. Do NOT use as your first tool for non-aggregation questions.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The full question to query the entity graph with" },
      },
      required: ["question"],
    },
  },
];

export function getToolDefsForBenchmark(): ToolDef[] {
  return MEMORYCRUX_TOOL_DEFS;
}

export function getFileToolDefs(): ToolDef[] {
  return FILE_TOOL_DEFS;
}

export function getCompoundToolDefs(): ToolDef[] {
  return COMPOUND_TOOL_DEFS;
}
