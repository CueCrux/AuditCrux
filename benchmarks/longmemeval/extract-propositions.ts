#!/usr/bin/env tsx
/**
 * Proposition extraction for LongMemEval — Phase 4
 *
 * Extracts atomic factual claims from chunks for failing questions.
 * Stores propositions as additional chunks in VaultCrux for fine-grained retrieval.
 *
 * Uses Anthropic API (Haiku for cost efficiency) to extract propositions.
 *
 * Usage:
 *   npx tsx extract-propositions.ts --dataset s3 --questions <ids> --dry-run
 *   npx tsx extract-propositions.ts --dataset s3 --all
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const VAULTCRUX_API_BASE = process.env.BENCH_VAULTCRUX_API_BASE ?? "http://100.109.10.67:14333";
const VAULTCRUX_API_KEY = process.env.BENCH_VAULTCRUX_API_KEY ?? "";

const args = process.argv.slice(2);
const get = (flag: string): string | undefined => {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
};
const has = (flag: string): boolean => args.includes(flag);

const dataset = get("--dataset") ?? "s3";
const dryRun = has("--dry-run");
const questionIds = get("--questions")?.split(",");
const allQuestions = has("--all");
const concurrency = parseInt(get("--concurrency") ?? "3", 10);

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

interface Proposition {
  subject: string;
  predicate: string;
  object: string;
  timestamp: string | null;
  text: string;
}

const EXTRACTION_PROMPT_DEFAULT = `Extract all factual claims from this conversation text as a JSON array.
Each claim must be:
- An atomic, self-contained statement (understandable without context)
- Include specific names, places, numbers, dates
- Structured as: {"subject": "...", "predicate": "...", "object": "...", "timestamp": "..." or null, "text": "natural language sentence"}

Rules:
- One fact per entry. "I read books A, B, and C" → 3 entries
- Include quantities, prices, durations, frequencies
- For temporal facts, include the date/time reference
- Output ONLY the JSON array, no commentary

Text:
`;

const EXTRACTION_PROMPT_LEAN = `Extract ONLY entity-bearing factual claims from this conversation. Focus on:
1. COUNTABLE items: things bought, read, visited, attended, completed (with specific names/titles)
2. TEMPORAL events: activities with dates, durations, or time references
3. STATE CHANGES: things that changed, updated, or replaced something else
4. NUMERIC facts: prices, quantities, distances, frequencies, ages

Skip: opinions, feelings, general discussion, greetings, questions without answers.

Output as JSON array: {"subject": "...", "predicate": "...", "object": "...", "timestamp": "..." or null, "text": "complete self-contained sentence"}

IMPORTANT: Each entry must be independently understandable. Include the person's name or "the user" as subject.

Text:
`;

const EXTRACTION_PROMPT = process.env.PROP_LEAN === "true" ? EXTRACTION_PROMPT_LEAN : EXTRACTION_PROMPT_DEFAULT;

async function extractPropositions(chunkContent: string): Promise<Proposition[]> {
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      temperature: 0.1,
      messages: [
        { role: "user", content: EXTRACTION_PROMPT + chunkContent },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Proposition[];
    return parsed.filter(p => p.subject && p.predicate && p.text);
  } catch (err) {
    console.error(`  Extraction failed: ${err instanceof Error ? err.stack : String(err)}`);
    return [];
  }
}

async function getChunksForTenant(tenantId: string): Promise<Array<{ chunkId: string; content: string; docId: string }>> {
  // Use the retrieval API which decrypts content automatically.
  // Issue multiple broad queries to get diverse chunks.
  const allChunks = new Map<string, { chunkId: string; content: string; docId: string }>();

  const queries = ["conversation history", "personal details", "activities events", "preferences opinions"];

  for (const query of queries) {
    try {
      const resp = await fetch(`${VAULTCRUX_API_BASE}/v1/retrieve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": VAULTCRUX_API_KEY,
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({
          tenantId,
          agentId: "longmemeval-bench",
          query,
          limit: 30,
          lane: "light",
          includeCommons: false,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) continue;
      const data = await resp.json() as { ok: boolean; data?: { results?: Array<{ chunkId: string; content: string | null; docId: string }> } };
      for (const r of data.data?.results ?? []) {
        if (r.content && !allChunks.has(r.chunkId)) {
          allChunks.set(r.chunkId, { chunkId: r.chunkId, content: r.content, docId: r.docId });
        }
      }
    } catch {
      continue;
    }
  }

  return [...allChunks.values()];
}

async function ingestPropositionChunk(
  tenantId: string,
  proposition: Proposition,
  sourceChunkId: string,
  sourceDocId: string,
  index: number,
): Promise<boolean> {
  const content = proposition.text + (proposition.timestamp ? ` (Date: ${proposition.timestamp})` : "");
  const idempotencyKey = `prop-${sourceChunkId}-${index}`;

  try {
    const resp = await fetch(`${VAULTCRUX_API_BASE}/v1/memory/imports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VAULTCRUX_API_KEY,
        "x-tenant-id": tenantId,
        "x-idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        tenantId,
        agentId: "longmemeval-bench",
        sourcePlatform: "claude",
        sourceConversationId: idempotencyKey,
        title: `Fact: ${proposition.subject} ${proposition.predicate}`,
        content,
        timestampSource: proposition.timestamp ?? new Date().toISOString(),
        shareability: "owner_only",
        metadata: {
          proposition: true,
          sourceChunkId,
          subject: proposition.subject,
          predicate: proposition.predicate,
          object: proposition.object,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    return resp.ok;
  } catch {
    return false;
  }
}

async function processQuestion(questionId: string): Promise<{ extracted: number; ingested: number }> {
  const tenantId = `__longmemeval_${dataset}_${questionId}`;

  // Get existing chunks for this tenant
  const chunks = await getChunksForTenant(tenantId);
  if (chunks.length === 0) {
    console.log(`  ${questionId}: no chunks found`);
    return { extracted: 0, ingested: 0 };
  }

  let totalExtracted = 0;
  let totalIngested = 0;

  // Extract propositions from each chunk
  for (const chunk of chunks.slice(0, 20)) { // cap at 20 chunks per question
    const props = await extractPropositions(chunk.content);
    totalExtracted += props.length;

    if (!dryRun) {
      for (let i = 0; i < props.length; i++) {
        const ok = await ingestPropositionChunk(tenantId, props[i]!, chunk.chunkId, chunk.docId, i);
        if (ok) totalIngested++;
      }
    }
  }

  console.log(`  ${questionId}: ${chunks.length} chunks → ${totalExtracted} propositions${dryRun ? " (dry-run)" : `, ${totalIngested} ingested`}`);
  return { extracted: totalExtracted, ingested: totalIngested };
}

async function main() {
  console.log(`Proposition extraction for LongMemEval ${dataset.toUpperCase()}`);
  console.log(`API: ${VAULTCRUX_API_BASE}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Concurrency: ${concurrency}\n`);

  let ids: string[];

  if (questionIds) {
    ids = questionIds;
  } else if (allQuestions) {
    // Load all question IDs from dataset
    const datasetFile = resolve(import.meta.dirname, "..", "_datasets", "LongMemEval", "data", "longmemeval_s_cleaned.json");
    const data = JSON.parse(readFileSync(datasetFile, "utf-8")) as Array<{ question_id: string }>;
    ids = data.map(d => d.question_id);
  } else {
    console.error("Specify --questions <ids> or --all");
    process.exit(1);
  }

  console.log(`Processing ${ids.length} questions...\n`);

  let totalExtracted = 0;
  let totalIngested = 0;
  let processed = 0;

  // Process with concurrency
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < ids.length) {
      const i = nextIndex++;
      const qid = ids[i]!;
      console.log(`[${i + 1}/${ids.length}] ${qid}`);
      const result = await processQuestion(qid);
      totalExtracted += result.extracted;
      totalIngested += result.ingested;
      processed++;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(`\nDone: ${processed} questions, ${totalExtracted} propositions extracted, ${totalIngested} ingested`);
  console.log(`Cost: ~$${(totalExtracted * 0.0001).toFixed(2)} (Haiku)`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
