/**
 * LME Deterministic Pipeline — Zero LLM at query time.
 *
 * Architecture:
 *   Ingest: conversation → LLM extraction (one-time) → structured facts
 *   Query:  question → rule-based parser → projection lookup → template answer
 *
 * No VaultCrux, no Postgres. Direct CoreCrux ingest + local fact store.
 */

import Anthropic from "@anthropic-ai/sdk";

// ── Types ──

interface ExtractedFact {
  entity: string;
  predicate: string;
  value: string;
  date?: string;
  sessionId: string;
  source: "user" | "assistant";
}

interface ExtractedPreference {
  entity: string;
  preference: string;
  polarity: "positive" | "negative";
  constraint?: string;
}

interface ExtractedEvent {
  event: string;
  date: string;
  location?: string;
  sessionId: string;
}

interface FactStore {
  facts: ExtractedFact[];
  preferences: ExtractedPreference[];
  events: ExtractedEvent[];
}

// ── Phase 1: Extraction ──

const EXTRACTION_PROMPT = `Extract ALL facts, preferences, and events from this conversation.

Output JSON with three arrays:
{
  "facts": [{"entity": "...", "predicate": "...", "value": "...", "date": "YYYY-MM-DD or null", "source": "user|assistant"}],
  "preferences": [{"entity": "...", "preference": "...", "polarity": "positive|negative", "constraint": "...or null"}],
  "events": [{"event": "...", "date": "YYYY-MM-DD", "location": "...or null"}]
}

Rules:
- Extract EVERY factual statement (names, numbers, dates, places, activities, possessions, relationships)
- For preferences: "I love X" = positive, "I don't like X" = negative, "I prefer X over Y" = positive for X
- For events: anything with a specific date
- Include facts from BOTH user and assistant turns
- If the assistant recommends something and the user accepts, that's a fact
- Dates: extract the actual date, not relative terms. If the conversation header says [Date: 2023-05-20], use that as context.
- Be exhaustive — missing a fact is worse than extracting a redundant one

Conversation:
`;

/**
 * Extract structured facts from a conversation session using Claude.
 */
export async function extractFacts(
  content: string,
  sessionId: string,
  anthropicApiKey: string,
): Promise<FactStore> {
  const client = new Anthropic({ apiKey: anthropicApiKey });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content: EXTRACTION_PROMPT + content }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";

  // Parse JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { facts: [], preferences: [], events: [] };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      facts?: Array<{ entity: string; predicate: string; value: string; date?: string; source?: string }>;
      preferences?: Array<{ entity: string; preference: string; polarity?: string; constraint?: string }>;
      events?: Array<{ event: string; date: string; location?: string }>;
    };

    return {
      facts: (parsed.facts ?? []).map((f) => ({
        entity: f.entity,
        predicate: f.predicate,
        value: f.value,
        date: f.date ?? undefined,
        sessionId,
        source: (f.source as "user" | "assistant") ?? "user",
      })),
      preferences: (parsed.preferences ?? []).map((p) => ({
        entity: p.entity,
        preference: p.preference,
        polarity: (p.polarity as "positive" | "negative") ?? "positive",
        constraint: p.constraint ?? undefined,
      })),
      events: (parsed.events ?? []).map((e) => ({
        event: e.event,
        date: e.date,
        location: e.location ?? undefined,
        sessionId,
      })),
    };
  } catch {
    return { facts: [], preferences: [], events: [] };
  }
}

// ── Phase 3: Question Parser ──

type QuestionOp =
  | { type: "COUNT"; entity: string; predicate?: string }
  | { type: "SUM"; entity: string; predicate: string }
  | { type: "DATE_DIFF"; event_a: string; event_b?: string }
  | { type: "LATEST"; entity: string; predicate: string }
  | { type: "PREVIOUS"; entity: string; predicate: string }
  | { type: "EVENT_DATE"; event: string }
  | { type: "PREFERENCE"; entity: string }
  | { type: "EXISTS"; entity: string; predicate: string }
  | { type: "LOOKUP"; query: string }
  | { type: "DIFF"; entity_a: string; entity_b: string; predicate: string }
  | { type: "LIST"; entity: string; predicate?: string };

/**
 * Rule-based question parser — classifies question into operation + entities.
 */
export function parseQuestion(question: string): QuestionOp {
  const q = question.toLowerCase();

  // COUNT patterns
  if (/how many|how much|total number|count of/.test(q)) {
    const entityMatch = question.match(/how (?:many|much) (.+?)(?:\s+(?:do|did|have|has|are|is|was|were|can|could)\s+I|\?)/i);
    const entity = entityMatch?.[1]?.trim() ?? question.replace(/how (?:many|much)\s*/i, "").replace(/\?.*/, "").trim();
    return { type: "COUNT", entity };
  }

  // DATE_DIFF patterns
  if (/how (?:many|long) (?:days|weeks|months|years)|how long (?:ago|since|has it been)/.test(q)) {
    const eventMatch = question.match(/since (?:I |my )?(.+?)(?:\?|$)/i) ?? question.match(/ago (?:did|was) (?:I |my )?(.+?)(?:\?|$)/i);
    return { type: "DATE_DIFF", event_a: eventMatch?.[1]?.trim() ?? question };
  }

  // LATEST / current patterns
  if (/(?:current|currently|latest|most recent|now|present)\b/.test(q) || /what (?:is|are) my (?:current|latest)/.test(q)) {
    const predMatch = question.match(/(?:current|latest|most recent|present) (.+?)(?:\?|$)/i);
    return { type: "LATEST", entity: "user", predicate: predMatch?.[1]?.trim() ?? question };
  }

  // PREVIOUS patterns
  if (/previous|former|before|old|last\b/.test(q) && /what (?:was|were)/.test(q)) {
    const predMatch = question.match(/(?:previous|former|old) (.+?)(?:\?|$)/i);
    return { type: "PREVIOUS", entity: "user", predicate: predMatch?.[1]?.trim() ?? question };
  }

  // EVENT_DATE patterns
  if (/when did|what date|what day/.test(q)) {
    const eventMatch = question.match(/when did (?:I |you |my )?(.+?)(?:\?|$)/i);
    return { type: "EVENT_DATE", event: eventMatch?.[1]?.trim() ?? question };
  }

  // PREFERENCE patterns
  if (/(?:do I (?:like|prefer|enjoy|love|hate|dislike))|(?:what (?:is|are) my (?:favorite|preferred|favourite))/.test(q)) {
    const entityMatch = question.match(/(?:favorite|preferred|favourite) (.+?)(?:\?|$)/i) ??
      question.match(/(?:like|prefer|enjoy|love) (.+?)(?:\?|$)/i);
    return { type: "PREFERENCE", entity: entityMatch?.[1]?.trim() ?? question };
  }

  // EXISTS patterns
  if (/did I ever|have I ever|do I have/.test(q)) {
    const predMatch = question.match(/(?:did|have|do) I (?:ever )?(.+?)(?:\?|$)/i);
    return { type: "EXISTS", entity: "user", predicate: predMatch?.[1]?.trim() ?? question };
  }

  // DIFF patterns
  if (/how much (?:more|less)|difference between|compared to/.test(q)) {
    return { type: "DIFF", entity_a: "", entity_b: "", predicate: question };
  }

  // LIST patterns
  if (/(?:list|what are|name) (?:all |the )?/.test(q) && /(?:my|I)/.test(q)) {
    const entityMatch = question.match(/(?:list|what are|name) (?:all |the )?(?:my )?(.+?)(?:\?|$)/i);
    return { type: "LIST", entity: entityMatch?.[1]?.trim() ?? question };
  }

  // Default: LOOKUP (BM25 search)
  return { type: "LOOKUP", query: question };
}

// ── Phase 4: Projection Query + Answer ──

/**
 * Answer a question deterministically from the fact store.
 * No LLM call. Pure lookup + computation + template.
 */
export function answerFromProjections(
  op: QuestionOp,
  store: FactStore,
  question: string,
): string | null {
  const q = question.toLowerCase();

  // Universal fuzzy search helper
  const fuzzySearch = (searchTerms: string): ExtractedFact | null => {
    const stopwords = new Set(["the", "what", "was", "were", "did", "does", "how", "when", "where", "who", "which", "that", "this", "with", "from", "your", "have", "has", "been", "about", "can", "you", "tell", "remind", "remember", "previous", "conversation", "mentioned", "talked", "said", "know", "many", "much"]);
    const keywords = searchTerms.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !stopwords.has(w));
    let best: ExtractedFact | null = null;
    let bestScore = 0;
    for (const fact of store.facts) {
      const text = `${fact.entity} ${fact.predicate} ${fact.value}`.toLowerCase();
      const score = keywords.filter((kw) => text.includes(kw)).length;
      if (score > bestScore) { bestScore = score; best = fact; }
    }
    for (const pref of store.preferences) {
      const text = `${pref.entity} ${pref.preference} ${pref.constraint ?? ""}`.toLowerCase();
      const score = keywords.filter((kw) => text.includes(kw)).length;
      if (score > bestScore) { bestScore = score; best = { entity: pref.entity, predicate: "preference", value: pref.preference, sessionId: "", source: "user" }; }
    }
    for (const event of store.events) {
      const text = `${event.event} ${event.location ?? ""}`.toLowerCase();
      const score = keywords.filter((kw) => text.includes(kw)).length;
      if (score > bestScore) { bestScore = score; best = { entity: event.event, predicate: "event", value: event.date, date: event.date, sessionId: event.sessionId, source: "user" }; }
    }
    return bestScore >= 1 ? best : null;
  };

  switch (op.type) {
    case "COUNT": {
      const entity = (op.entity ?? "").toLowerCase();
      const matching = store.facts.filter(
        (f) => f.entity.toLowerCase().includes(entity) || f.predicate.toLowerCase().includes(entity) || f.value.toLowerCase().includes(entity),
      );
      if (matching.length === 0) return null;
      // Deduplicate by value
      const unique = new Set(matching.map((f) => f.value.toLowerCase()));
      return String(unique.size);
    }

    case "LATEST": {
      const pred = (op.predicate ?? "").toLowerCase();
      const matching = store.facts
        .filter((f) => f.predicate.toLowerCase().includes(pred) || f.value.toLowerCase().includes(pred))
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
      if (matching.length > 0) return matching[0]!.value;
      // Fuzzy fallback
      const fb = fuzzySearch(question);
      return fb?.value ?? null;
    }

    case "PREVIOUS": {
      const pred = (op.predicate ?? "").toLowerCase();
      const matching = store.facts
        .filter((f) => f.predicate.toLowerCase().includes(pred))
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
      if (matching.length < 2) return null;
      return matching[1]!.value; // second most recent
    }

    case "EVENT_DATE": {
      const event = (op.event ?? "").toLowerCase();
      const matching = store.events.filter((e) => e.event.toLowerCase().includes(event));
      if (matching.length > 0) return matching[0]!.date;
      const factMatch = store.facts.filter(
        (f) => f.date && (f.predicate.toLowerCase().includes(event) || f.value.toLowerCase().includes(event)),
      );
      if (factMatch.length > 0) return factMatch[0]!.date!;
      const fb = fuzzySearch(question);
      return fb?.date ?? fb?.value ?? null;
    }

    case "DATE_DIFF": {
      const event = (op.event_a ?? "").toLowerCase();
      const matching = store.events.filter((e) => e.event.toLowerCase().includes(event));
      if (matching.length === 0) return null;
      // Parse date and compute diff from question_date (approximate)
      return matching[0]!.date;
    }

    case "PREFERENCE": {
      const entity = (op.entity ?? "").toLowerCase();
      const positive = store.preferences.filter(
        (p) => p.polarity === "positive" && (p.preference.toLowerCase().includes(entity) || p.entity.toLowerCase().includes(entity)),
      );
      if (positive.length > 0) return positive[0]!.preference;
      // Fall back to facts about preferences
      const factMatch = store.facts.filter(
        (f) => (f.predicate.toLowerCase().includes("favorite") || f.predicate.toLowerCase().includes("prefer") || f.predicate.toLowerCase().includes("like"))
          && (f.value.toLowerCase().includes(entity) || f.entity.toLowerCase().includes(entity)),
      );
      if (factMatch.length > 0) return factMatch[0]!.value;
      return null;
    }

    case "EXISTS": {
      const pred = (op.predicate ?? "").toLowerCase();
      const exists = store.facts.some(
        (f) => f.predicate.toLowerCase().includes(pred) || f.value.toLowerCase().includes(pred),
      );
      return exists ? "Yes" : null;
    }

    case "LIST": {
      const entity = (op.entity ?? "").toLowerCase();
      const matching = store.facts.filter(
        (f) => f.entity.toLowerCase().includes(entity) || f.predicate.toLowerCase().includes(entity),
      );
      if (matching.length === 0) return null;
      const unique = [...new Set(matching.map((f) => f.value))];
      return unique.join(", ");
    }

    case "LOOKUP": {
      // Fuzzy keyword search over all facts — match question words against fact text
      const stopwords = new Set(["the", "what", "was", "were", "did", "does", "how", "when", "where", "who", "which", "that", "this", "with", "from", "your", "have", "has", "been", "about", "can", "you", "tell", "remind", "remember", "previous", "conversation", "mentioned", "talked", "said", "know"]);
      const keywords = q.split(/\s+/).filter((w) => w.length > 2 && !stopwords.has(w));
      let bestFact: ExtractedFact | null = null;
      let bestScore = 0;
      for (const fact of store.facts) {
        const text = `${fact.entity} ${fact.predicate} ${fact.value}`.toLowerCase();
        const score = keywords.filter((kw) => text.includes(kw)).length;
        if (score > bestScore) {
          bestScore = score;
          bestFact = fact;
        }
      }
      // Also check preferences
      for (const pref of store.preferences) {
        const text = `${pref.entity} ${pref.preference} ${pref.polarity} ${pref.constraint ?? ""}`.toLowerCase();
        const score = keywords.filter((kw) => text.includes(kw)).length;
        if (score > bestScore) {
          bestScore = score;
          bestFact = { entity: pref.entity, predicate: "preference", value: pref.preference, sessionId: "", source: "user" };
        }
      }
      // Also check events
      for (const event of store.events) {
        const text = `${event.event} ${event.date} ${event.location ?? ""}`.toLowerCase();
        const score = keywords.filter((kw) => text.includes(kw)).length;
        if (score > bestScore) {
          bestScore = score;
          bestFact = { entity: event.event, predicate: "event_date", value: event.date, date: event.date, sessionId: event.sessionId, source: "user" };
        }
      }
      if (bestFact && bestScore >= 1) return bestFact.value;
      return null;
    }

    default:
      return null;
  }
}

// ── Phase 5: Confidence Router ──

export type ConfidenceTier = "high" | "medium" | "low";

/**
 * Route a question by projection coverage.
 * HIGH → projection answer is authoritative
 * MEDIUM → answer exists but may be incomplete
 * LOW → fall back to BM25 text search
 */
export function routeByConfidence(
  op: QuestionOp,
  store: FactStore,
  question: string,
): { tier: ConfidenceTier; answer: string | null } {
  const answer = answerFromProjections(op, store, question);

  if (answer !== null) {
    // Check if answer seems complete
    if (op.type === "COUNT" || op.type === "LATEST" || op.type === "PREFERENCE" || op.type === "EXISTS") {
      return { tier: "high", answer };
    }
    return { tier: "medium", answer };
  }

  // No projection answer — fall to BM25
  return { tier: "low", answer: null };
}

// ── Full Pipeline ──

export interface DeterministicAnswer {
  questionId: string;
  question: string;
  operation: QuestionOp;
  tier: ConfidenceTier;
  answer: string;
  source: "projection" | "bm25_fallback" | "insufficient";
}

/**
 * Answer a single LME question through the deterministic pipeline.
 * Zero LLM calls at query time.
 */
export function answerDeterministic(
  questionId: string,
  question: string,
  store: FactStore,
  bm25Fallback?: (query: string) => string | null,
): DeterministicAnswer {
  const op = parseQuestion(question);
  const { tier, answer } = routeByConfidence(op, store, question);

  if (answer !== null) {
    return { questionId, question, operation: op, tier, answer, source: "projection" };
  }

  // Universal fuzzy fallback — try matching question keywords against ALL extracted data
  if (store.facts.length > 0 || store.preferences.length > 0 || store.events.length > 0) {
    const stopwords = new Set(["the", "what", "was", "were", "did", "does", "how", "when", "where", "who", "which", "that", "this", "with", "from", "your", "have", "has", "been", "about", "can", "you", "tell", "remind", "remember", "previous", "conversation", "mentioned", "talked", "said", "know", "many", "much", "going", "back", "looking", "wondering"]);
    const keywords = question.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !stopwords.has(w));

    // Score all facts
    let bestValue = "";
    let bestScore = 0;
    for (const f of store.facts) {
      const text = `${f.entity} ${f.predicate} ${f.value}`.toLowerCase();
      const score = keywords.filter((kw) => text.includes(kw)).length;
      if (score > bestScore) { bestScore = score; bestValue = f.value; }
    }
    for (const p of store.preferences) {
      const text = `${p.entity} ${p.preference} ${p.constraint ?? ""}`.toLowerCase();
      const score = keywords.filter((kw) => text.includes(kw)).length;
      if (score > bestScore) { bestScore = score; bestValue = p.preference; }
    }
    for (const e of store.events) {
      const text = `${e.event} ${e.location ?? ""} ${e.date}`.toLowerCase();
      const score = keywords.filter((kw) => text.includes(kw)).length;
      if (score > bestScore) { bestScore = score; bestValue = `${e.event} (${e.date})`; }
    }

    if (bestScore >= 1 && bestValue) {
      return { questionId, question, operation: op, tier: "medium", answer: bestValue, source: "projection" };
    }
  }

  // Tier 3: BM25 fallback
  if (bm25Fallback) {
    const fallbackAnswer = bm25Fallback(question);
    if (fallbackAnswer) {
      return { questionId, question, operation: op, tier: "low", answer: fallbackAnswer, source: "bm25_fallback" };
    }
  }

  return {
    questionId,
    question,
    operation: op,
    tier: "low",
    answer: "Based on the available conversations, there is insufficient information to answer this question.",
    source: "insufficient",
  };
}
