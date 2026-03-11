import { createHash } from "node:crypto";
import pg from "pg";
import type { CorpusDoc, CorpusRelation, LivingState } from "./types.js";

export type ChunkIdMap = Map<string, number>; // chunk string id -> artifact integer id

export function createPool(): pg.Pool {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required");
    return new pg.Pool({ connectionString: url, max: 5 });
}

export async function cleanAuditData(pool: pg.Pool, tenantId: string) {
    // Clean in dependency order (FKs cascade from artifacts, but be explicit)
    await pool.query(`DELETE FROM crown_evidence WHERE snap_id IN (SELECT snap_id FROM crown_snapshots WHERE tenant_id = $1)`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM crown_snapshots WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM engine.artifact_living_state WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM engine.artifact_relations WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM engine.artifact_dependents WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM engine.embeddings_768 WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM engine.embeddings_1536 WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM embeddings WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM artifact_policies WHERE chunk_id IN (SELECT id FROM artifact_chunks WHERE tenant_id = $1)`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM artifact_chunks WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM artifacts WHERE tenant_id = $1`, [tenantId]).catch(() => {});
}

/**
 * Insert corpus docs into artifacts + artifact_chunks + artifact_policies + embeddings.
 * Returns a map of chunk string ID -> artifact integer ID for use in relations/living state.
 */
export async function insertChunks(pool: pg.Pool, docs: CorpusDoc[], embeddings: number[][]): Promise<ChunkIdMap> {
    const idMap: ChunkIdMap = new Map();

    for (let i = 0; i < docs.length; i++) {
        const d = docs[i];
        const vec = embeddings[i];
        const sha256 = createHash("sha256").update(`${d.id}:${d.content}`).digest("hex");

        // Insert artifact parent (with sha256)
        const artResult = await pool.query(
            `INSERT INTO artifacts (kind, mime, sha256, domain, published_at, license_id, risk_flag, tenant_id)
             VALUES ('chunk', 'text/plain', $1, $2, $3::timestamptz, $4, $5, $6)
             RETURNING id`,
            [sha256, d.domain, d.publishedAt, d.licenseId, d.riskFlag, d.tenantId]
        );
        const artifactId: number = artResult.rows[0].id;
        idMap.set(d.id, artifactId);

        // Insert chunk
        await pool.query(
            `INSERT INTO artifact_chunks (id, artifact_id, url, domain, title, excerpt, content, content_tsv, published_at, observed_at, license_id, risk_flag, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, to_tsvector('english', $7), $8::timestamptz, $8::timestamptz, $9, $10, $11)
             ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, content_tsv = EXCLUDED.content_tsv`,
            [d.id, artifactId, d.url, d.domain, d.title, d.content.slice(0, 480), d.content, d.publishedAt, d.licenseId, d.riskFlag, d.tenantId]
        );

        // Insert policy
        await pool.query(
            `INSERT INTO artifact_policies (chunk_id, license_id, risk_flag)
             VALUES ($1, $2, $3)
             ON CONFLICT (chunk_id) DO UPDATE SET license_id = EXCLUDED.license_id, risk_flag = EXCLUDED.risk_flag`,
            [d.id, d.licenseId, d.riskFlag]
        );

        // Insert embedding into engine.embeddings_768 (used by hybrid_fast_768 matview)
        const sqlVec = `[${vec.join(",")}]`;
        await pool.query(
            `INSERT INTO engine.embeddings_768 (tenant_id, chunk_id, artifact_id, lane_key, provider, model_key, dim, embedding)
             VALUES ($1, $2, $3, 'base_local_768', 'openai', 'text-embedding-3-small', $4, $5::vector)`,
            [d.tenantId, d.id, artifactId, vec.length, sqlVec]
        );
    }

    return idMap;
}

/**
 * Insert artifact relations. srcId/dstId are chunk string IDs — mapped to artifact integer IDs via idMap.
 */
export async function insertRelations(pool: pg.Pool, relations: CorpusRelation[], tenantId: string, idMap: ChunkIdMap) {
    for (const r of relations) {
        const srcArtifactId = idMap.get(r.srcId);
        const dstArtifactId = idMap.get(r.dstId);
        if (srcArtifactId === undefined || dstArtifactId === undefined) {
            console.warn(`  Relation skipped: missing artifact ID for ${r.srcId} or ${r.dstId}`);
            continue;
        }
        await pool.query(
            `INSERT INTO engine.artifact_relations (tenant_id, src_artifact_id, dst_artifact_id, relation_type, confidence)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT DO NOTHING`,
            [tenantId, srcArtifactId, dstArtifactId, r.relationType, r.confidence]
        ).catch((err) => {
            console.warn(`  Relation insert failed (${r.srcId}->${r.dstId}): ${err.message}`);
        });
    }
}

/**
 * Insert living states. artifactId is the chunk string ID — mapped to artifact integer ID via idMap.
 */
export async function insertLivingStates(pool: pg.Pool, states: LivingState[], tenantId: string, idMap: ChunkIdMap) {
    for (const s of states) {
        const artifactId = idMap.get(s.artifactId);
        if (artifactId === undefined) {
            console.warn(`  Living state skipped: missing artifact ID for ${s.artifactId}`);
            continue;
        }
        await pool.query(
            `INSERT INTO engine.artifact_living_state (tenant_id, artifact_id, living_status, confidence, last_validated_at, next_review_at)
             VALUES ($1, $2, $3, $4, now(), now() + interval '7 days')
             ON CONFLICT (tenant_id, artifact_id) DO UPDATE SET living_status = EXCLUDED.living_status, confidence = EXCLUDED.confidence`,
            [tenantId, artifactId, s.livingStatus, s.confidence]
        ).catch((err) => {
            console.warn(`  Living state insert failed (${s.artifactId}): ${err.message}`);
        });
    }
}

export async function refreshMaterializedViews(pool: pg.Pool) {
    try {
        await pool.query(`REFRESH MATERIALIZED VIEW hybrid_fast`);
    } catch (err: any) {
        console.warn(`  hybrid_fast refresh failed: ${err.message}`);
    }
    try {
        await pool.query(`REFRESH MATERIALIZED VIEW hybrid_fast_768`);
    } catch (err: any) {
        console.warn(`  hybrid_fast_768 refresh failed: ${err.message}`);
    }
}
