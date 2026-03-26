// MemoryCrux Benchmark — Run ID generator

import { createHash } from "node:crypto";
import type { BenchArm, BenchModel, BenchProject, ReasoningProfile } from "./types.js";

export function generateRunId(params: {
  project: BenchProject;
  phase: number;
  model: BenchModel;
  profile: ReasoningProfile;
  arm: BenchArm;
  variant: string;
}): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const hash = createHash("sha256")
    .update(`${JSON.stringify(params)}-${Date.now()}-${Math.random()}`)
    .digest("hex")
    .slice(0, 6);

  const modelSlug = params.model.replace(/\./g, "-");
  return `mc-bench-${params.project}-p${params.phase}-${modelSlug}-${params.profile}-${params.arm.toLowerCase()}-${params.variant}-${date}-${hash}`;
}
