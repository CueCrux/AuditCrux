# TODO: Force-Route Investigation for Hard Questions

**Status:** Future investigation
**Created:** 2026-04-01
**Context:** Agent ignores new deterministic tools (enumerate_memory_facts, build_timeline, etc.)
even when prompt says to use them. Pre-injecting results into prompt is the current fix.
Force-routing in the orchestrator (bypassing agent tool choice) would be more reliable
for the hardest questions.

## What force-routing means

Detect question type in the orchestrator BEFORE sending to the LLM, call the appropriate
tool deterministically, and inject both the tool result AND the tool call into the message
history so the agent sees it as if it made the call itself.

## Candidate questions for investigation

These are the hardest failures where the agent repeatedly picks wrong tools or gives up
despite structured data being available:

### INCOMPLETE_ENUMERATION (force enumerate_memory_facts + derive_from_facts)

- `gpt4_194be4b3` — "How many musical instruments do I currently own?" (gold: 4, got: wrong count)
- `e3038f8c` — "How many rare items do I have in total?" (gold: 99, got: wrong sum)
- `d851d5ba` — "How much money did I raise for charity?" (gold: $3,750, got: partial)
- `gpt4_731e37d7` — "How much total money did I spend on workshops?" (gold: $720, got: wrong)
- `gpt4_7fce9456` — "How many properties did I view?" (gold: 4, got: wrong count)
- `c4a1ceb8` — "How many citrus fruits in cocktails?" (gold: 3, got: overcounted)
- `28dc39ac` — "How many hours playing games?" (gold: 140, got: partial)
- `0a995998` — "How many clothing items to pick up?" (gold: 3, got: 2)
- `gpt4_ab202e7f` — "How many kitchen items replaced?" (gold: 5, got: partial)
- `gpt4_15e38248` — "How many furniture pieces?" (gold: 4, got: 3)

### TEMPORAL (force build_timeline + date_diff)

- `gpt4_468eb063` — "How many days ago did I meet Emma?" (gold: 9, got: 16 — wrong date picked)
- `gpt4_7abb270c` — "Order of six museums visited" (gold: specific order, got: wrong order)
- `gpt4_45189cb4` — "Order of sports events in January" (gold: 3 events, got: wrong order)
- `370a8ff4` — "Weeks since flu to 10th jog" (gold: 15, got: 11.6 — wrong jog date)

### KNOWLEDGE UPDATE (force dual recency search + get_correction_chain)

- `830ce83f` — "Where did Rachel move?" (gold: suburbs, got: Chicago — stale value)
- `2698e78f` — "How often do I see Dr. Smith?" (gold: weekly, got: bi-weekly — stale)
- `0e4e4c46` — "Current highest Ticket to Ride score?" (gold: 132, got: 124 — stale)

## Implementation approach

```typescript
// In orchestrator, before answerQuestion:
const qtype = detectQuestionType(problem.question);
if (qtype === "aggregation") {
  // Force-inject enumerate_memory_facts call result as first tool message
  const facts = await callFactApi("enumerate", { query: problem.question }, tenantId);
  messages.push({ role: "assistant", content: "Let me check the structured entity index.", toolCalls: [{ id: "force-1", name: "enumerate_memory_facts", input: { query: problem.question } }] });
  messages.push({ role: "tool", content: JSON.stringify(facts), toolCallId: "force-1" });
}
```

## When to implement

After confirming that pre-injection into the system prompt delivers measurable gains.
If pre-injection alone doesn't recover these questions, force-routing is the next escalation.
