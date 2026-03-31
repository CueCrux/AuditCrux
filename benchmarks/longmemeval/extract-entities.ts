#!/usr/bin/env tsx
/**
 * Phase 4 M1: Entity extraction for bidirectional matrix.
 *
 * Extracts structured (subject, predicate, object, entity_type, timestamp) facts
 * from VaultCrux chunks and stores them in the entity_session_index table.
 *
 * Uses Haiku for cost efficiency (~$0.02/question, ~$10 for 500 problems).
 *
 * Usage:
 *   npx tsx extract-entities.ts --dataset s3 --all --concurrency 5
 *   npx tsx extract-entities.ts --dataset s3 --questions q1,q2 --dry-run
 *   npx tsx extract-entities.ts --dataset s3 --validate q1,q2,q3
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import pg from "pg";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const VAULTCRUX_API_BASE = process.env.BENCH_VAULTCRUX_API_BASE ?? "http://100.109.10.67:14333";
const VAULTCRUX_API_KEY = process.env.BENCH_VAULTCRUX_API_KEY ?? "";
const DATABASE_URL = process.env.ENTITY_DB_URL ?? "postgres://vaultcrux:Et-lpNvPE-wdOKG1K3neNqLeFoinBmES-1a1aBPxkU19@100.75.64.43:5432/vaultcrux";

const args = process.argv.slice(2);
const get = (flag: string): string | undefined => {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
};
const has = (flag: string): boolean => args.includes(flag);

const dataset = get("--dataset") ?? "s3";
const dryRun = has("--dry-run");
const validate = has("--validate");
const questionIds = get("--questions")?.split(",");
const allQuestions = has("--all");
const concurrency = parseInt(get("--concurrency") ?? "5", 10);

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

interface Entity {
  subject: string;
  subject_type: string;
  predicate: string;
  object: string;
  object_type: string;
  timestamp: string | null;
}

const ENTITY_EXTRACTION_PROMPT = `Extract structured entity-bearing facts from this conversation text.

For each fact, output:
{
  "subject": "who/what (use 'User' for the person speaking)",
  "subject_type": "Person|Place|Item|Activity|Event|Organization|Creative_Work",
  "predicate": "owns|read|visited|attended|started|stopped|changed|bought|sold|created|completed|moved_to|works_at|studies_at|sees|subscribes|plays|cooks|volunteers|uses|paid|received|earned|spent|scheduled|wore|drove|flew|watched|listened|exercised",
  "object": "specific name/value",
  "object_type": "Person|Place|Item|Activity|Event|Organization|Creative_Work|Number|Duration|Frequency",
  "timestamp": "YYYY-MM-DD if known, null otherwise"
}

FOCUS ON:
- Countable items: things bought, read, visited, attended, owned, completed
- Temporal events: activities with specific dates or time references
- State values: current therapist, job, address, frequency of activity
- Numeric facts: prices, quantities, distances, durations, ages
- NEGATIVE assertions: "I don't have", "I never", "I stopped" → use predicate "NOT_owns", "NOT_visited", "stopped"
- STATE CHANGES: "I switched from X to Y", "I changed my X" → capture both old and new values

SKIP: opinions, feelings, greetings, generic discussion, questions without factual answers.

Output ONLY a JSON array. One entry per fact. Be specific — use exact names, numbers, dates.

Text:
`;

async function extractEntities(chunkContent: string): Promise<Entity[]> {
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      temperature: 0.1,
      messages: [
        { role: "user", content: ENTITY_EXTRACTION_PROMPT + chunkContent },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Entity[];
    return parsed.filter(e => e.subject && e.predicate && e.object && e.subject_type);
  } catch (err) {
    console.error(`  Extraction error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

async function getChunksForTenant(tenantId: string): Promise<Array<{ chunkId: string; content: string; docId: string }>> {
  const allChunks = new Map<string, { chunkId: string; content: string; docId: string }>();
  const queries = ["personal facts activities events", "things bought owned visited", "schedule routine changes updates", "people places organizations"];

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
          tenantId, agentId: "entity-extractor", query, limit: 30, lane: "light", includeCommons: false,
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
    } catch { continue; }
  }
  return [...allChunks.values()];
}

async function storeEntities(
  pool: pg.Pool,
  tenantId: string,
  entities: Entity[],
  chunkId: string,
  docId: string,
): Promise<number> {
  if (entities.length === 0 || dryRun) return 0;

  let stored = 0;
  for (const e of entities) {
    try {
      await pool.query(
        `INSERT INTO vaultcrux.entity_session_index
         (tenant_id, entity_type, entity_name, predicate, object_value, session_id, occurred_at, source_chunk_id, source_doc_id, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (tenant_id, entity_type, entity_name, predicate, session_id) DO UPDATE
         SET object_value = EXCLUDED.object_value, occurred_at = EXCLUDED.occurred_at, confidence = EXCLUDED.confidence`,
        [
          tenantId,
          e.subject_type,
          e.subject === "User" ? e.object : e.subject,
          e.predicate,
          e.subject === "User" ? "" : e.object,
          docId,
          e.timestamp ? new Date(e.timestamp) : null,
          chunkId,
          docId,
          1.0,
        ],
      );
      stored++;
    } catch (err) {
      // Skip duplicates and constraint violations
    }
  }
  return stored;
}

async function processQuestion(
  questionId: string,
  pool: pg.Pool,
): Promise<{ extracted: number; stored: number }> {
  const tenantId = `__longmemeval_${dataset}_${questionId}`;
  const chunks = await getChunksForTenant(tenantId);
  if (chunks.length === 0) {
    console.log(`  ${questionId}: no chunks found`);
    return { extracted: 0, stored: 0 };
  }

  let totalExtracted = 0;
  let totalStored = 0;

  for (const chunk of chunks.slice(0, 30)) {
    const entities = await extractEntities(chunk.content);
    totalExtracted += entities.length;
    const stored = await storeEntities(pool, tenantId, entities, chunk.chunkId, chunk.docId);
    totalStored += stored;
  }

  console.log(`  ${questionId}: ${chunks.length} chunks → ${totalExtracted} entities, ${totalStored} stored${dryRun ? " (dry-run)" : ""}`);
  return { extracted: totalExtracted, stored: totalStored };
}

async function validateExtraction(pool: pg.Pool, questionIds: string[]): Promise<void> {
  const datasetFile = resolve(import.meta.dirname, "..", "_datasets", "LongMemEval", "data", "longmemeval_s_cleaned.json");
  const data = JSON.parse(readFileSync(datasetFile, "utf-8")) as Array<{ question_id: string; question: string; answer: string; question_type: string }>;
  const probMap = new Map(data.map(d => [d.question_id, d]));

  console.log("\n=== VALIDATION ===\n");

  for (const qid of questionIds) {
    const prob = probMap.get(qid);
    if (!prob) continue;
    const tenantId = `__longmemeval_${dataset}_${qid}`;

    const result = await pool.query<{ entity_type: string; entity_name: string; predicate: string; object_value: string; occurred_at: string }>(
      `SELECT entity_type, entity_name, predicate, object_value, occurred_at::text
       FROM vaultcrux.entity_session_index
       WHERE tenant_id = $1
       ORDER BY occurred_at ASC NULLS LAST`,
      [tenantId],
    );

    console.log(`**${qid}** | \`${prob.question_type}\``);
    console.log(`  Q: ${prob.question.slice(0, 120)}`);
    console.log(`  A: ${prob.answer.slice(0, 120)}`);
    console.log(`  Entities: ${result.rows.length}`);
    for (const row of result.rows.slice(0, 10)) {
      const date = row.occurred_at ? ` [${row.occurred_at.slice(0, 10)}]` : "";
      console.log(`    ${row.entity_type}: ${row.entity_name} —${row.predicate}→ ${row.object_value}${date}`);
    }
    if (result.rows.length > 10) console.log(`    ... and ${result.rows.length - 10} more`);
    console.log();
  }
}

async function main() {
  console.log(`Entity extraction for LongMemEval ${dataset.toUpperCase()}`);
  console.log(`API: ${VAULTCRUX_API_BASE}`);
  console.log(`DB: ${DATABASE_URL.replace(/:[^@]*@/, ':***@')}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : validate ? "VALIDATE" : "LIVE"}`);
  console.log(`Concurrency: ${concurrency}\n`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5, idleTimeoutMillis: 10000 });

  let ids: string[];
  if (questionIds) {
    ids = questionIds;
  } else if (allQuestions) {
    const datasetFile = resolve(import.meta.dirname, "..", "_datasets", "LongMemEval", "data", "longmemeval_s_cleaned.json");
    const data = JSON.parse(readFileSync(datasetFile, "utf-8")) as Array<{ question_id: string }>;
    ids = data.map(d => d.question_id);
  } else {
    console.error("Specify --questions <ids> or --all");
    process.exit(1);
  }

  if (validate) {
    await validateExtraction(pool, ids);
    await pool.end();
    return;
  }

  console.log(`Processing ${ids.length} questions...\n`);

  let totalExtracted = 0;
  let totalStored = 0;

  let nextIndex = 0;
  async function worker() {
    while (nextIndex < ids.length) {
      const i = nextIndex++;
      const qid = ids[i]!;
      console.log(`[${i + 1}/${ids.length}] ${qid}`);
      const result = await processQuestion(qid, pool);
      totalExtracted += result.extracted;
      totalStored += result.stored;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(`\nDone: ${ids.length} questions, ${totalExtracted} entities extracted, ${totalStored} stored`);
  console.log(`Cost: ~$${(totalExtracted * 0.00005).toFixed(2)} (Haiku)`);

  await pool.end();
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
