import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "results");
const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM ?? "768", 10);
const PROVIDER = (process.env.AUDIT_EMBEDDING_PROVIDER ?? process.env.EMBEDDING_PROVIDER ?? "openai").trim().toLowerCase();
const CACHE_PATH = join(CACHE_DIR, `embeddings-cache-${PROVIDER}-${EMBEDDING_DIM}.json`);

type EmbeddingCache = Record<string, number[]>;

let cache: EmbeddingCache | null = null;

function loadCache(): EmbeddingCache {
    if (cache) return cache;
    if (existsSync(CACHE_PATH)) {
        try {
            cache = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
            return cache!;
        } catch {
            cache = {};
            return cache;
        }
    }
    cache = {};
    return cache;
}

function saveCache() {
    if (!cache) return;
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(cache));
}

function contentKey(text: string): string {
    return createHash("sha256").update(text).digest("hex");
}

async function embedBatchOpenAI(texts: string[]): Promise<number[][]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY required for openai embeddings");
    const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";

    const results: number[][] = [];
    for (let batch = 0; batch < texts.length; batch += 100) {
        const slice = texts.slice(batch, batch + 100);
        const resp = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ model, input: slice, dimensions: EMBEDDING_DIM }),
        });

        if (!resp.ok) {
            const body = await resp.text();
            throw new Error(`OpenAI embedding failed (${resp.status}): ${body}`);
        }

        const data = (await resp.json()) as {
            data: { embedding: number[]; index: number }[];
        };

        // Sort by index to maintain order
        const sorted = data.data.sort((a, b) => a.index - b.index);
        for (const item of sorted) {
            results.push(item.embedding);
        }
    }
    return results;
}

async function embedBatchEmbedderCrux(texts: string[]): Promise<number[][]> {
    const base = (process.env.EMBEDDERCRUX_BASE_URL ?? "http://127.0.0.1:8080").replace(/\/+$/, "");

    const results: number[][] = [];
    for (let batch = 0; batch < texts.length; batch += 64) {
        const slice = texts.slice(batch, batch + 64);
        const resp = await fetch(`${base}/embed`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inputs: slice }),
        });

        if (!resp.ok) {
            const body = await resp.text();
            throw new Error(`EmbedderCrux embedding failed (${resp.status}): ${body}`);
        }

        const data = await resp.json();
        // TEI returns number[][] directly, or { embeddings: number[][] }
        const embeddings: number[][] = Array.isArray(data) ? data : (data as any).embeddings ?? [];
        for (const vec of embeddings) {
            results.push(vec.slice(0, EMBEDDING_DIM));
        }
    }
    return results;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
    const c = loadCache();
    const results: (number[] | null)[] = texts.map((t) => c[contentKey(t)] ?? null);
    const uncached: { index: number; text: string }[] = [];

    for (let i = 0; i < texts.length; i++) {
        if (!results[i]) uncached.push({ index: i, text: texts[i] });
    }

    if (uncached.length > 0) {
        const uncachedTexts = uncached.map((u) => u.text);
        let embeddings: number[][];

        if (PROVIDER === "embeddercrux" || PROVIDER === "ollama" || PROVIDER === "local") {
            embeddings = await embedBatchEmbedderCrux(uncachedTexts);
        } else {
            embeddings = await embedBatchOpenAI(uncachedTexts);
        }

        for (let i = 0; i < uncached.length; i++) {
            const entry = uncached[i];
            const key = contentKey(entry.text);
            c[key] = embeddings[i];
            results[entry.index] = embeddings[i];
        }
        saveCache();
        console.log(`  Embedded ${uncached.length} texts via ${PROVIDER} (${texts.length - uncached.length} cached)`);
    } else {
        console.log(`  All ${texts.length} embeddings from cache`);
    }

    return results as number[][];
}

export async function embedSingle(text: string): Promise<number[]> {
    const [vec] = await embedTexts([text]);
    return vec;
}
