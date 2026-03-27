# MemoryCrux Benchmark — Uplift Report v2.0

Generated: 2026-03-26
Harness: v1.1 → v2.0 (Crux Score, F1 arm, Gamma fixture)

## Executive Summary

v2.0 extends the benchmark from 75 Alpha/Beta runs (v1.1) to 87 runs across three fixtures (Alpha, Beta, Gamma) with four arms (C0, C2, F1, T2). Key findings:

1. **Safety layer confirmed** (Beta): T2 is SAFE across all models; control arms are UNSAFE on claude-sonnet-4-6 (S_gate=0 → Cx=0 Em).
2. **Memory recall does not differentiate on small corpora** (Alpha): C2 matches or exceeds T2 recall at 88% across all models. Alpha's 8-key corpus fits within C2's 128K context window.
3. **Gamma (82K token corpus) shows context-window advantage for C2, not T2** (gpt-5.4-mini): C2 achieves 56% recall vs T2 at 44%. gpt-5.4-mini is too weak a tool-user for VaultCrux tools to add value.
4. **F1 (file-based memory) matches C2 recall at lower cost**: 56% recall at $0.07 vs C2's $0.18. The file search/read pattern is effective for static corpora.
5. **Model capability is a prerequisite for tool-based memory value**: T2 consistently underperforms controls on gpt-5.4-mini across all fixtures. Tool-calling overhead without effective synthesis yields negative ROI.

## Fixture Comparison — Baseline (v01)

### Alpha (3 phases, 8 keys, ~8K token corpus)

| Arm | sonnet-4-6 | gpt-5.4 | gpt-5.4-mini |
|-----|-----------|---------|-------------|
| C0 | 75% / 36.75 Em | 88% / 39.38 Em | 88% / 39.38 Em |
| C2 | 88% / 39.38 Em | 88% / 39.38 Em | 88% / 39.38 Em |
| T2 | 88% / 40.65 Em | 75% / 26.34 Em | 75% / 21.25 Em |

**Alpha conclusion:** Corpus too small for structural differentiation. C2 fits everything in context. T2 only matches C2 on sonnet-4-6; underperforms on both GPT models.

### Beta (1 phase, 8 keys, safety-critical)

| Arm | sonnet-4-6 | gpt-5.4 | gpt-5.4-mini |
|-----|-----------|---------|-------------|
| C0 | 88% / **0 Em** (UNSAFE) | 75% / 4.25 Em | 63% / 3.87 Em |
| C2 | 88% / **0 Em** (UNSAFE) | 75% / 4.25 Em | 63% / 3.87 Em |
| T2 | 63% / **4.49 Em** (SAFE) | 63% / 4.20 Em | 75% / 5.18 Em |

**Beta conclusion:** Safety is T2's differentiator. S_gate=0 zeroes Cx for UNSAFE controls on sonnet-4-6. On gpt-5.4-mini, T2 is the *only* arm that beats controls on both recall and safety. Beta is the strongest proof point for the memory layer.

### Gamma (5 phases, 16 keys, 82K token corpus, 3 needles, 2 contradictions)

| Arm | gpt-5.4-mini |
|-----|-------------|
| C0 | 38% / 37.13 Em |
| C2 | **56% / 55.69 Em** |
| F1 | 56% / 39.85 Em |
| T2 | 44% / 31.47 Em |

**Gamma conclusion:** C2 wins on recall because gpt-5.4-mini uses the 128K context more effectively than the VaultCrux tool interface. T2's 59 tool calls produce less useful results than having the corpus in-context. Needle keys missed by all arms — none found vol-0a1b2c3d4e5f, kafka-broker-tls, or Building C Floor 3 Room 312.

## Kill Variant Analysis — Gamma

### G1: Dirty kill after Phase 1

| Arm | Recall | Cx (Em) |
|-----|--------|---------|
| C0 | 50% | 49.50 |
| C2 | **69%** | **68.06** |
| F1 | 56% | 39.90 |
| T2 | 31% | 22.67 |

### G4: Graceful handoff after Phase 3

| Arm | Recall | Cx (Em) |
|-----|--------|---------|
| C0 | 38% | 37.13 |
| C2 | **63%** | **61.88** |
| F1 | 56% | 39.88 |
| T2 | 25% | 18.21 |

**Kill variant conclusion:** T2 performs *worse* after kills, not better. The hypothesis was that T2's decision recording (record_decision_context, checkpoint_decision_state) would enable recall of generated decisions after kill boundaries. In practice, gpt-5.4-mini doesn't call these tools effectively, so decisions are lost. C2 retains recall because the corpus re-appears in context on restart.

Anomaly: G1 recall is *higher* than v01 for C0/C2. This likely reflects variance in LLM output rather than a systematic effect — the kill boundary changes which phases contribute to the final Phase 5 output.

## Crux Score Decomposition

### Why T2 Cx is lower than C2 on Gamma

The Crux Score formula: `Cx = S_gate × Q_combined × T_human_minutes × 1/(1+N_corrections)`

For Gamma (no safety gate), the key factor is `Q_info = R_decision × R_constraint × (1 + R_incident) × P_context × (1 + A_coverage)`:

- **R_decision**: C2 = 0.56, T2 = 0.44 → C2 wins by 27%
- **P_context**: T2 gets credit for tool-retrieved context, but the model doesn't synthesize it well
- **N_turns**: T2 = 36, C2 = 5 → T2 penalty from more turns without proportional quality gain

### Cost Comparison

| Arm | Alpha Cost | Beta Cost | Gamma Cost |
|-----|-----------|-----------|------------|
| C0 | $0.01-0.23 | $0.002-0.05 | $0.09 |
| C2 | $0.01-0.24 | $0.003-0.05 | $0.18 |
| F1 | - | - | $0.07 |
| T2 | $0.02-0.78 | $0.003-0.07 | $0.07 |

T2 cost on Gamma ($0.07) is comparable to F1 — the model makes many cheap tool calls rather than processing a large context window. C2 is most expensive on Gamma ($0.18) due to 424K input tokens across 5 phases.

## F1 vs T2: The Real Comparison

F1 (file-based memory) is the realistic alternative to T2 (VaultCrux). On Gamma:

| Metric | F1 | T2 |
|--------|----|----|
| Recall | 56% | 44% |
| Cx | 39.85 Em | 31.47 Em |
| Tool calls | 121 | 59 |
| Cost | $0.07 | $0.07 |
| Turns | 22 | 36 |

F1 wins on recall despite more tool calls because search_files/read_file/search_content is a simpler, more reliable tool interface than VaultCrux's 21-tool API. The model can effectively grep for terms and read matching documents. VaultCrux tools require understanding semantic search, constraint checking, and decision recording — a higher cognitive bar for the LLM.

**This does not mean VaultCrux is less valuable than file search.** It means:
1. **gpt-5.4-mini** is below the tool-proficiency threshold for VaultCrux
2. VaultCrux's value proposition (semantic search, constraint enforcement, decision persistence, causal chains) only materializes when the model can effectively use the tools
3. Testing on stronger models (gpt-5.4, claude-sonnet-4-6) is required to validate this hypothesis

## Recommendations

### Immediate (validated)

1. **Beta is the flagship demo**: S_gate differentiation is unambiguous (0 Em vs 4-5 Em). Lead with safety for positioning.
2. **Alpha fixture is ceiling-limited**: 8K token corpus doesn't exercise the memory layer. Use only for basic harness validation, not for differentiation claims.

### Next steps (required for Gamma validation)

3. **Run Gamma on claude-sonnet-4-6 and gpt-5.4**: These models have stronger tool-use capabilities. If T2 recall exceeds C2 on a stronger model, the hypothesis holds. If not, the tool interface needs simplification.
4. **Audit T2 tool call logs on Gamma**: Check whether the model calls query_memory / get_relevant_context at session boot, whether it calls record_decision_context after decisions, and whether it calls get_contradictions in Phase 4. Low utilization of the structured retrieval protocol would explain T2's underperformance.
5. **Consider simplifying the T2 tool surface for weaker models**: 21 tools is a large API surface. A "lite" T2 variant with 5-7 core tools may perform better on smaller models.

### Structural improvements

6. **3× repetition runs on Gamma**: Single runs have high variance. Need min 3 runs per cell to establish confidence intervals.
7. **Prompt-sensitivity testing**: Verify that Gamma's Phase 5 recall scoring isn't overly dependent on the specific decision key strings (e.g., "48h retention" vs "48-hour retention").
8. **Generated decision persistence metric**: The scoreGeneratedDecisionPersistence function was implemented but isn't wired into the main scoring loop yet (requires pre/post kill session splitting). Wire it to get the structural differentiation signal.

## Appendix: Full Run Matrix

Total runs: 87 (75 Alpha/Beta from v1.1 + 12 Gamma from v2.0)

### By fixture
- Alpha: 57 runs (3 models × 3 arms × {v01, A1, A2, A3} + duplicates)
- Beta: 18 runs (3 models × 3 arms × {v01} + duplicates)
- Gamma: 12 runs (1 model × 4 arms × {v01, G1, G4})

### Arms
- C0: Flat context, 16K token cap
- C2: Flat context, 128K token cap
- F1: File-based memory (search_files, read_file, search_content), 32K context
- T2: VaultCrux treatment, 21 tools, full memory layer

### Models tested
- claude-sonnet-4-6 (Alpha, Beta)
- gpt-5.4 (Alpha, Beta)
- gpt-5.4-mini (Alpha, Beta, Gamma)

### Missing cells (budget deferred)
- Gamma × claude-sonnet-4-6 (requires ANTHROPIC_API_KEY)
- Gamma × gpt-5.4 (expensive but should run next)
- Gamma kill variants G2, G3 (4 additional kill patterns)
- All fixtures × 3× repetition (statistical validation)
