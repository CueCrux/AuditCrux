/**
 * Audit Suite v2 — Database Operations
 *
 * Thin wrapper over v1's db.ts. The only change is insertChunksV2()
 * which uses doc.mime instead of hardcoding 'text/plain'.
 *
 * All other DB functions are re-exported from v1 unchanged.
 */

import { createHash } from "node:crypto";
import type pg from "pg";
import type { CorpusDocV2 } from "./types-v2.js";

// Re-export v1 DB functions unchanged
export {
    createPool,
    cleanAuditData,
    insertRelations,
    insertLivingStates,
    refreshMaterializedViews,
    type ChunkIdMap,
} from "../../audit/lib/db.js";

/**
 * Insert v2 corpus docs with per-doc MIME type.
 * Mirrors v1's insertChunks but line 43: uses d.mime instead of 'text/plain'.
 */
export async function insertChunksV2(
    pool: pg.Pool,
    docs: CorpusDocV2[],
    embeddings: number[][],
): Promise<Map<string, number>> {
    const idMap = new Map<string, number>();
    const artifactMap = new Map<string, number>();

    for (let i = 0; i < docs.length; i++) {
        const d = docs[i];
        const vec = embeddings[i];
        const artifactKey = d.artifactKey ?? d.id;
        let artifactId = artifactMap.get(artifactKey);
        if (artifactId === undefined) {
            const sha256 = createHash("sha256").update(`${artifactKey}:${d.content}`).digest("hex");
            const artResult = await pool.query(
                `INSERT INTO artifacts (kind, mime, sha256, domain, published_at, license_id, risk_flag, tenant_id)
                 VALUES ('chunk', $1, $2, $3, $4::timestamptz, $5, $6, $7)
                 RETURNING id`,
                [d.mime, sha256, d.domain, d.publishedAt, d.licenseId, d.riskFlag, d.tenantId],
            );
            artifactId = artResult.rows[0].id as number;
            artifactMap.set(artifactKey, artifactId);
        }
        idMap.set(d.id, artifactId);

        await pool.query(
            `INSERT INTO artifact_chunks (
                id,
                artifact_id,
                url,
                domain,
                title,
                excerpt,
                content,
                content_tsv,
                published_at,
                observed_at,
                license_id,
                risk_flag,
                tenant_id,
                content_type,
                mime_type,
                chunk_index,
                indexable,
                processing_metadata
            )
             VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                to_tsvector('english', $7),
                $8::timestamptz,
                $8::timestamptz,
                $9,
                $10,
                $11,
                $12,
                $13,
                $14,
                $15,
                $16::jsonb
            )
             ON CONFLICT (id) DO UPDATE
             SET content = EXCLUDED.content,
                 content_tsv = EXCLUDED.content_tsv,
                 content_type = EXCLUDED.content_type,
                 mime_type = EXCLUDED.mime_type,
                 chunk_index = EXCLUDED.chunk_index,
                 indexable = EXCLUDED.indexable,
                 processing_metadata = EXCLUDED.processing_metadata`,
            [
                d.id,
                artifactId,
                d.url,
                d.domain,
                d.title,
                d.content.slice(0, 480),
                d.content,
                d.publishedAt,
                d.licenseId,
                d.riskFlag,
                d.tenantId,
                d.contentType ?? "source",
                d.mimeType ?? d.mime,
                d.chunkIndex ?? i,
                d.indexable ?? true,
                JSON.stringify(d.processingMetadata ?? {}),
            ],
        );

        await pool.query(
            `INSERT INTO artifact_policies (chunk_id, license_id, risk_flag)
             VALUES ($1, $2, $3)
             ON CONFLICT (chunk_id) DO UPDATE SET license_id = EXCLUDED.license_id, risk_flag = EXCLUDED.risk_flag`,
            [d.id, d.licenseId, d.riskFlag],
        );

        const sqlVec = `[${vec.join(",")}]`;
        await pool.query(
            `INSERT INTO engine.embeddings_768 (tenant_id, chunk_id, artifact_id, lane_key, provider, model_key, dim, embedding)
             VALUES ($1, $2, $3, 'base_local_768', 'openai', 'text-embedding-3-small', $4, $5::vector)`,
            [d.tenantId, d.id, artifactId, vec.length, sqlVec],
        );
    }

    return idMap;
}
