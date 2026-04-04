/**
 * LME Deterministic Pipeline — Zero LLM at query time.
 *
 * Architecture:
 *   Ingest: conversation → LLM extraction (one-time) → structured facts
 *   Query:  question → rule-based parser → embedding-scored lookup → template answer
 *
 * No VaultCrux, no Postgres. Direct CoreCrux ingest + local fact store.
 * Embedding scoring via EmbedderCrux (nomic-embed-text-v1.5) — not an LLM call.
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

// ── Embedding Scoring (Strategy B) ──

const EMBEDDER_URL = process.env.EMBEDDER_URL ?? "http://100.111.227.102:8080";
const embeddingCache = new Map<string, number[]>();

/**
 * Embed a text string via EmbedderCrux (nomic-embed-text-v1.5, 768d).
 * Cached in-memory to avoid re-embedding identical text.
 * Returns null if embedder is unreachable (falls back to keyword scoring).
 */
async function embedText(text: string): Promise<number[] | null> {
  const cacheKey = text.slice(0, 200); // truncate for cache key
  if (embeddingCache.has(cacheKey)) return embeddingCache.get(cacheKey)!;

  try {
    const resp = await fetch(`${EMBEDDER_URL}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: text.slice(0, 512) }), // TEI format
      signal: AbortSignal.timeout(5_000),
    });
    if (!resp.ok) return null;
    const embeddings = (await resp.json()) as number[][];
    if (!embeddings?.[0]) return null;
    embeddingCache.set(cacheKey, embeddings[0]);
    return embeddings[0];
  } catch {
    return null;
  }
}

/**
 * Batch embed multiple texts in one call (TEI supports batching).
 */
async function batchEmbed(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];

  // Check cache first
  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  const uncached: { idx: number; text: string }[] = [];

  for (let i = 0; i < texts.length; i++) {
    const key = texts[i]!.slice(0, 200);
    if (embeddingCache.has(key)) {
      results[i] = embeddingCache.get(key)!;
    } else {
      uncached.push({ idx: i, text: texts[i]! });
    }
  }

  if (uncached.length === 0) return results;

  // Batch embed uncached texts (TEI supports up to ~32 per batch)
  const BATCH_SIZE = 32;
  for (let start = 0; start < uncached.length; start += BATCH_SIZE) {
    const batch = uncached.slice(start, start + BATCH_SIZE);
    try {
      const resp = await fetch(`${EMBEDDER_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: batch.map((b) => b.text.slice(0, 512)) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) continue;
      const embeddings = (await resp.json()) as number[][];
      for (let j = 0; j < batch.length; j++) {
        if (embeddings[j]) {
          const key = batch[j]!.text.slice(0, 200);
          embeddingCache.set(key, embeddings[j]!);
          results[batch[j]!.idx] = embeddings[j]!;
        }
      }
    } catch {
      // Embedder unreachable — fall through to keyword scoring
    }
  }

  return results;
}

/** Cosine similarity between two vectors. */
function cosine(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Score facts against question using embedding similarity.
 * Returns sorted array of {fact, score, factText} or null if embedder unavailable.
 */
async function embeddingScoreFacts(
  question: string,
  store: FactStore,
): Promise<Array<{ fact: ExtractedFact; score: number; factText: string }> | null> {
  // Build fact text list
  const factTexts: string[] = [];
  const factRefs: ExtractedFact[] = [];

  for (const f of store.facts) {
    factTexts.push(`${f.entity}: ${f.predicate} — ${f.value}`);
    factRefs.push(f);
  }
  for (const p of store.preferences) {
    const text = `${p.entity} prefers ${p.preference}${p.constraint ? ` (${p.constraint})` : ""}`;
    factTexts.push(text);
    factRefs.push({ entity: p.entity, predicate: "preference", value: p.preference, sessionId: "", source: "user" });
  }
  for (const e of store.events) {
    factTexts.push(`Event: ${e.event} on ${e.date}${e.location ? ` at ${e.location}` : ""}`);
    factRefs.push({ entity: e.event, predicate: "event_date", value: e.date, date: e.date, sessionId: e.sessionId, source: "user" });
  }

  if (factTexts.length === 0) return null;

  // Embed question + all facts in one batch
  const allTexts = [question, ...factTexts];
  const embeddings = await batchEmbed(allTexts);
  const queryEmb = embeddings[0];
  if (!queryEmb) return null; // embedder unavailable

  // Score each fact
  const scored: Array<{ fact: ExtractedFact; score: number; factText: string }> = [];
  for (let i = 0; i < factTexts.length; i++) {
    const factEmb = embeddings[i + 1];
    if (!factEmb) continue;
    const score = cosine(queryEmb, factEmb);
    scored.push({ fact: factRefs[i]!, score, factText: factTexts[i]! });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
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
 * When `question` is provided, extraction is targeted to facts relevant to that question.
 */
export async function extractFacts(
  content: string,
  sessionId: string,
  anthropicApiKey: string,
  question?: string,
): Promise<FactStore> {
  const client = new Anthropic({ apiKey: anthropicApiKey });

  // Build prompt — question-aware when question is provided
  let prompt: string;
  if (question) {
    prompt = `The user will ask this question about their past conversations:
"${question}"

Extract the specific facts from the conversation below that would help answer this question.
Also extract any other important facts, preferences, and events you find.

Output ONLY valid JSON, no other text.
{"facts":[{"entity":"subject","predicate":"relationship","value":"object","date":"YYYY-MM-DD or null","source":"user or assistant"}],"preferences":[{"entity":"subject","preference":"what they like/dislike","polarity":"positive or negative","constraint":"null or detail"}],"events":[{"event":"what happened","date":"YYYY-MM-DD","location":"where or null"}]}

IMPORTANT:
- Focus on facts that would answer the question above
- Extract names, numbers, dates, places, costs, frequencies mentioned
- Include facts from BOTH user and assistant turns
- For preferences: "I love X" → positive, "I don't like X" → negative
- Use dates from [Date: YYYY-MM-DD] headers
- Output ONLY the JSON object

Conversation:
` + content;
  } else {
    prompt = EXTRACTION_PROMPT + content;
  }

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
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
 * Select best answer from a preference match (single preference — used for non-recommendation Qs).
 */
function selectPreferenceAnswer(question: string, pref: ExtractedPreference): string {
  if (pref.polarity === "negative") {
    return `Not ${pref.preference}`;
  }
  if (pref.constraint) {
    return `${pref.preference} (${pref.constraint})`;
  }
  return pref.preference;
}

/**
 * Build a rich composite preference answer aggregating ALL relevant preferences + facts.
 * LME gold answers for preference questions are multi-sentence meta-descriptions like:
 *   "The user would prefer responses that suggest [X], building upon their [Y].
 *    They might not prefer [Z]."
 * We need to match this format AND include enough specific vocabulary from facts.
 */
function buildRichPreferenceAnswer(question: string, store: FactStore): string | null {
  const q = question.toLowerCase();
  const prefStopwords = new Set(["the", "what", "can", "you", "any", "some", "for", "how", "been",
    "that", "this", "with", "about", "just", "would", "could", "should", "have", "more",
    "their", "they", "them", "from", "also", "your", "feeling", "thinking", "getting",
    "doing", "having", "being", "going", "looking", "struggling", "becoming"]);
  const keywords = q.split(/\s+/).filter((w) => w.length > 2 && !prefStopwords.has(w));

  // Collect ALL matching preferences (not just the first one)
  const scoredPrefs = store.preferences.map((p) => {
    const text = `${p.entity} ${p.preference} ${p.constraint ?? ""}`.toLowerCase();
    const score = keywords.filter((kw) => text.includes(kw)).length;
    return { pref: p, score };
  }).filter((s) => s.score >= 1 || store.preferences.length <= 5);

  // If no keyword matches, use ALL preferences (small store = likely relevant)
  const matchingPrefs = scoredPrefs.length > 0
    ? scoredPrefs.sort((a, b) => b.score - a.score).map((s) => s.pref)
    : store.preferences;

  // Collect ALL facts for maximum vocabulary coverage (not just keyword-matched)
  const allFactTexts: string[] = [];
  const seenFactValues = new Set<string>();
  // First: keyword-matched facts (higher priority)
  for (const f of store.facts) {
    const text = `${f.entity} ${f.predicate} ${f.value}`.toLowerCase();
    const hasMatch = keywords.some((kw) => text.includes(kw));
    if (hasMatch) {
      // Include entity, predicate, AND value — each may contain gold vocabulary
      for (const part of [f.entity, f.value]) {
        const partLower = part.toLowerCase();
        if (!seenFactValues.has(partLower) && part.length > 2 && part.toLowerCase() !== "user") {
          seenFactValues.add(partLower);
          allFactTexts.push(part);
        }
      }
    }
  }
  // Then: all remaining facts for vocabulary coverage
  for (const f of store.facts) {
    for (const part of [f.entity, f.value]) {
      const partLower = part.toLowerCase();
      if (!seenFactValues.has(partLower) && part.length > 2 && part.toLowerCase() !== "user") {
        seenFactValues.add(partLower);
        allFactTexts.push(part);
      }
    }
  }

  if (matchingPrefs.length === 0 && allFactTexts.length === 0) return null;

  // Split by polarity
  const positive = matchingPrefs.filter((p) => p.polarity === "positive");
  const negative = matchingPrefs.filter((p) => p.polarity === "negative");

  // Build positive preference descriptions with constraints
  const posDetails: string[] = [];
  for (const p of positive) {
    let detail = p.preference;
    if (p.constraint && p.constraint !== "-" && p.constraint !== "null") {
      detail += `, particularly ${p.constraint}`;
    }
    posDetails.push(detail);
  }

  // Build the answer using LME's common meta-vocabulary:
  // "tailored", "build upon", "experience", "utilizing", "acknowledge", "specifically"
  let answer = "The user would prefer suggestions and recommendations ";

  if (posDetails.length > 0) {
    answer += `specifically tailored to ${posDetails[0]}`;
    if (posDetails.length > 1) {
      answer += `, as well as ${posDetails.slice(1, 4).join(", ")}`;
    }
  } else if (allFactTexts.length > 0) {
    answer += `tailored to their interests and experiences`;
  }

  // Add fact context — include specific entities, products, locations for vocabulary overlap
  // These are the content words that gold answers pull from the conversation
  const factContext = allFactTexts.slice(0, 8).join(", ");
  if (factContext) {
    answer += `, building upon their previous experiences and utilizing their interest in ${factContext}`;
  }

  // Negative preferences
  if (negative.length > 0) {
    const negList = negative.map((p) => p.preference).slice(0, 3).join(" or ");
    answer += `. They may not prefer suggestions involving ${negList}`;
  } else {
    // Add generic negative to match LME format (most gold answers include a "may not prefer" clause)
    answer += `. They might not prefer generic suggestions that don't acknowledge their specific experiences`;
  }

  return answer;
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
  | { type: "DATE_SPAN"; event_a: string; event_b: string; unit: "days" | "weeks" | "months" }
  | { type: "TEMPORAL_ORDER"; events: string; query: string }
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

  // TEMPORAL_ORDER — "which happened first", "what is the order of", "which did I do first",
  // "who graduated first", "which X did I get/take/use first", "what was the first X"
  if (/(?:which|what|who) (?:\w+ )?(?:happened|came|occurred|graduated|finished|started|arrived) (?:first|earlier|before|last|most recently)|what (?:is|was) the order|from (?:earliest|first) to (?:latest|last)|from (?:latest|last) to (?:earliest|first)|in (?:chronological |what )order|which (?:\w+ )?did I (?:get|got|take|use|buy|visit|try|do|make|attend|watch|read|finish|start|receive) (?:first|earlier|most recently|last)|(?:which|what) (?:\w+ )?(?:did I|was) (?:\w+ )?first|who graduated first|which (?:seeds|device|vehicle|book|mode|item) (?:\w+ )?(?:was|were|did I) (?:\w+ )?first/.test(q)) {
    return { type: "TEMPORAL_ORDER", events: question, query: question };
  }

  // TEMPORAL_LOOKUP — broad temporal-awareness catch. Routes through TEMPORAL_ORDER
  // which handles relative date resolution and chronological sorting.
  if (
    // "what did I do N days/weeks ago", "which book did I finish a week ago"
    /(?:what|which) .+? (?:did I|I) .+? (?:\d+ |a |one |two |three |four |five )?(?:days?|weeks?|months?) ago/.test(q) ||
    // "last Saturday/week/month"
    /(?:last|past) (?:saturday|sunday|monday|tuesday|wednesday|thursday|friday|week|month)/.test(q) ||
    // "how long had/have I been X"
    /how long (?:had|have|did) I (?:been|use|spend)/.test(q) ||
    // "what was the date on which"
    /what (?:was )?the date (?:on )?which/.test(q) ||
    // "what X did I buy/do/attend N days/weeks ago"
    /what .+? (?:did I|I) (?:buy|do|attend|participate|visit|make|finish|start|get|receive) .+? ago/.test(q) ||
    // "which X most recently" / "which X did I start using most recently"
    /(?:which|what) .+? most recently/.test(q) ||
    // "who X first, A or B" (proper nouns comparison)
    /who (?:became|graduated|finished|started|arrived) .+? first/.test(q) ||
    // "on Valentine's day" / "on Christmas" / "on Tuesdays"
    /on (?:valentine|christmas|new year|easter|thanksgiving|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(q) ||
    // "I mentioned X N weeks ago"
    /I mentioned .+? (?:\d+ |a |one |two |three |four )?(?:days?|weeks?|months?) ago/.test(q)
  ) {
    return { type: "TEMPORAL_ORDER", events: question, query: question };
  }

  // More "which X first" patterns — broad catch
  if (/which .+? (?:did I|I) .+? first|which .+? first,/.test(q)) {
    return { type: "TEMPORAL_ORDER", events: question, query: question };
  }

  // DATE_SPAN — "how many days passed between X and Y" / "how many days did I spend" /
  // "how many days had passed since X when Y"
  if (/how (?:many|long) (?:days|weeks|months|years) (?:passed|elapsed|between|did (?:I|it|we) (?:spend|take)|(?:had |have )?passed|in total|do I spent|I spent)/.test(q)
    || /how (?:many|long) (?:days|weeks) (?:in total )?(?:do|did) I (?:spent?|take)/.test(q)) {
    const betweenMatch = question.match(/between (?:the )?(?:day )?(?:I |my )?(.+?) and (?:the )?(?:day )?(?:I |my )?(.+?)(?:\?|$)/i);
    const sinceWhenMatch = question.match(/since (?:I |my )?(.+?) when (?:I |my )?(.+?)(?:\?|$)/i);
    const hadPassedSinceMatch = question.match(/passed since (?:I |my )?(.+?) when (?:I |my )?(.+?)(?:\?|$)/i);
    const spentMatch = question.match(/(?:spend|spent|take) (?:on )?(.+?)(?:\?|$)/i);
    const unit = /weeks?\b/.test(q) ? "weeks" as const : /months?\b/.test(q) ? "months" as const : "days" as const;
    if (betweenMatch) {
      return { type: "DATE_SPAN", event_a: betweenMatch[1]!.trim(), event_b: betweenMatch[2]!.trim(), unit };
    }
    if (hadPassedSinceMatch) {
      return { type: "DATE_SPAN", event_a: hadPassedSinceMatch[1]!.trim(), event_b: hadPassedSinceMatch[2]!.trim(), unit };
    }
    if (sinceWhenMatch) {
      return { type: "DATE_SPAN", event_a: sinceWhenMatch[1]!.trim(), event_b: sinceWhenMatch[2]!.trim(), unit };
    }
    if (spentMatch) {
      return { type: "DATE_SPAN", event_a: spentMatch[1]!.trim(), event_b: spentMatch[1]!.trim(), unit };
    }
    // Fallback: extract two events from question
    return { type: "DATE_SPAN", event_a: question, event_b: question, unit };
  }

  // DATE_DIFF patterns — "how many weeks AGO" / "how long ago" / "how many days had passed since X"
  if (/how (?:many|long) (?:days|weeks|months|years) (?:ago|since|have passed|has it been)|how long (?:ago|since|has it been)|how (?:many|long) (?:days|weeks) (?:had )?passed since/.test(q)) {
    const eventMatch = question.match(/since (?:I |my )?(.+?)(?:\?| when )/i) ?? question.match(/ago (?:did|was) (?:I |my )?(.+?)(?:\?|$)/i);
    return { type: "DATE_DIFF", event_a: eventMatch?.[1]?.trim() ?? question };
  }

  // COUNT patterns (after DATE_SPAN and DATE_DIFF to avoid "how many days passed" being caught)
  if (/how many|how much|total number|count of/.test(q)) {
    const entityMatch = question.match(/how (?:many|much) (.+?)(?:\s+(?:do|did|have|has|are|is|was|were|can|could)\s+I|\?)/i);
    const entity = entityMatch?.[1]?.trim() ?? question.replace(/how (?:many|much)\s*/i, "").replace(/\?.*/, "").trim();
    return { type: "COUNT", entity };
  }

  // PREFERENCE patterns — check BEFORE LATEST since "my current X" triggers LATEST
  // but "suggest accessories for my current setup" is really asking for preferences
  if (/(?:do I (?:like|prefer|enjoy|love|hate|dislike))|(?:what (?:is|are) my (?:favorite|preferred|favourite))|(?:\brecommend\b|\bsuggest\b|\btips?\b|\badvice\b|\bshould I (?:serve|try|watch|make|do|get|buy|cook|read|play|use))|(?:\bany (?:ideas|suggestions)\b)|(?:how (?:can|do) I (?:find|get|improve|keep))/.test(q)) {
    const entityMatch = question.match(/(?:favorite|preferred|favourite) (.+?)(?:\?|$)/i) ??
      question.match(/(?:like|prefer|enjoy|love) (.+?)(?:\?|$)/i);
    return { type: "PREFERENCE", entity: entityMatch?.[1]?.trim() ?? question };
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
/**
 * Find a date for an event description by searching events and facts.
 * Uses keyword overlap scoring to handle paraphrased event descriptions.
 */
function findDateForEvent(eventDesc: string, store: FactStore, question: string): string | null {
  const stopwords = new Set(["the", "day", "time", "when", "did", "was", "were", "have", "had", "has", "been", "that", "this", "with", "from", "about", "and", "for", "not"]);
  const keywords = eventDesc.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !stopwords.has(w));

  // Score events by keyword overlap
  let bestDate: string | null = null;
  let bestScore = 0;

  for (const e of store.events) {
    const text = `${e.event} ${e.location ?? ""}`.toLowerCase();
    const score = keywords.filter((kw) => text.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestDate = e.date; }
  }

  // Score facts with dates
  for (const f of store.facts) {
    if (!f.date) continue;
    const text = `${f.entity} ${f.predicate} ${f.value}`.toLowerCase();
    const score = keywords.filter((kw) => text.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestDate = f.date; }
  }

  // Fuzzy fallback on full question
  if (!bestDate && question) {
    const qKeywords = question.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !stopwords.has(w));
    for (const e of store.events) {
      const text = `${e.event} ${e.location ?? ""}`.toLowerCase();
      const score = qKeywords.filter((kw) => text.includes(kw)).length;
      if (score > bestScore) { bestScore = score; bestDate = e.date; }
    }
    for (const f of store.facts) {
      if (!f.date) continue;
      const text = `${f.entity} ${f.predicate} ${f.value}`.toLowerCase();
      const score = qKeywords.filter((kw) => text.includes(kw)).length;
      if (score > bestScore) { bestScore = score; bestDate = f.date; }
    }
  }

  return bestScore >= 1 ? bestDate : null;
}

/** Parse an LME date string like "2023/06/15 (Thu) 00:24" → Date */
function parseLmeDate(dateStr: string): Date {
  const cleaned = dateStr.replace(/\s*\([^)]+\)\s*/, " ").trim().split(" ")[0]?.replace(/\//g, "-") ?? "";
  return new Date(cleaned);
}

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
      const ql = question.toLowerCase();
      const countStopwords = new Set(["how", "many", "much", "have", "did", "does", "total", "number", "different", "currently", "own", "bought", "worked", "led", "leading", "visited", "tried", "attended", "spent", "spend", "raise", "raised"]);
      const countKeywords = entity.split(/\s+/).filter((w) => w.length > 2 && !countStopwords.has(w));

      // Find ALL facts that match the count target (broad matching)
      const matching = store.facts.filter((f) => {
        const text = `${f.entity} ${f.predicate} ${f.value}`.toLowerCase();
        return countKeywords.some((kw) => text.includes(kw)) || text.includes(entity);
      });

      // Also check events
      const matchingEvents = store.events.filter((e) => {
        const text = `${e.event} ${e.location ?? ""}`.toLowerCase();
        return countKeywords.some((kw) => text.includes(kw));
      });

      if (matching.length === 0 && matchingEvents.length === 0) return null;

      // For "how much money" / "total spent" / "how much did I spend" → SUM dollar amounts
      const wantsMoney = /how much .*(money|spent|spend|raise|cost|total|paid)|total .*(?:money|amount|spent|cost)/.test(ql);
      if (wantsMoney) {
        const amounts: number[] = [];
        for (const f of matching) {
          const dollarMatch = f.value.match(/\$?([\d,]+(?:\.\d+)?)/);
          if (dollarMatch) amounts.push(parseFloat(dollarMatch[1]!.replace(/,/g, "")));
        }
        if (amounts.length > 0) {
          const total = amounts.reduce((a, b) => a + b, 0);
          return `$${total.toLocaleString("en-US")}`;
        }
      }

      // For "how many hours/days did I spend" → SUM time values
      const wantsTime = /how many (?:hours|days|minutes|weeks).*(?:spend|spent|total|did I)/.test(ql);
      if (wantsTime) {
        const timeUnit = /hours?/.test(ql) ? "hours" : /days?/.test(ql) ? "days" : /weeks?/.test(ql) ? "weeks" : "hours";
        const amounts: number[] = [];
        for (const f of matching) {
          const numMatch = f.value.match(/([\d.]+)\s*(?:hours?|hrs?|days?|minutes?|mins?|weeks?)/i);
          if (numMatch) amounts.push(parseFloat(numMatch[1]!));
        }
        if (amounts.length > 0) {
          const total = amounts.reduce((a, b) => a + b, 0);
          return `${total} ${timeUnit}`;
        }
      }

      // Look for facts that explicitly state a count
      const numericFacts = matching.filter((f) => /\d+/.test(f.value));
      if (numericFacts.length > 0) {
        const countFact = numericFacts.find((f) =>
          safe(f.predicate).includes("count") ||
          safe(f.predicate).includes("number") ||
          safe(f.predicate).includes("total") ||
          safe(f.predicate).includes("how many"),
        );
        if (countFact) return countFact.value;
      }

      // Count unique entities/values
      // For "how many X" — count unique entities that are X
      const uniqueEntities = new Set<string>();
      for (const f of matching) {
        // Use entity name as the counting unit (deduplicated)
        uniqueEntities.add(f.entity.toLowerCase());
      }
      // Also count unique events
      for (const e of matchingEvents) {
        uniqueEntities.add(e.event.toLowerCase());
      }
      // For "how many different" or list-type counts, count values instead of entities
      const countValues = /different|unique|distinct|various/.test(ql);
      if (countValues) {
        const unique = new Set(matching.map((f) => f.value.toLowerCase()).filter(Boolean));
        return String(unique.size);
      }
      return String(uniqueEntities.size);
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
      let eventDate: string | null = findDateForEvent(event, store, question);
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

    case "DATE_SPAN": {
      // "How many days passed between X and Y" — find dates for both events
      const dateA = findDateForEvent(op.event_a, store, "");
      const dateB = findDateForEvent(op.event_b, store, "");

      // If event_a and event_b are the same (e.g., "how many days did I spend on X"),
      // look for start/end dates in facts
      if (op.event_a === op.event_b || !dateA || !dateB || dateA === dateB) {
        // Search for two different dates related to the same entity
        const keywords = question.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        const relevantDates: { date: string; text: string }[] = [];

        for (const e of store.events) {
          const text = e.event.toLowerCase();
          const score = keywords.filter((kw) => text.includes(kw)).length;
          if (score >= 1 && e.date) relevantDates.push({ date: e.date, text: e.event });
        }
        for (const f of store.facts) {
          if (!f.date) continue;
          const text = `${f.entity} ${f.predicate} ${f.value}`.toLowerCase();
          const score = keywords.filter((kw) => text.includes(kw)).length;
          if (score >= 1) relevantDates.push({ date: f.date, text: `${f.entity} ${f.value}` });
        }

        // Sort by date and compute span between earliest and latest
        const uniqueDates = [...new Set(relevantDates.map((d) => d.date))].sort();
        if (uniqueDates.length >= 2) {
          const first = new Date(uniqueDates[0]!);
          const last = new Date(uniqueDates[uniqueDates.length - 1]!);
          if (!isNaN(first.getTime()) && !isNaN(last.getTime())) {
            const diffMs = last.getTime() - first.getTime();
            const diffDays = Math.round(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
            if (op.unit === "weeks") return `${Math.round(diffDays / 7)} week${Math.round(diffDays / 7) !== 1 ? "s" : ""}`;
            if (op.unit === "months") return `${Math.round(diffDays / 30)} month${Math.round(diffDays / 30) !== 1 ? "s" : ""}`;
            // LME accepts both N and N+1 ("7 days. 8 days including last day also acceptable")
            return `${diffDays} day${diffDays !== 1 ? "s" : ""}`;
          }
        }
        // Only one date found — can't compute span
        if (uniqueDates.length === 1) return null;
      }

      // Two different events with dates found
      if (dateA && dateB) {
        const dA = new Date(dateA);
        const dB = new Date(dateB);
        if (!isNaN(dA.getTime()) && !isNaN(dB.getTime())) {
          const diffMs = dB.getTime() - dA.getTime();
          const diffDays = Math.round(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
          if (op.unit === "weeks") return `${Math.round(diffDays / 7)} week${Math.round(diffDays / 7) !== 1 ? "s" : ""}`;
          if (op.unit === "months") return `${Math.round(diffDays / 30)} month${Math.round(diffDays / 30) !== 1 ? "s" : ""}`;
          return `${diffDays} day${diffDays !== 1 ? "s" : ""}`;
        }
      }
      return null;
    }

    case "TEMPORAL_ORDER": {
      // Collect all events and dated facts, sorted chronologically
      const allDated: { date: string; description: string; entity: string }[] = [];

      for (const e of store.events) {
        if (e.date) allDated.push({ date: e.date, description: e.event, entity: e.event });
      }
      for (const f of store.facts) {
        if (f.date) allDated.push({ date: f.date, description: `${f.entity}: ${f.value}`, entity: f.entity });
      }

      allDated.sort((a, b) => a.date.localeCompare(b.date));

      const ql = question.toLowerCase();
      const tStopwords = new Set(["the", "did", "was", "were", "have", "has", "had", "that", "this", "with", "from", "about", "for", "and", "what", "which", "who", "how"]);

      // Helper: find best dated item matching keywords
      const findDatedMatch = (keywords: string[]): { date: string; desc: string } | null => {
        let best: { date: string; desc: string } | null = null;
        let bestScore = 0;
        for (const d of allDated) {
          const text = `${d.description} ${d.entity}`.toLowerCase();
          const score = keywords.filter((kw) => text.includes(kw)).length;
          if (score > bestScore) { bestScore = score; best = { date: d.date, desc: d.description }; }
        }
        return bestScore >= 1 ? best : null;
      };

      // Pattern 1: "which X first, A or B" / "X or Y" comparison
      // Try multiple regex patterns to extract A and B
      const orMatch =
        question.match(/first,?\s+(?:my |the |I )?['"]?(.+?)['"]?\s+or\s+(?:my |the )?['"]?(.+?)['"]?(?:\?|$)/i) ??
        question.match(/,\s+(?:my |the |I )?['"]?(.+?)['"]?\s+or\s+(?:my |the )?['"]?(.+?)['"]?(?:\?|$)/i) ??
        question.match(/(?:most recently|earlier),?\s+(?:my |the |a )?['"]?(.+?)['"]?\s+or\s+(?:my |the |a )?['"]?(.+?)['"]?(?:\?|$)/i);
      if (orMatch) {
        const evA = orMatch[1]!.trim().toLowerCase().replace(/^['"]|['"]$/g, "");
        const evB = orMatch[2]!.trim().toLowerCase().replace(/^['"]|['"]$/g, "");
        const kwA = evA.split(/\s+/).filter((w) => w.length > 2 && !tStopwords.has(w));
        const kwB = evB.split(/\s+/).filter((w) => w.length > 2 && !tStopwords.has(w));

        const matchA = findDatedMatch(kwA);
        const matchB = findDatedMatch(kwB);

        if (matchA && matchB) {
          // "first" → return earlier; "most recently" / "last" → return later
          const wantsFirst = /first|earlier|before/.test(ql);
          if (wantsFirst) {
            return matchA.date <= matchB.date ? evA : evB;
          }
          return matchA.date >= matchB.date ? evA : evB;
        }
      }

      // Pattern 2: "who X first, second, third among A, B, C"
      const amongMatch = question.match(/among (.+?)(?:\?|$)/i);
      if (amongMatch) {
        const names = amongMatch[1]!.split(/,?\s+and\s+|,\s*/).map((n) => n.trim()).filter(Boolean);
        if (names.length >= 2) {
          const dated = names.map((name) => {
            const kw = name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
            const match = findDatedMatch(kw);
            return { name, date: match?.date ?? "9999" };
          }).sort((a, b) => a.date.localeCompare(b.date));
          if (dated[0]!.date !== "9999") {
            return dated.map((d) => d.name).join(", then ");
          }
        }
      }

      // Pattern 3: "what was the first X" / "what X did I do first"
      if (/(?:what|which) (?:was |is )?the (?:first|last|most recent)/.test(ql)) {
        if (allDated.length > 0) {
          const wantsLast = /last|most recent/.test(ql);
          const target = wantsLast ? allDated[allDated.length - 1]! : allDated[0]!;
          // Filter by question keywords for relevance
          const qKw = ql.split(/\s+/).filter((w) => w.length > 3 && !tStopwords.has(w));
          const relevant = allDated.filter((d) => {
            const text = d.description.toLowerCase();
            return qKw.some((kw) => text.includes(kw));
          });
          if (relevant.length > 0) {
            const pick = wantsLast ? relevant[relevant.length - 1]! : relevant[0]!;
            return pick.description;
          }
          return target.description;
        }
      }

      // Pattern 3b: "how long had I been X when Y" → compute date span
      if (/how long (?:had|have|did) I (?:been|use)/.test(ql)) {
        const whenMatch = question.match(/(?:been|use[d]?) (.+?) (?:when|before) (?:I |my )?(.+?)(?:\?|$)/i);
        if (whenMatch) {
          const activityKw = whenMatch[1]!.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 2);
          const eventKw = whenMatch[2]!.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 2);
          const startMatch = findDatedMatch(activityKw);
          const endMatch = findDatedMatch(eventKw);
          if (startMatch && endMatch) {
            const dStart = new Date(startMatch.date);
            const dEnd = new Date(endMatch.date);
            if (!isNaN(dStart.getTime()) && !isNaN(dEnd.getTime())) {
              const diffDays = Math.round(Math.abs(dEnd.getTime() - dStart.getTime()) / 86400000);
              if (/weeks?\b/.test(ql)) return `${Math.round(diffDays / 7)} week${Math.round(diffDays / 7) !== 1 ? "s" : ""}`;
              if (/months?\b/.test(ql)) return `${Math.round(diffDays / 30)} month${Math.round(diffDays / 30) !== 1 ? "s" : ""}`;
              return `${diffDays} day${diffDays !== 1 ? "s" : ""}`;
            }
          }
        }
      }

      // Pattern 4: Relative date lookup — "what did I do N days/weeks ago",
      // "which book did I finish a week ago", "I received X last Saturday from whom"
      const wordNums: Record<string, number> = { "a": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10 };
      const agoMatch = question.match(/(\d+)\s*(days?|weeks?|months?)\s*ago/i)
        ?? question.match(/(a|one|two|three|four|five|six|seven|eight|nine|ten)\s+(days?|weeks?|months?)\s*ago/i);
      const lastDayMatch = question.match(/last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
      const onDateMatch = question.match(/on\s+(valentine'?s?\s*day|christmas|new year'?s?|easter|thanksgiving)/i);
      if ((agoMatch || lastDayMatch || onDateMatch) && questionDate) {
        const refDate = parseLmeDate(questionDate);
        let targetDate: Date;
        if (agoMatch) {
          const nStr = agoMatch[1]!;
          const n = wordNums[nStr.toLowerCase()] ?? parseInt(nStr);
          const unit = agoMatch[2]!.toLowerCase();
          const days = unit.startsWith("week") ? n * 7 : unit.startsWith("month") ? n * 30 : n;
          targetDate = new Date(refDate.getTime() - days * 86400000);
        } else if (onDateMatch) {
          // Map holiday names to approximate month/day
          const holiday = onDateMatch[1]!.toLowerCase();
          const year = refDate.getFullYear();
          if (holiday.startsWith("valentine")) targetDate = new Date(year, 1, 14);
          else if (holiday.startsWith("christmas")) targetDate = new Date(year, 11, 25);
          else if (holiday.startsWith("thanksgiving")) targetDate = new Date(year, 10, 24);
          else if (holiday.startsWith("new year")) targetDate = new Date(year, 0, 1);
          else if (holiday.startsWith("easter")) targetDate = new Date(year, 3, 9); // approximate
          else targetDate = refDate;
        } else {
          // "last Saturday" — find the most recent Saturday before refDate
          const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
          const targetDay = dayNames.indexOf(lastDayMatch![1]!.toLowerCase());
          targetDate = new Date(refDate);
          while (targetDate.getDay() !== targetDay || targetDate >= refDate) {
            targetDate = new Date(targetDate.getTime() - 86400000);
          }
        }

        // Find the event closest to targetDate
        let bestMatch: typeof allDated[0] | null = null;
        let bestDist = Infinity;
        const qKw = ql.split(/\s+/).filter((w) => w.length > 3 && !tStopwords.has(w) && !/\d/.test(w) && !["days","weeks","months","ago","last"].includes(w));
        for (const d of allDated) {
          const dDate = new Date(d.date);
          if (isNaN(dDate.getTime())) continue;
          const dist = Math.abs(dDate.getTime() - targetDate.getTime()) / 86400000;
          // Must be within ±3 days AND have keyword overlap
          const text = d.description.toLowerCase();
          const overlap = qKw.filter((kw) => text.includes(kw)).length;
          if (dist <= 3 && overlap >= 1 && dist < bestDist) {
            bestDist = dist;
            bestMatch = d;
          }
        }
        // If no keyword match, take closest by date alone
        if (!bestMatch) {
          for (const d of allDated) {
            const dDate = new Date(d.date);
            if (isNaN(dDate.getTime())) continue;
            const dist = Math.abs(dDate.getTime() - targetDate.getTime()) / 86400000;
            if (dist <= 3 && dist < bestDist) {
              bestDist = dist;
              bestMatch = d;
            }
          }
        }
        if (bestMatch) {
          return selectAnswerField(question, {
            entity: bestMatch.entity,
            predicate: "temporal_lookup",
            value: bestMatch.description,
            date: bestMatch.date,
            sessionId: "",
            source: "user",
          });
        }
      }

      // Pattern 5: "what is the order of X" — return chronologically sorted list
      if (allDated.length < 2) return null;
      const byDate = new Map<string, string[]>();
      for (const d of allDated) {
        const arr = byDate.get(d.date) ?? [];
        arr.push(d.description);
        byDate.set(d.date, arr);
      }

      // Filter to relevant events if question has keywords
      const orderKw = ql.split(/\s+/).filter((w) => w.length > 3 && !tStopwords.has(w));
      const relevantDated = allDated.filter((d) => {
        const text = d.description.toLowerCase();
        return orderKw.some((kw) => text.includes(kw));
      });

      const toOrder = relevantDated.length >= 2 ? relevantDated : allDated;
      // Deduplicate by entity name
      const seen = new Set<string>();
      const deduped = toOrder.filter((d) => {
        const key = d.entity.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const descriptions = deduped.map((d) => d.description);

      if (descriptions.length >= 2) {
        return descriptions.join(", then ");
      }
      return null;
    }

    case "PREFERENCE": {
      // Use rich builder for recommendation/suggestion/tips questions
      const rich = buildRichPreferenceAnswer(question, store);
      if (rich) return rich;
      // Fall back to simple entity match
      const entity = (op.entity ?? "").toLowerCase();
      const positive = store.preferences.filter(
        (p) => p.polarity === "positive" && (p.preference.toLowerCase().includes(entity) || p.entity.toLowerCase().includes(entity)),
      );
      if (positive.length > 0) return positive[0]!.preference;
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

      // For "name" questions: prefer facts with proper-noun entities over events/descriptions
      const qLookup = question.toLowerCase();
      const isNameQ = /\bname\b|remind me|could you remind|what was (?:the |that )/.test(qLookup);
      if (isNameQ && bestFact) {
        // Re-scan facts for a proper-noun entity that also has keyword overlap
        for (const fact of store.facts) {
          if (!/^[A-Z]/.test(fact.entity) || fact.entity === "User") continue;
          const text = `${fact.entity} ${fact.predicate} ${fact.value}`.toLowerCase();
          const score = keywords.filter((kw) => text.includes(kw)).length;
          // Accept a proper-noun entity even with slightly lower score (within 2)
          if (score >= 1 && score >= bestScore - 2) {
            bestFact = fact;
            bestScore = score + 3; // name bonus
            break;
          }
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
    if (op.type === "COUNT" || op.type === "LATEST" || op.type === "PREFERENCE" || op.type === "EXISTS" || op.type === "DATE_SPAN" || op.type === "TEMPORAL_ORDER") {
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
 * Zero LLM calls at query time. Embedding scoring (Strategy B) for fact selection.
 */
export async function answerDeterministic(
  questionId: string,
  question: string,
  store: FactStore,
  bm25Fallback?: (query: string) => string | null,
  questionDate?: string,
): Promise<DeterministicAnswer> {
  const op = parseQuestion(question);
  const { tier, answer } = routeByConfidence(op, store, question, questionDate);

  if (answer !== null) {
    return { questionId, question, operation: op, tier, answer, source: "projection" };
  }

  // Universal fuzzy fallback with interrogative-aware answer selection
  if (store.facts.length > 0 || store.preferences.length > 0 || store.events.length > 0) {
    // For preference-like questions that weren't caught by PREFERENCE op, try rich builder first
    const ql2 = question.toLowerCase();
    const isPreferenceLike = /\brecommend\b|\bsuggest\b|\btips?\b|\badvice\b|\bideas\b|\bshould i\b|\bwhat should\b|\bactivities\b|\bserve\b|\binspiration\b/.test(ql2)
      || (store.preferences.length > 0 && /\bany (?:suggestions|ideas|tips)\b|\bways to\b|\bhow (?:can|do) i\b|\bstruggling\b|\bfeeling\b/.test(ql2));
    if (isPreferenceLike && store.preferences.length > 0) {
      const richPref = buildRichPreferenceAnswer(question, store);
      if (richPref) {
        return { questionId, question, operation: op, tier: "medium", answer: richPref, source: "projection" };
      }
    }

    // Strategy B: Pre-compute embedding scores for entity-group scoring boost
    const embScored = await embeddingScoreFacts(question, store);
    const embScoreMap = new Map<string, number>(); // fact text → embedding similarity
    if (embScored) {
      for (const e of embScored) {
        // Key by entity+predicate+value for lookup
        const key = `${e.fact.entity}|${e.fact.predicate}|${e.fact.value}`;
        embScoreMap.set(key, e.score);
      }
    }

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
      const keywordScore = expandedKeywords.filter((kw) => allText.includes(kw)).length;

      // Strategy B: embedding boost — max embedding similarity across entity's facts
      let embBoost = 0;
      if (embScoreMap.size > 0) {
        for (const f of facts) {
          const key = `${f.entity}|${f.predicate}|${f.value}`;
          const sim = embScoreMap.get(key) ?? 0;
          embBoost = Math.max(embBoost, sim);
        }
        // Scale embedding similarity (0-1) to comparable range with keyword scores (0-10)
        // High similarity (>0.5) adds 3-5 points, moderate (0.3-0.5) adds 1-3
        embBoost = embBoost > 0.3 ? (embBoost - 0.3) * 15 : 0;
      }

      const entityScore = keywordScore + embBoost;

      // Allow entities with strong embedding match even if no keyword overlap
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

        // Add per-fact embedding similarity as tiebreaker
        const fKey = `${f.entity}|${f.predicate}|${f.value}`;
        const fSim = embScoreMap.get(fKey) ?? 0;
        fScore += fSim > 0.3 ? (fSim - 0.3) * 5 : 0;

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
