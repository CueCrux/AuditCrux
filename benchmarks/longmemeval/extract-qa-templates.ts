#!/usr/bin/env tsx
/**
 * Phase 5 M6: QA Inversion — extract answerable questions from chunks.
 *
 * For each entity-bearing chunk, generates question templates that this chunk
 * can answer. Stores in qa_template_index for reverse matching at query time.
 *
 * Usage:
 *   npx tsx extract-qa-templates.ts --dataset s3 --questions q1,q2 --dry-run
 *   npx tsx extract-qa-templates.ts --dataset s3 --all --concurrency 5
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
const questionIds = get("--questions")?.split(",");
const allQuestions = has("--all");
const concurrency = parseInt(get("--concurrency") ?? "5", 10);

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const QA_PROMPT = `For each factual statement in this conversation text, generate a natural question that this text answers.

Output as JSON array:
{"question": "What ...?", "answer": "...", "keywords": ["key1", "key2"]}

Rules:
- Generate questions a user would NATURALLY ask (not "What does this text say about...")
- Include the specific answer from the text
- Include 2-4 keywords that someone might use to search for this answer
- Focus on: names, numbers, dates, places, activities, preferences, purchases, events
- Skip: greetings, generic discussion, questions the text asks but doesn't answer
- Generate 3-8 QA pairs per chunk (focus on the most important facts)

Text:
`;

interface QATemplate {
  question: string;
  answer: string;
  keywords: string[];
}

async function extractQATemplates(chunkContent: string): Promise<QATemplate[]> {
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      temperature: 0.1,
      messages: [{ role: "user", content: QA_PROMPT + chunkContent }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as QATemplate[];
    return parsed.filter(t => t.question && t.answer && t.keywords?.length > 0);
  } catch {
    return [];
  }
}

async function getChunksForTenant(tenantId: string): Promise<Array<{ chunkId: string; content: string; docId: string }>> {
  const allChunks = new Map<string, { chunkId: string; content: string; docId: string }>();
  const queries = ["personal facts activities", "things bought visited attended", "people places events", "preferences hobbies routine"];
  for (const query of queries) {
    try {
      const resp = await fetch(`${VAULTCRUX_API_BASE}/v1/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": VAULTCRUX_API_KEY, "x-tenant-id": tenantId },
        body: JSON.stringify({ tenantId, agentId: "qa-extractor", query, limit: 20, lane: "light", includeCommons: false }),
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) continue;
      const data = await resp.json() as any;
      for (const r of data?.data?.results ?? []) {
        if (r.content && !allChunks.has(r.chunkId)) {
          allChunks.set(r.chunkId, { chunkId: r.chunkId, content: r.content, docId: r.docId });
        }
      }
    } catch { continue; }
  }
  return [...allChunks.values()];
}

async function storeTemplates(pool: pg.Pool, tenantId: string, templates: QATemplate[], chunkId: string, docId: string): Promise<number> {
  if (templates.length === 0 || dryRun) return 0;
  let stored = 0;
  for (const t of templates) {
    try {
      await pool.query(
        `INSERT INTO vaultcrux.qa_template_index
         (tenant_id, question_template, answer_text, keywords, source_chunk_id, source_doc_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [tenantId, t.question, t.answer, t.keywords.join(","), chunkId, docId],
      );
      stored++;
    } catch { /* skip duplicates */ }
  }
  return stored;
}

async function processQuestion(qid: string, pool: pg.Pool): Promise<{ extracted: number; stored: number }> {
  const tenantId = `__longmemeval_${dataset}_${qid}`;
  const chunks = await getChunksForTenant(tenantId);
  if (chunks.length === 0) return { extracted: 0, stored: 0 };

  let totalExtracted = 0, totalStored = 0;
  for (const chunk of chunks.slice(0, 20)) {
    const templates = await extractQATemplates(chunk.content);
    totalExtracted += templates.length;
    totalStored += await storeTemplates(pool, tenantId, templates, chunk.chunkId, chunk.docId);
  }
  console.log("  %s: %d chunks -> %d templates, %d stored%s", qid, chunks.length, totalExtracted, totalStored, dryRun ? " (dry-run)" : "");
  return { extracted: totalExtracted, stored: totalStored };
}

async function main() {
  console.log("QA Inversion for LongMemEval %s", dataset.toUpperCase());
  console.log("Mode: %s, Concurrency: %d\n", dryRun ? "DRY RUN" : "LIVE", concurrency);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5, idleTimeoutMillis: 10000 });

  // Create table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vaultcrux.qa_template_index (
      id serial PRIMARY KEY,
      tenant_id text NOT NULL,
      question_template text NOT NULL,
      answer_text text NOT NULL,
      keywords text NOT NULL,
      source_chunk_id text,
      source_doc_id text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_qa_template_tenant ON vaultcrux.qa_template_index (tenant_id);
    CREATE INDEX IF NOT EXISTS idx_qa_template_keywords ON vaultcrux.qa_template_index USING gin(to_tsvector('english', keywords || ' ' || question_template));
  `);

  let ids: string[];
  if (questionIds) { ids = questionIds; }
  else if (allQuestions) {
    const data = JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "_datasets", "LongMemEval", "data", "longmemeval_s_cleaned.json"), "utf-8"));
    ids = data.map((d: any) => d.question_id);
  } else { console.error("Specify --questions or --all"); process.exit(1); }

  console.log("Processing %d questions...\n", ids.length);
  let totalE = 0, totalS = 0, nextIdx = 0;

  async function worker() {
    while (nextIdx < ids.length) {
      const i = nextIdx++;
      console.log("[%d/%d] %s", i + 1, ids.length, ids[i]);
      const r = await processQuestion(ids[i]!, pool);
      totalE += r.extracted;
      totalS += r.stored;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log("\nDone: %d questions, %d templates extracted, %d stored", ids.length, totalE, totalS);
  await pool.end();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
