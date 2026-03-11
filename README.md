# crux-audit

A reproducible retrieval quality audit suite for the CueCrux Engine.

## Why this exists

Most retrieval-augmented generation systems ship without a reproducible quality benchmark. You get a demo, a vague claim about accuracy, and a suggestion to "tune your prompts." There is no published methodology for measuring whether a retrieval engine correctly handles document supersession, causal chain traversal, format heterogeneity, or corpus degradation under scale. This suite exists to fill that gap. Every number has a run ID. Every claim can be reproduced.

The suite measures retrieval quality across three progressively harder corpus configurations, three engine modes, and fourteen distinct test categories. It separates pipeline retrieval quality (did the right documents reach the scoring layer?) from LLM citation selection (did the model choose to cite them?). It documents known limitations by name, not by omission.

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | >= 20.0.0 | Required for `fetch` and ESM support |
| CueCrux Engine | Running instance | Reachable at `BENCH_TARGET` URL |
| PostgreSQL | Engine's database | Direct connection for corpus insertion and Cat 4 DB checks |
| Embedding provider | OpenAI or EmbedderCrux | Must match the Engine's embedding space |

Required environment variables (see [.env.example](.env.example) for full documentation):

```
BENCH_TARGET=http://127.0.0.1:3333
API_KEY=your-engine-api-key
DATABASE_URL=postgres://user:pass@host:port/engine
OPENAI_API_KEY=sk-...               # if using OpenAI embeddings
AUDIT_EMBEDDING_PROVIDER=openai      # or embeddercrux
```

The Engine must have `ANSWERS_RATE_LIMIT_MAX=5000` (or higher) set in its environment. Cat 5 alone issues 50 queries per run.

## Quickstart

```bash
npm install
cp .env.example .env   # edit with your credentials
npm run audit:v3       # run the v3 capability probe suite (~5 min)
```

To run all three suites:

```bash
npm run audit:v1       # baseline corpus, 4 categories, ~10 min
npm run audit:v2       # enterprise corpus (25K docs), 4 categories, ~20 min
npm run audit:v3       # capability probes, 6 categories, ~5 min
```

Results are written to `scripts/audit-results/` as both `.md` (human-readable) and `.json` (machine-readable).

## Canonical Results

The current canonical run, executed 2026-03-11 against CueCrux Engine on CueCrux-Data-1 (i9-13900, 192GB DDR5, 2x1.92TB NVMe RAID-1).

### v1 — Baseline Corpus (run 110ada93)

| Category | V1 | V3.1 | V4.1 |
|---|:---:|:---:|:---:|
| Supersession Accuracy | PASS | PASS | PASS |
| Causal Chain Retrieval | PASS | PASS | PASS |
| Corpus Degradation | PASS | PASS | PASS |
| Temporal Reconstruction | PASS | PASS | PASS |

**12/12 passed.** Clean text corpus, ~40 docs per category (Cat 3 scales to 10K).

### v2 — Enterprise Corpus (run c85daff7)

| Category | V1 | V3.1 | V4.1 |
|---|:---:|:---:|:---:|
| Supersession Accuracy | PASS | PASS | PASS |
| Causal Chain Retrieval | PASS | PASS | PASS |
| Corpus Degradation | PASS | PASS | PASS |
| Temporal Reconstruction | PASS | PASS | PASS |

**12/12 passed.** Meridian Financial Services corpus with heterogeneous MIME types (Markdown, JSON, YAML, CSV, HTML, email, chat, meeting notes), 550 base docs scaling to 25K.

### v3 — Capability Probes (run e782fbd0)

| Category | V1 | V3.1 | V4.1 |
|---|:---:|:---:|:---:|
| Relation-Bootstrapped Retrieval | PASS | PASS | PASS |
| Format-Aware Ingestion Recall | PASS | PASS | PASS |
| BM25 vs Vector Decomposition | PASS | PASS | PASS |
| Temporal Edge Cases | skip | PASS | PASS |
| Receipt Chain Stress | PASS | — | — |
| Fragility Calibration | PASS | PASS | PASS |

**16/16 passed.** Small focused corpus (~64 docs) probing 6 specific Engine capabilities.

Full results with per-query metrics: [RESULTS.md](RESULTS.md)

## What each category tests

### v1/v2: Supersession Accuracy

When document B supersedes document A, queries about the topic should rank B above A. The test inserts documents with known `supersedes` relations and verifies that the Engine's retrieval + MiSES (Multi-Source Evidence Synthesis) composition respects the supersession chain. v1 uses 3 clean-text documents. v2 uses 20 documents across 4 supersession chains in mixed formats (Markdown policies, JSON configs, email threads, meeting notes).

### v1/v2: Causal Chain Retrieval

A regulation causes an architecture decision, which causes an incident. Queries about the incident should surface the upstream regulation. The test builds multi-hop causal chains using `derived_from` and `cites` relations and measures whether the Engine retrieves documents across the chain. v2 extends this to 5 chains spanning 25 documents in heterogeneous formats.

### v1/v2: Corpus Degradation Under Scale

As the corpus grows from 100 to 10K (v1) or 550 to 25K (v2) documents, retrieval quality degrades. This category measures the degradation slope: precision@5 and recall@5 at each scale point. A healthy system degrades gracefully (slope > -0.03 per 1K docs). The test also runs fragility probes in `verified` mode at each scale point to verify that the leave-one-out fragility scoring remains stable.

### v1/v2: Temporal Reconstruction

Documents have lifecycles: published, updated, superseded, deprecated, contested. The Engine assigns `living_state` labels based on relation graphs and temporal windows. This category inserts documents at 5-6 time snapshots and verifies that the state machine produces correct classifications at each point. v2 uses 60 documents across 6 independent lifecycles with cross-format evidence.

### v3 Cat 1: Relation-Bootstrapped Retrieval

Tests whether `artifact_relations` edges expand the retrieval candidate set. A query matches document A by vocabulary. Document B uses completely different terminology but has a `supersedes` relation to A. If the Engine uses relations during candidate expansion, B appears. Current result: relation expansion is not active. This is documented as a baseline, not a failure.

### v3 Cat 2: Format-Aware Ingestion Recall

The same factual content expressed in 6 formats: Markdown, JSON, YAML, CSV, chat transcript, and meeting notes. Measures retrieval recall stratified by MIME type. Current result: all 6 formats achieve 100% retrieved recall (the pipeline finds them). Citation recall varies by format — the LLM prefers citing prose over structured data. This distinction between retrieved recall and citation recall is a key finding.

### v3 Cat 3: BM25 vs Vector Decomposition

Decomposes the hybrid retrieval pipeline into its BM25 (keyword) and vector (semantic) contributions. Three document classes: K-class (rare unique terms, BM25-favorable), V-class (paraphrased content with zero keyword overlap, vector-favorable), H-class (both keyword-matchable and semantically similar). All three classes achieve 100% retrieved recall. V-class documents are retrieved but rarely cited — the LLM favors documents with keyword anchors. Pass criteria use retrieved recall, not citation recall.

### v3 Cat 4: Temporal Edge Cases

Three patterns that stress the living state machine: (A) contested-to-superseded transitions, (B) rapid succession (4 versions within 10 days), (C) documents near the 90-day window boundary. Direct DB state verification, no API queries. Current result: 12/12 correct across all patterns.

### v3 Cat 5: Receipt Chain Stress

50 queries in `verified` mode against 2 documents, building a receipt chain up to the CTE depth limit of 50. Measures chain integrity and verification latency at 10 depth checkpoints. Current result: all chains intact at depth 50, verification latency ~3ms (flat, no degradation with depth).

### v3 Cat 6: Fragility Calibration

Three scenarios with controlled domain distribution to test whether leave-one-out fragility scoring produces distinguishable scores. F1 (2 docs, 2 domains) should produce high fragility. F2 (4 docs, 3 domains) moderate. F3 (6 docs, 4 domains) low. Current result: F1=1.0, F2=0.0, F3=0.0. Monotonic ordering is correct (F1 > F2 >= F3). F2 and F3 produce 0.0 because the leave-one-out probe only triggers when removing a citation would violate the `minDomains=2` constraint, which requires the citation set to be exactly at the minimum.

## Known limitations

**Embedding space mismatch.** The canonical runs use OpenAI `text-embedding-3-small` at 768 dimensions. The production Engine uses EmbedderCrux (nomic-embed-text-v1.5) at 768 dimensions. These are different embedding spaces. The audit suite's retrieval patterns may differ from production retrieval patterns. This will be resolved when the audit suite is switched to EmbedderCrux embeddings. The cache is keyed by provider to prevent cross-contamination.

**Format-aware chunking not implemented.** The Engine currently treats all MIME types as plain text during chunking. JSON, YAML, and CSV documents are not parsed into their structural components. Cat 2 demonstrates that the pipeline retrieves these formats successfully despite the lack of format-specific chunking, but format-aware processing would improve citation rates for structured data.

**Relation expansion not active.** Cat 1 documents that `artifact_relations` edges do not currently expand the retrieval candidate set. The relation graph is used for living state classification and MiSES composition, but not for candidate retrieval. This is a known architectural gap, not a bug.

**Fragility scoring is corpus-dependent.** Fragility scores measure how sensitive a specific answer is to the removal of individual citations. The score depends on the number of domains represented in the citation set and the `minDomains` constraint. A fragility score of 0.0 does not mean "robust" in the abstract — it means "no single citation removal violates the domain diversity constraint for this specific query."

**LLM citation nondeterminism.** The LLM that selects which retrieved documents to cite in the final answer is nondeterministic. Citation recall can vary between runs for the same corpus. Retrieved recall (measuring pipeline quality before LLM selection) is deterministic given fixed embeddings and corpus. The suite reports both metrics and uses retrieved recall for pass/fail criteria where LLM nondeterminism would cause instability.

**Synthetic corpus.** All corpus documents are synthetic. They are designed to test specific retrieval properties, not to represent real-world document distributions. The Meridian Financial Services corpus (v2) is the most realistic but is still entirely fictional.

## How to interpret results

**Citation recall vs retrieved recall.** Citation recall measures which expected documents the LLM chose to cite in its answer. Retrieved recall measures which expected documents the retrieval pipeline returned to the LLM before citation selection. Retrieved recall isolates pipeline quality from LLM behavior. When retrieved recall is 1.0 but citation recall is 0.33, the pipeline found everything — the LLM just chose to cite different documents.

**Fragility scores.** A fragility score of 1.0 means removing any single citation would violate the domain diversity constraint (`minDomains=2`). A score of 0.0 means no single removal violates the constraint. This is a structural property of the citation set, not a judgment about answer quality. Fragility is only computed in `verified` and `audit` modes where `minDomains=2` is enforced.

**Degradation slopes.** A slope of -0.02 precision@5 per 1K documents means that adding 1,000 noise documents reduces precision@5 by 0.02. The v1 baseline slope is -0.020 (V1 mode) and -0.019 (V4.1 mode). The v2 enterprise slope is -0.010 (V1) and -0.008 (V4.1). The enterprise corpus degrades more slowly because the heterogeneous format distribution provides more distinctive content per document.

**Pass/fail criteria.** Each category has specific, documented pass criteria. A PASS means the measured metrics exceed the threshold. Categories designed to document baselines (Cat 1 relation expansion, Cat 2 format recall, Cat 6 fragility calibration) have relaxed thresholds that characterize current behavior rather than assert ideal behavior. The thresholds are set based on what the Engine can reliably achieve, not on what would be ideal.

## Contributing

### Adding corpus documents

Each category's corpus is defined in a TypeScript file under `scripts/audit-v{N}/lib/corpus/`. Documents follow the `CorpusDoc` or `CorpusDocV2` type. To add documents:

1. Add your document objects to the appropriate category file
2. Add corresponding ground truth entries (expected doc IDs, expected rankings)
3. Ensure document IDs are unique across the category
4. Run `npm run audit:v3 -- --dry-run` to validate ID uniqueness and reference integrity

### Adding categories

1. Create a new corpus file: `scripts/audit-v3/lib/corpus/cat7-your-category.ts`
2. Export `getCat7Corpus()` returning `{ docs, relations?, livingStates?, groundTruths }`
3. Add a `runCat7()` function to the orchestrator (`quality-audit-v3.ts`)
4. Wire it into the mode/category dispatch loop
5. Add the category to the `V3CategoryId` type in `types-v3.ts`
6. Document what it tests and why in this README

### Running a new canonical result

After changes, run the full suite and record the result:

```bash
npm run audit:v3 -- --mode all --cat all
```

Copy the generated `.md` and `.json` files from `scripts/audit-results/` to `results/` with the appropriate version prefix. Add a row to [RESULTS.md](RESULTS.md).

## License

MIT
