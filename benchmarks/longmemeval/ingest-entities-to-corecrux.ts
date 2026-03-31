#!/usr/bin/env tsx
/**
 * Phase 7: Ingest entity facts from Postgres into CoreCrux via gRPC AppendBatch.
 */

import pg from "pg";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const DATABASE_URL = process.env.ENTITY_DB_URL ?? "postgres://vaultcrux:Et-lpNvPE-wdOKG1K3neNqLeFoinBmES-1a1aBPxkU19@100.75.64.43:5432/vaultcrux";
const CORECRUX_GRPC = process.env.CORECRUX_GRPC ?? "100.111.227.102:4007";

const args = process.argv.slice(2);
const dataset = args.find((_, i, a) => a[i - 1] === "--dataset") ?? "s3";

async function main() {
  // Load proto
  const PROTO_PATH = resolve("/home/myles/CueCrux/CoreCrux/proto/corecrux_dataplane_v1.proto");
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(packageDefinition) as any;
  const jwt = process.env.CORECRUX_JWT ?? "";
  const client = new proto.corecrux.dataplane.v1.CoreCruxDataPlaneV1(
    CORECRUX_GRPC,
    grpc.credentials.createInsecure(),
  );

  function authMetadata(): grpc.Metadata {
    const meta = new grpc.Metadata();
    meta.set("authorization", `Bearer ${jwt}`);
    return meta;
  }

  // Read entities from Postgres
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
  const result = await pool.query<{
    tenant_id: string; entity_type: string; entity_name: string;
    predicate: string; object_value: string; occurred_at: string | null;
    session_id: string; confidence: number;
  }>(
    `SELECT tenant_id, entity_type, entity_name, predicate, object_value,
            occurred_at::text, session_id, confidence
     FROM vaultcrux.entity_session_index WHERE tenant_id LIKE $1
     ORDER BY tenant_id, occurred_at ASC NULLS LAST`,
    [`__longmemeval_${dataset}_%`],
  );
  console.log(`Loaded ${result.rows.length} entities`);

  // Group by tenant
  const byTenant = new Map<string, typeof result.rows>();
  for (const row of result.rows) {
    const arr = byTenant.get(row.tenant_id) ?? [];
    arr.push(row);
    byTenant.set(row.tenant_id, arr);
  }
  console.log(`${byTenant.size} tenants\n`);

  let appended = 0, failed = 0;

  for (const [tenantId, facts] of byTenant) {
    const events = facts.map((f, _i) => {
      const occurredAtMicros = f.occurred_at ? new Date(f.occurred_at).getTime() * 1000 : 0;
      const confidenceQ16 = Math.round(f.confidence * 65535);

      // Binary encode: version(u16) + 6× length-prefixed strings(u16 len + bytes) + i64 + u16
      const strings = [tenantId, f.entity_type, f.entity_name, f.predicate, f.object_value, f.session_id];
      let size = 2; // version
      for (const s of strings) size += 2 + Buffer.byteLength(s, "utf-8");
      size += 8 + 2; // i64 + u16

      const buf = Buffer.alloc(size);
      let offset = 0;
      buf.writeUInt16LE(1, offset); offset += 2; // version = 1
      for (const s of strings) {
        const sBytes = Buffer.from(s, "utf-8");
        buf.writeUInt16LE(sBytes.length, offset); offset += 2;
        sBytes.copy(buf, offset); offset += sBytes.length;
      }
      buf.writeBigInt64LE(BigInt(occurredAtMicros), offset); offset += 8;
      buf.writeUInt16LE(confidenceQ16, offset); offset += 2;

      return {
        event_id: randomUUID(),
        occurred_at: f.occurred_at ?? new Date().toISOString(),
        event_type: "corecrux.proj.entity.fact.v1",
        content_type: "application/x-corecrux-proj-bin-v1",
        payload: buf,
      };
    });

    // Batch append via gRPC (max 100 events per batch)
    for (let i = 0; i < events.length; i += 100) {
      const batch = events.slice(i, i + 100);
      try {
        await new Promise<void>((resolve, reject) => {
          client.AppendBatch({
            tenant_id: tenantId,
            stream_type: "entity",
            stream_id: `entity:${tenantId}`,
            events: batch,
            expected_next_seq: "0",
          }, authMetadata(), { deadline: Date.now() + 10000 }, (err: any, resp: any) => {
            if (err) reject(err);
            else resolve();
          });
        });
        appended += batch.length;
      } catch (err: any) {
        if (failed < 5) console.error(`  ${tenantId}: ${err.message?.slice(0, 80)}`);
        failed += batch.length;
      }
    }

    if ((appended + failed) % 5000 === 0 && appended + failed > 0) {
      console.log(`  Progress: ${appended} appended, ${failed} failed`);
    }
  }

  console.log(`\nDone: ${appended} appended, ${failed} failed`);
  await pool.end();
  client.close();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
