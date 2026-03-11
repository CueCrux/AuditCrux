import type { QueryResult, ReceiptChainResult } from "./types.js";

const BASE_URL = process.env.BENCH_TARGET ?? "http://127.0.0.1:3333";
const API_KEY = process.env.API_KEY ?? "test-api-key";

export async function queryAnswers(
    query: string,
    opts: { mode?: string; topK?: number; tenantId?: string } = {}
): Promise<QueryResult> {
    const mode = opts.mode ?? "verified";
    const topK = opts.topK ?? 10;
    const tenantId = opts.tenantId ?? "__audit__";

    let data: any;
    for (let attempt = 0; attempt < 3; attempt++) {
        const resp = await fetch(`${BASE_URL}/v1/answers`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": API_KEY,
                "x-tenant-id": tenantId,
            },
            body: JSON.stringify({ q: query, mode, top_k: topK }),
        });

        if (resp.ok) {
            data = await resp.json();
            break;
        }

        const body = await resp.text();
        // Don't retry 503 insufficient_evidence — it's not transient (corpus hasn't changed).
        // Retrying wastes requests and contributes to rate-limit exhaustion.
        const is503Evidence = resp.status === 503 && body.includes("insufficient_evidence");
        const retryable = (resp.status >= 500 || resp.status === 428) && !is503Evidence;
        if (retryable && attempt < 2) {
            console.warn(`    Retry ${attempt + 1}/2: ${resp.status} — ${body.slice(0, 120)}`);
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
        }
        throw new Error(`Answers query failed (${resp.status}): ${body}`);
    }

    if (!data) throw new Error(`Answers query failed: no response data after retries`);

    return {
        query,
        answerId: data.answerId,
        citations: (data.citations ?? []).map((c: any) => ({
            id: c.id,
            domain: c.domain,
            url: c.url,
            quoteHash: c.quoteHash ?? c.quote_hash,
        })),
        crown: {
            modeApplied: data.crown?.modeApplied,
            receiptId: data.crown?.receiptId,
            miSESSize: data.crown?.miSESSize,
            citationIds: data.crown?.citationIds ?? [],
            fragilityScore: data.crown?.fragilityScore,
            signed: data.crown?.signed ?? false,
            knowledgeStateCursor: data.crown?.knowledgeStateCursor,
        },
        timings: {
            retrieveMs: data.timings?.retrieveMs ?? 0,
            rerankMs: data.timings?.rerankMs ?? 0,
            llmMs: data.timings?.llmMs ?? 0,
            totalMs: data.timings?.totalMs ?? 0,
        },
        retrievedIds: (data.retrievedIds ?? []) as string[],
        rawResponse: data,
    };
}

/**
 * Verify the CROWN receipt chain for a given answer via the Engine's
 * /receipts/:answerId/verify-chain endpoint.
 */
export async function verifyReceiptChain(answerId: string): Promise<ReceiptChainResult> {
    try {
        const resp = await fetch(`${BASE_URL}/v1/receipts/${answerId}/verify-chain`, {
            method: "GET",
            headers: {
                "x-api-key": API_KEY,
            },
        });

        if (!resp.ok) {
            const body = await resp.text();
            return {
                answerId,
                chainLength: 0,
                chainIntact: false,
                signed: false,
                error: `verify-chain returned ${resp.status}: ${body.slice(0, 200)}`,
            };
        }

        const data = await resp.json() as any;
        // Endpoint returns { ok: boolean, data: { valid: boolean, depth: number, breaks: [] } }
        const inner = data.data ?? data;
        return {
            answerId,
            chainLength: inner.depth ?? 1,
            chainIntact: data.ok ?? inner.valid ?? false,
            signed: false, // signature status comes from the answer response, not verify-chain
            receiptId: inner.snap_id,
        };
    } catch (err) {
        return {
            answerId,
            chainLength: 0,
            chainIntact: false,
            signed: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
