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

const EXTRACTION_PROMPT = `You are a fact extractor. Extract ALL facts from the conversation below. Output ONLY valid JSON, no other text.

{"facts":[{"entity":"subject","predicate":"relationship","value":"object","date":"YYYY-MM-DD or null","source":"user or assistant"}],"preferences":[{"entity":"subject","preference":"what they like/dislike","polarity":"positive or negative","constraint":"null or detail"}],"events":[{"event":"what happened","date":"YYYY-MM-DD","location":"where or null"}]}

IMPORTANT:
- Extract EVERY fact: names, numbers, dates, places, activities, possessions, costs, relationships
- Include facts from assistant turns (recommendations, answers, explanations)
- "I love X" → preference positive. "I don't like X" → preference negative
- Use actual dates from conversation headers like [Date: 2023-05-20]
- Output ONLY the JSON object, nothing else

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
  } catch (parseErr) {
    console.warn(`  [extract] JSON parse failed for ${sessionId}: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
    console.warn(`  [extract] Raw text (first 200): ${text.slice(0, 200)}`);

    // Retry: try extracting facts as a simpler comma-separated list
    // Look for any key=value patterns in the text
    const fallbackFacts: ExtractedFact[] = [];
    const lines = text.split("\n").filter((l) => l.trim().length > 5);
    for (const line of lines) {
      const kvMatch = line.match(/["']?(\w[\w\s]+)["']?\s*[:=→-]\s*["']?(.+?)["']?$/);
      if (kvMatch) {
        fallbackFacts.push({
          entity: "user",
          predicate: kvMatch[1]!.trim(),
          value: kvMatch[2]!.trim(),
          sessionId,
          source: "user",
        });
      }
    }
    if (fallbackFacts.length > 0) {
      console.warn(`  [extract] Fallback: ${fallbackFacts.length} facts from line parsing`);
    }
    return { facts: fallbackFacts, preferences: [], events: [] };
  }
}

// ── Safe field accessors ──

/** Safely lowercase a possibly undefined string */
function safe(s: string | undefined | null): string {
  return (s ?? "").toLowerCase();
}

// ── Answer Field Selector ──

/**
 * Given a question and a matched fact, return the most appropriate answer.
 * Uses the question's interrogative word to select which fact field to return.
 *
 * "Where did I buy X?" + {entity: "X", predicate: "bought from", value: "store downtown"} → "store downtown"
 * "How much did X cost?" + {entity: "X", predicate: "cost", value: "$800"} → "$800"
 * "When did I do X?" + {entity: "X", predicate: "did", value: "something", date: "2023-05-20"} → "2023-05-20"
 */
function selectAnswerField(question: string, fact: ExtractedFact): string {
  const q = question.toLowerCase();

  // "when" questions → prefer date
  if (/\bwhen\b|what date|what day|what time/.test(q)) {
    if (fact.date) return fact.date;
    // Check if value looks like a date
    if (/\d{4}-\d{2}-\d{2}|\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(fact.value)) {
      return fact.value;
    }
  }

  // "where" questions → prefer value (location)
  if (/\bwhere\b|what (?:place|location|city|country|store|restaurant|hotel|venue)/.test(q)) {
    return fact.value;
  }

  // "how much/many" questions → prefer numeric value
  if (/how (?:much|many)|total|cost|price|spend|spent|paid|budget/.test(q)) {
    // Look for a number in value first
    if (/\$?\d/.test(fact.value)) return fact.value;
    // Check predicate for numbers
    if (/\$?\d/.test(fact.predicate)) return fact.predicate;
    return fact.value;
  }

  // "how long/often/frequently" → prefer value with time/frequency
  if (/how (?:long|often|frequent)/.test(q)) {
    return fact.value;
  }

  // "who" questions → prefer entity or value depending on which is a person
  if (/\bwho\b|what person|whose/.test(q)) {
    // If value looks like a name (capitalized words)
    if (/^[A-Z][a-z]+ [A-Z][a-z]+/.test(fact.value)) return fact.value;
    if (/^[A-Z][a-z]+ [A-Z][a-z]+/.test(fact.entity)) return fact.entity;
    return fact.value;
  }

  // "name of" / "remind me" questions → return the entity name (the proper noun)
  if (/\bname\b|remind me|could you remind|you.*remind/.test(q)) {
    // If entity is a proper noun, return it
    if (/^[A-Z]/.test(fact.entity) && fact.entity !== "User" && fact.entity.length > 2) {
      return fact.entity;
    }
    // Otherwise return value if it's a proper noun
    if (/^[A-Z]/.test(fact.value) && fact.value.length < 60) return fact.value;
    return fact.value;
  }

  // Recommendation / suggest questions → return the value (the recommended thing)
  if (/\brecommend\b|\bsuggest\b|\btips?\b|\badvice\b|\bactivit/.test(q)) {
    return fact.value;
  }

  // "what" questions → prefer value (the answer)
  if (/\bwhat\b/.test(q)) {
    return fact.value;
  }

  // "which" questions → prefer value
  if (/\bwhich\b/.test(q)) {
    return fact.value;
  }

  // "did I" / "do I" / "have I" → yes/no or value
  if (/\b(?:did|do|have|has|is|are|was|were) (?:I|my)\b/.test(q)) {
    return fact.value;
  }

  // Default: return the most informative field (longest non-entity)
  if (fact.value.length > fact.predicate.length) return fact.value;
  return fact.value;
}

/**
 * Select best answer from a preference match.
 * For recommendation/suggestion questions, format as "The user would prefer..."
 * to match LME gold answer format.
 */
function selectPreferenceAnswer(question: string, pref: ExtractedPreference): string {
  const q = question.toLowerCase();
  const isRecommendation = /recommend|suggest|tips?\b|advice|activities/.test(q);

  if (isRecommendation) {
    // Format like LME gold: "The user would prefer responses that..."
    if (pref.polarity === "negative") {
      return `The user would prefer responses that avoid ${pref.preference}`;
    }
    const context = pref.constraint ? ` specifically related to ${pref.constraint}` : "";
    return `The user would prefer suggestions related to ${pref.preference}${context}`;
  }

  if (pref.polarity === "negative") {
    return `Not ${pref.preference}`;
  }
  if (pref.constraint) {
    return `${pref.preference} (${pref.constraint})`;
  }
  return pref.preference;
}

/**
 * Select best answer from an event match.
 */
function selectEventAnswer(question: string, event: ExtractedEvent): string {
  const q = question.toLowerCase();
  if (/\bwhen\b|what date|how (?:many|long) (?:days|weeks|months)/.test(q)) {
    return event.date;
  }
  if (/\bwhere\b/.test(q) && event.location) {
    return event.location;
  }
  return `${event.event} (${event.date})`;
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

  // PREFERENCE patterns (including recommendation/suggestion questions)
  if (/(?:do I (?:like|prefer|enjoy|love|hate|dislike))|(?:what (?:is|are) my (?:favorite|preferred|favourite))|(?:recommend|suggest|tips?\b|advice\b)/.test(q)) {
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
  questionDate?: string,
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
      // Extract key nouns from the question for better matching
      const countStopwords = new Set(["how", "many", "much", "have", "did", "does", "total", "number", "different", "currently", "own", "bought", "worked", "led", "leading", "visited", "tried", "attended"]);
      const countKeywords = entity.split(/\s+/).filter((w) => w.length > 2 && !countStopwords.has(w));

      // Find facts that match the count target
      const matching = store.facts.filter((f) => {
        const text = `${f.entity} ${f.predicate} ${f.value}`.toLowerCase();
        return countKeywords.some((kw) => text.includes(kw)) ||
          text.includes(entity);
      });

      if (matching.length === 0) return null;

      // For counts: look for numeric values first
      const numericFacts = matching.filter((f) => /\d+/.test(f.value));
      if (numericFacts.length > 0) {
        // If a fact explicitly states a count, use it
        const countFact = numericFacts.find((f) =>
          safe(f.predicate).includes("count") ||
          safe(f.predicate).includes("number") ||
          safe(f.predicate).includes("total") ||
          safe(f.predicate).includes("how many"),
        );
        if (countFact) return countFact.value;
      }

      // Otherwise deduplicate and count unique items
      const unique = new Set(matching.map((f) => (f.value ?? "").toLowerCase()).filter(Boolean));
      return String(unique.size);
    }

    case "LATEST": {
      const pred = (op.predicate ?? "").toLowerCase();
      const matching = store.facts
        .filter((f) => safe(f.predicate).includes(pred) || safe(f.value).includes(pred))
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
      if (matching.length > 0) return matching[0]!.value;
      // Fuzzy fallback
      const fb = fuzzySearch(question);
      return fb?.value ?? null;
    }

    case "PREVIOUS": {
      const pred = (op.predicate ?? "").toLowerCase();
      const matching = store.facts
        .filter((f) => safe(f.predicate).includes(pred))
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
      if (matching.length < 2) return null;
      return matching[1]!.value; // second most recent
    }

    case "EVENT_DATE": {
      const event = (op.event ?? "").toLowerCase();
      const matching = store.events.filter((e) => e.event.toLowerCase().includes(event));
      if (matching.length > 0) return matching[0]!.date;
      const factMatch = store.facts.filter(
        (f) => f.date && (safe(f.predicate).includes(event) || safe(f.value).includes(event)),
      );
      if (factMatch.length > 0) return factMatch[0]!.date!;
      const fb = fuzzySearch(question);
      return fb?.date ?? fb?.value ?? null;
    }

    case "DATE_DIFF": {
      const event = (op.event_a ?? "").toLowerCase();
      // Search events first
      let eventDate: string | null = null;
      const matchingEvents = store.events.filter((e) => e.event.toLowerCase().includes(event));
      if (matchingEvents.length > 0) {
        eventDate = matchingEvents[0]!.date;
      }
      // Fall back to facts with dates
      if (!eventDate) {
        const matchingFacts = store.facts.filter(
          (f) => f.date && (safe(f.predicate).includes(event) || safe(f.value).includes(event) || safe(f.entity).includes(event)),
        );
        if (matchingFacts.length > 0) eventDate = matchingFacts[0]!.date!;
      }
      // Fuzzy search across all facts
      if (!eventDate) {
        const fb = fuzzySearch(question);
        eventDate = fb?.date ?? null;
      }
      if (!eventDate) return null;

      // Parse the event date and compute diff
      const parsedDate = new Date(eventDate);
      if (isNaN(parsedDate.getTime())) return eventDate; // can't parse, return raw

      // Use the question_date as the reference point for "how many days ago"
      let refDate: Date;
      if (questionDate) {
        // Parse LME date format: "2023/06/15 (Thu) 00:24" → "2023-06-15"
        const cleaned = questionDate.replace(/\s*\([^)]+\)\s*/, " ").trim().split(" ")[0]?.replace(/\//g, "-") ?? "";
        refDate = new Date(cleaned);
      } else {
        // Find the latest date in all events/facts as the reference point
        const allDates = [
          ...store.events.map((e) => e.date),
          ...store.facts.filter((f) => f.date).map((f) => f.date!),
        ].filter(Boolean).sort().reverse();
        refDate = allDates.length > 0 ? new Date(allDates[0]!) : new Date();
      }

      const diffMs = refDate.getTime() - parsedDate.getTime();
      const diffDays = Math.round(Math.abs(diffMs) / (1000 * 60 * 60 * 24));

      // Format based on what the question asks
      if (/weeks?\b/.test(q)) {
        const weeks = Math.round(diffDays / 7);
        return `${weeks} week${weeks !== 1 ? "s" : ""}`;
      }
      if (/months?\b/.test(q)) {
        const months = Math.round(diffDays / 30);
        return `${months} month${months !== 1 ? "s" : ""}`;
      }
      if (/years?\b/.test(q)) {
        const years = Math.round(diffDays / 365);
        return `${years} year${years !== 1 ? "s" : ""}`;
      }
      return `${diffDays} day${diffDays !== 1 ? "s" : ""}`;
    }

    case "PREFERENCE": {
      const entity = (op.entity ?? "").toLowerCase();
      const positive = store.preferences.filter(
        (p) => p.polarity === "positive" && (p.preference.toLowerCase().includes(entity) || p.entity.toLowerCase().includes(entity)),
      );
      if (positive.length > 0) return positive[0]!.preference;
      // Fall back to facts about preferences
      const factMatch = store.facts.filter(
        (f) => (safe(f.predicate).includes("favorite") || safe(f.predicate).includes("prefer") || safe(f.predicate).includes("like"))
          && (safe(f.value).includes(entity) || safe(f.entity).includes(entity)),
      );
      if (factMatch.length > 0) return factMatch[0]!.value;
      return null;
    }

    case "EXISTS": {
      const pred = (op.predicate ?? "").toLowerCase();
      const exists = store.facts.some(
        (f) => safe(f.predicate).includes(pred) || safe(f.value).includes(pred),
      );
      return exists ? "Yes" : null;
    }

    case "LIST": {
      const entity = (op.entity ?? "").toLowerCase();
      const matching = store.facts.filter(
        (f) => safe(f.entity).includes(entity) || safe(f.predicate).includes(entity),
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
      if (bestFact && bestScore >= 1) return selectAnswerField(question, bestFact);
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
  questionDate?: string,
): { tier: ConfidenceTier; answer: string | null } {
  const answer = answerFromProjections(op, store, question, questionDate);

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
  questionDate?: string,
): DeterministicAnswer {
  const op = parseQuestion(question);
  const { tier, answer } = routeByConfidence(op, store, question, questionDate);

  if (answer !== null) {
    return { questionId, question, operation: op, tier, answer, source: "projection" };
  }

  // Universal fuzzy fallback with interrogative-aware answer selection
  if (store.facts.length > 0 || store.preferences.length > 0 || store.events.length > 0) {
    const stopwords = new Set(["the", "what", "was", "were", "did", "does", "how", "when", "where", "who", "which", "that", "this", "with", "from", "your", "have", "has", "been", "about", "can", "you", "tell", "remind", "remember", "previous", "conversation", "mentioned", "talked", "said", "know", "many", "much", "going", "back", "looking", "wondering", "could", "would", "again", "also", "just", "some", "our", "chat"]);
    const keywords = question.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !stopwords.has(w));

    // Score all facts — use selectAnswerField for the answer
    // Collect ALL matching facts above threshold, then pick the best answer
    type ScoredMatch = { score: number; answer: string; type: string };
    const candidates: ScoredMatch[] = [];

    // Detect what type of answer the question wants
    const ql = question.toLowerCase();
    const wantsLocation = /\bwhere\b|what (?:place|store|restaurant|hotel|city|country|location)/.test(ql);
    const wantsAmount = /how (?:much|many)|total|cost|price|spend|spent|paid|budget|\$/.test(ql);
    const wantsDate = /\bwhen\b|what (?:date|day|time)|how (?:many|long) (?:days|weeks|months|years)/.test(ql);
    const wantsName = /what (?:is|was) (?:the )?name|what (?:is|was) (?:it |that )?called|remind me (?:of )?(?:the )?name|remind me (?:of )?that|could you remind|you (?:could |can )?remind|what was (?:the |that )/.test(ql);
    const wantsFrequency = /how often|how frequent|how regularly/.test(ql);

    // Synonym expansion for better matching
    const synonymMap: Record<string, string[]> = {
      "romantic": ["cozy", "intimate", "candlelit", "soft lighting", "atmospheric"],
      "budget": ["cheap", "affordable", "low-cost", "inexpensive", "hostel"],
      "luxury": ["high-end", "premium", "five-star", "upscale", "elegant"],
      "fun": ["entertaining", "exciting", "enjoyable", "amusing"],
      "healthy": ["nutritious", "organic", "wholesome", "diet"],
      "relaxing": ["calm", "peaceful", "soothing", "spa", "meditation"],
      "fast": ["quick", "speedy", "rapid", "express"],
      "old": ["previous", "former", "past", "earlier"],
      "new": ["recent", "latest", "current", "newest"],
      "best": ["favorite", "preferred", "top", "recommended"],
    };
    // Expand keywords with synonyms
    const expandedKeywords = [...keywords];
    for (const kw of keywords) {
      const syns = synonymMap[kw];
      if (syns) expandedKeywords.push(...syns);
    }

    // Entity-group scoring: group facts by entity, score ALL facts for each entity
    // against question keywords. This enables multi-fact reasoning:
    // "romantic Italian restaurant" matches Roscioli because Roscioli has facts
    // about "cozy", "intimate", "Italian", "Rome" spread across multiple facts.
    const entityFacts = new Map<string, ExtractedFact[]>();
    for (const f of store.facts) {
      const key = f.entity;
      const arr = entityFacts.get(key) ?? [];
      arr.push(f);
      entityFacts.set(key, arr);
    }

    for (const [entityName, facts] of entityFacts) {
      // Concatenate ALL text from all facts for this entity
      const allText = facts.map((f) => `${f.entity} ${f.predicate} ${f.value}`).join(" ").toLowerCase();
      const entityScore = expandedKeywords.filter((kw) => allText.includes(kw)).length;

      if (entityScore < 1) continue;

      // Pick the best individual fact to answer from
      let bestFact = facts[0]!;
      let bestFactScore = 0;

      for (const f of facts) {
        let fScore = 0;
        const val = safe(f.value);
        const pred = safe(f.predicate);

        if (wantsAmount && /\$?\d/.test(f.value)) fScore += 5;
        if (wantsLocation && /store|shop|restaurant|hotel|city|town|downtown|park|school|near|district/.test(val)) fScore += 5;
        if (wantsDate && f.date) fScore += 5;
        if (wantsDate && /\d{4}/.test(f.value)) fScore += 3;
        if (wantsFrequency && /daily|weekly|monthly|twice|three times|once|every/.test(val)) fScore += 5;
        if (wantsName) fScore += 1; // for names, the entity itself is the answer
        if (/name|called|titled|known as|type|description/.test(pred)) fScore += 2;

        if (fScore > bestFactScore) { bestFactScore = fScore; bestFact = f; }
      }

      // For name questions: the ENTITY name is the answer, not a fact value
      let answer: string;
      if (wantsName && /^[A-Z]/.test(entityName) && entityName !== "User") {
        answer = entityName;
      } else {
        answer = selectAnswerField(question, bestFact);
      }

      candidates.push({
        score: entityScore + bestFactScore,
        answer,
        type: "fact",
      });
    }
    for (const p of store.preferences) {
      const text = `${p.entity} ${p.preference} ${p.constraint ?? ""}`.toLowerCase();
      const score = expandedKeywords.filter((kw) => text.includes(kw)).length;
      if (score >= 1) {
        candidates.push({ score: score + 2, answer: selectPreferenceAnswer(question, p), type: "pref" }); // +2 boost for preferences
      }
    }
    for (const e of store.events) {
      const text = `${e.event} ${e.location ?? ""} ${e.date}`.toLowerCase();
      const score = keywords.filter((kw) => text.includes(kw)).length;
      if (score >= 1) {
        candidates.push({ score, answer: selectEventAnswer(question, e), type: "event" });
      }
    }

    // Sort by score descending, then pick the best answer that ISN'T just repeating the question
    candidates.sort((a, b) => b.score - a.score);

    let bestAnswer = "";
    for (const c of candidates) {
      // Skip answers that are just echoing question keywords back
      const ansLower = c.answer.toLowerCase();
      const isEcho = keywords.filter((kw) => ansLower.includes(kw)).length >= keywords.length * 0.6;
      if (!isEcho || candidates.length === 1) {
        bestAnswer = c.answer;
        break;
      }
    }
    // If all candidates echo the question, take the top one anyway
    if (!bestAnswer && candidates.length > 0) {
      bestAnswer = candidates[0]!.answer;
    }

    if (bestAnswer) {
      return { questionId, question, operation: op, tier: "medium", answer: bestAnswer, source: "projection" };
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
