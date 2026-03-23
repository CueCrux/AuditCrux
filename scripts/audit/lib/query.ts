import type { QueryResult, ReceiptChainResult } from "./types.js";
import { decode as cborDecode, encode as cborEncode } from "cbor-x";
import { ed25519 } from "@noble/curves/ed25519";

const BASE_URL = process.env.BENCH_TARGET ?? "http://127.0.0.1:3333";
const API_KEY = process.env.API_KEY ?? "test-api-key";

// COSE header labels (RFC 9052 §3.1)
const COSE_HEADER_ALG = 1;
const COSE_HEADER_CONTENT_TYPE = 3;
const COSE_HEADER_KID = 4;
const COSE_HEADER_CWT_CLAIMS = 15;

export type ReceiptResponse = {
    receiptHash: string;
    coseEnvelope: string | null; // base64-encoded COSE_Sign1 bytes
    signature: { sigB64: string; kid: string; pubB64: string; signedAt: string } | null;
    snapshotId: string;
    answerId: string;
    mode: string;
    signingStatus: string;
};

export type CoseVerification = {
    envelope_present: boolean;
    signature_valid: boolean;
    kid_present: boolean;
    kid_value: string | null;
    cwt_issuer: string | null;
    cwt_subject: string | null;
    content_type_correct: boolean;
    algorithm_correct: boolean;
    cbor_receipt_hash_match: boolean;
    error?: string;
};

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

/**
 * Fetch the CROWN receipt for an answer, including coseEnvelope and signature.
 */
export async function fetchReceipt(answerId: string): Promise<ReceiptResponse> {
    const resp = await fetch(`${BASE_URL}/v1/answers/${answerId}/receipt`, {
        method: "GET",
        headers: { "x-api-key": API_KEY },
    });
    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`fetchReceipt(${answerId}) failed (${resp.status}): ${body.slice(0, 200)}`);
    }
    const data = await resp.json() as any;
    return {
        receiptHash: data.receiptHash,
        coseEnvelope: data.coseEnvelope ?? null,
        signature: data.signature ?? null,
        snapshotId: data.snapshotId,
        answerId: data.answerId,
        mode: data.mode,
        signingStatus: data.signingStatus ?? "unknown",
    };
}

/** Helper to get a value from a Map or plain object (cbor-x may return either). */
function mapGet(mapOrObj: unknown, key: number | string): unknown {
    if (mapOrObj instanceof Map) return mapOrObj.get(key);
    if (mapOrObj && typeof mapOrObj === "object") return (mapOrObj as Record<string | number, unknown>)[key];
    return undefined;
}

/**
 * Verify a COSE_Sign1 envelope from a receipt response.
 * Checks structure, protected header fields, ed25519 signature, and CBOR payload integrity.
 */
export function verifyCoseEnvelope(receipt: ReceiptResponse): CoseVerification {
    if (!receipt.coseEnvelope || !receipt.signature?.pubB64) {
        return {
            envelope_present: false,
            signature_valid: false,
            kid_present: false,
            kid_value: null,
            cwt_issuer: null,
            cwt_subject: null,
            content_type_correct: false,
            algorithm_correct: false,
            cbor_receipt_hash_match: false,
            error: !receipt.coseEnvelope ? "no cose_envelope" : "no public key",
        };
    }

    try {
        const envelopeBytes = Buffer.from(receipt.coseEnvelope, "base64");
        const decoded = cborDecode(envelopeBytes);

        if (!Array.isArray(decoded) || decoded.length !== 4) {
            return fail(`Invalid COSE_Sign1: expected 4-element array, got ${Array.isArray(decoded) ? decoded.length : typeof decoded}`);
        }

        const [protectedRaw, , payloadRaw, signatureRaw] = decoded;

        const protectedBytes = asBuffer(protectedRaw);
        const payload = asBuffer(payloadRaw);
        const signature = asBuffer(signatureRaw);

        // Decode protected header
        const protectedHeader = cborDecode(protectedBytes);

        // Check algorithm
        const alg = mapGet(protectedHeader, COSE_HEADER_ALG);
        const algorithm_correct = alg === -8; // EdDSA

        // Check content type
        const ct = mapGet(protectedHeader, COSE_HEADER_CONTENT_TYPE);
        const content_type_correct = ct === "application/vnd.crown.receipt+cbor";

        // Extract kid
        let kid_value: string | null = null;
        const kidBuf = mapGet(protectedHeader, COSE_HEADER_KID);
        if (kidBuf instanceof Uint8Array || Buffer.isBuffer(kidBuf)) {
            kid_value = Buffer.from(kidBuf).toString("utf-8");
        } else if (typeof kidBuf === "string") {
            kid_value = kidBuf;
        }

        // Extract CWT Claims (label 15)
        let cwt_issuer: string | null = null;
        let cwt_subject: string | null = null;
        const cwtClaims = mapGet(protectedHeader, COSE_HEADER_CWT_CLAIMS);
        if (cwtClaims && typeof cwtClaims === "object") {
            const iss = mapGet(cwtClaims, 1);
            if (typeof iss === "string") cwt_issuer = iss;
            const sub = mapGet(cwtClaims, 2);
            if (typeof sub === "string") cwt_subject = sub;
        }

        // Verify ed25519 signature over Sig_structure
        const sigStructure = [
            "Signature1",
            Buffer.from(protectedBytes),
            Buffer.alloc(0),
            Buffer.from(payload),
        ];
        const sigStructureBytes = cborEncode(sigStructure);
        const pubKey = Buffer.from(receipt.signature.pubB64, "base64");
        const signature_valid = ed25519.verify(signature, new Uint8Array(sigStructureBytes), pubKey);

        // Decode CBOR payload and check receipt-hash
        const cborPayload = cborDecode(payload) as Record<string, unknown>;
        const cborReceiptHash = cborPayload["receipt-hash"];
        const cbor_receipt_hash_match = typeof cborReceiptHash === "string" && cborReceiptHash === receipt.receiptHash;

        return {
            envelope_present: true,
            signature_valid,
            kid_present: kid_value !== null && kid_value.length > 0,
            kid_value,
            cwt_issuer,
            cwt_subject,
            content_type_correct,
            algorithm_correct,
            cbor_receipt_hash_match,
        };
    } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
    }
}

function asBuffer(raw: unknown): Buffer {
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof Uint8Array) return Buffer.from(raw);
    return Buffer.from(raw as any);
}

function fail(error: string): CoseVerification {
    return {
        envelope_present: false,
        signature_valid: false,
        kid_present: false,
        kid_value: null,
        cwt_issuer: null,
        cwt_subject: null,
        content_type_correct: false,
        algorithm_correct: false,
        cbor_receipt_hash_match: false,
        error,
    };
}
