# MemoryCrux Benchmark — Track A Scoring Report

Generated: 2026-03-27T01:13:40.080Z

Runs scored: 14

## Project: GAMMA

### Model: claude-sonnet-4-6

| Arm | Decision Recall | Constraint | Safety | Incident | Cost | Turns | Tools | Cx (Em) |
|---|---|---|---|---|---|---|---|---|
| C0 | 56% (9/16) | - | - | - | $0.8813 | 5 | 0 | 55.69 |
| C2 | 56% (9/16) | - | - | - | $1.8103 | 5 | 0 | 55.69 |
| F1 | 88% (14/16) | - | - | - | $4.0487 | 38 | 221 | 61.94 |
| T2 | 69% (11/16) | - | - | - | $6.6283 | 83 | 233 | 63.4 |

## Cross-Arm Comparison: gamma/claude-sonnet-4-6

| Metric | C0 | C2 | F1 | T2 | Winner |
|---|---|---|---|---|---|
| Input tokens | 191360 | 501030 | 1192700 | 2002708 | C0 |
| Output tokens | 20480 | 20480 | 31372 | 41346 | - |
| Estimated cost | $0.8813 | $1.8103 | $4.0487 | $6.6283 | - |
| Duration | 401.7s | 944.8s | 2344.7s | 4182.8s | - |
| Tool calls | 0 | 0 | 221 | 233 | - |
| Total turns | 5 | 5 | 38 | 83 | - |

**C0 missed keys:** RS256, tiered retention, exactly-once for payments, 99.95% availability, consumer lag alerting, vol-0a1b2c3d4e5f, Building C Floor 3 Room 312
**C2 missed keys:** RS256, exactly-once for payments, 99.95% availability, consumer lag alerting, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry
**F1 missed keys:** RS256, Building C Floor 3 Room 312
**T2 missed keys:** RS256, 99.95% availability, vol-0a1b2c3d4e5f, Building C Floor 3 Room 312, 3-level retry

### Model: gpt-5.4

| Arm | Decision Recall | Constraint | Safety | Incident | Cost | Turns | Tools | Cx (Em) |
|---|---|---|---|---|---|---|---|---|
| C0 | 44% (7/16) | - | - | - | $0.6652 | 5 | 0 | 43.31 |
| C2 | 69% (11/16) | - | - | - | $1.1054 | 5 | 0 | 68.06 |
| F1 | 75% (12/16) | - | - | - | $0.8955 | 23 | 175 | 53.1 |
| T2 | 44% (7/16) | - | - | - | $1.0197 | 54 | 173 | 40.15 |
| T3 | 44% (7/16) | - | - | - | $0.5027 | 39 | 82 | 31.67 |

## Cross-Arm Comparison: gamma/gpt-5.4

| Metric | C0 | C2 | F1 | T2 | T3 | Winner |
|---|---|---|---|---|---|---|
| Input tokens | 162392 | 423787 | 348913 | 522695 | 195626 | C0 |
| Output tokens | 25921 | 24269 | 27317 | 28765 | 21717 | - |
| Estimated cost | $0.6652 | $1.1054 | $0.8955 | $1.0197 | $0.5027 | - |
| Duration | 364.4s | 325.7s | 362.4s | 557.6s | 416.6s | - |
| Tool calls | 0 | 0 | 175 | 173 | 82 | - |
| Total turns | 5 | 5 | 23 | 54 | 39 | - |

**C0 missed keys:** RS256, tiered retention, exactly-once for payments, 99.95% availability, consumer lag alerting, vol-0a1b2c3d4e5f, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry
**C2 missed keys:** RS256, 99.95% availability, consumer lag alerting, Building C Floor 3 Room 312, 3-level retry
**F1 missed keys:** RS256, exactly-once for payments, Building C Floor 3 Room 312, 3-level retry
**T2 missed keys:** RS256, tiered retention, 12 partitions, exactly-once for payments, consumer lag alerting, vol-0a1b2c3d4e5f, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry
**T3 missed keys:** RS256, 48h retention, 12 partitions, exactly-once for payments, consumer lag alerting, vol-0a1b2c3d4e5f, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry

### Model: gpt-5.4-mini

| Arm | Decision Recall | Constraint | Safety | Incident | Cost | Turns | Tools | Cx (Em) |
|---|---|---|---|---|---|---|---|---|
| C0 | 38% (6/16) | - | - | - | $0.0879 | 5 | 0 | 37.13 |
| C2 | 56% (9/16) | - | - | - | $0.1761 | 5 | 0 | 55.69 |
| F1 | 56% (9/16) | - | - | - | $0.0747 | 22 | 121 | 39.85 |
| T2 | 44% (7/16) | - | - | - | $0.0669 | 36 | 59 | 31.47 |
| T3 | 38% (6/16) | - | - | - | $0.0556 | 30 | 39 | 27.01 |

## Cross-Arm Comparison: gamma/gpt-5.4-mini

| Metric | C0 | C2 | F1 | T2 | T3 | Winner |
|---|---|---|---|---|---|---|
| Input tokens | 162392 | 423787 | 158992 | 245389 | 136907 | T3 |
| Output tokens | 14316 | 15895 | 17076 | 12307 | 15402 | - |
| Estimated cost | $0.0879 | $0.1761 | $0.0747 | $0.0669 | $0.0556 | - |
| Duration | 90.9s | 93.2s | 102.0s | 166.3s | 131.7s | - |
| Tool calls | 0 | 0 | 121 | 59 | 39 | - |
| Total turns | 5 | 5 | 22 | 36 | 30 | - |

**C0 missed keys:** RS256, 48h retention, tiered retention, exactly-once for payments, 99.95% availability, consumer lag alerting, vol-0a1b2c3d4e5f, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry
**C2 missed keys:** RS256, 48h retention, 12 partitions, 99.95% availability, consumer lag alerting, Building C Floor 3 Room 312, 3-level retry
**F1 missed keys:** RS256, tiered retention, 12 partitions, exactly-once for payments, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry
**T2 missed keys:** RS256, 48h retention, tiered retention, exactly-once for payments, 99.95% availability, vol-0a1b2c3d4e5f, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry
**T3 missed keys:** RS256, 48h retention, 12 partitions, CooperativeStickyAssignor, 99.95% availability, consumer lag alerting, vol-0a1b2c3d4e5f, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry

---

# Kill Variant Results

Kill variant runs scored: 16

## Model: gpt-5.4

| Variant | Arm | Decision Recall | Constraint | Cost | Turns | Tools | Cx (Em) |
|---|---|---|---|---|---|---|---|
| G1 | C0 | 50% (8/16) | - | $0.4486 | 5 | 0 | 49.5 |
| G1 | C2 | 69% (11/16) | - | $0.7757 | 5 | 0 | 68.06 |
| G1 | F1 | 69% (11/16) | - | $0.8481 | 20 | 159 | 48.66 |
| G1 | T2 | 31% (5/16) | - | $0.8068 | 48 | 169 | 28.73 |
| G4 | C0 | 50% (8/16) | - | $0.4487 | 5 | 0 | 49.5 |
| G4 | C2 | 63% (10/16) | - | $0.7663 | 5 | 0 | 61.88 |
| G4 | F1 | 81% (13/16) | - | $0.8170 | 20 | 161 | 57.48 |
| G4 | T2 | 50% (8/16) | - | $1.0763 | 56 | 194 | 41.76 |

**G1/C0 missed keys:** RS256, exactly-once for payments, 99.95% availability, consumer lag alerting, vol-0a1b2c3d4e5f, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry
**G1/C2 missed keys:** RS256, 99.95% availability, consumer lag alerting, Building C Floor 3 Room 312, 3-level retry
**G1/F1 missed keys:** RS256, 12 partitions, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry
**G1/T2 missed keys:** RS256, 48h retention, 12 partitions, CooperativeStickyAssignor, exactly-once for payments, 99.95% availability, consumer lag alerting, vol-0a1b2c3d4e5f, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry
**G4/C0 missed keys:** RS256, exactly-once for payments, 99.95% availability, consumer lag alerting, vol-0a1b2c3d4e5f, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry
**G4/C2 missed keys:** RS256, 48h retention, 99.95% availability, consumer lag alerting, Building C Floor 3 Room 312, 3-level retry
**G4/F1 missed keys:** RS256, Building C Floor 3 Room 312, 3-level retry
**G4/T2 missed keys:** RS256, CooperativeStickyAssignor, exactly-once for payments, consumer lag alerting, vol-0a1b2c3d4e5f, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry

## Model: gpt-5.4-mini

| Variant | Arm | Decision Recall | Constraint | Cost | Turns | Tools | Cx (Em) |
|---|---|---|---|---|---|---|---|
| G1 | C0 | 50% (8/16) | - | $0.0609 | 5 | 0 | 49.5 |
| G1 | C2 | 69% (11/16) | - | $0.1575 | 5 | 0 | 68.06 |
| G1 | F1 | 56% (9/16) | - | $0.1028 | 23 | 123 | 39.9 |
| G1 | T2 | 31% (5/16) | - | $0.0730 | 40 | 50 | 22.67 |
| G4 | C0 | 38% (6/16) | - | $0.0405 | 5 | 0 | 37.13 |
| G4 | C2 | 63% (10/16) | - | $0.0845 | 5 | 0 | 61.88 |
| G4 | F1 | 56% (9/16) | - | $0.0886 | 25 | 108 | 39.88 |
| G4 | T2 | 25% (4/16) | - | $0.0582 | 31 | 49 | 18.21 |

**G1/C0 missed keys:** RS256, tiered retention, 12 partitions, at-least-once, 99.95% availability, vol-0a1b2c3d4e5f, Building C Floor 3 Room 312, 3-level retry
**G1/C2 missed keys:** RS256, 99.95% availability, consumer lag alerting, Building C Floor 3 Room 312, 3-level retry
**G1/F1 missed keys:** RS256, 48h retention, exactly-once for payments, vol-0a1b2c3d4e5f, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry
**G1/T2 missed keys:** RS256, 48h retention, 12 partitions, CooperativeStickyAssignor, exactly-once for payments, 99.95% availability, consumer lag alerting, vol-0a1b2c3d4e5f, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry
**G4/C0 missed keys:** RS256, 48h retention, tiered retention, 12 partitions, exactly-once for payments, 99.95% availability, consumer lag alerting, vol-0a1b2c3d4e5f, Building C Floor 3 Room 312, 3-level retry
**G4/C2 missed keys:** RS256, exactly-once for payments, 99.95% availability, consumer lag alerting, Building C Floor 3 Room 312, 3-level retry
**G4/F1 missed keys:** RS256, 48h retention, 12 partitions, vol-0a1b2c3d4e5f, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry
**G4/T2 missed keys:** RS256, 48h retention, tiered retention, 12 partitions, CooperativeStickyAssignor, exactly-once for payments, 99.95% availability, consumer lag alerting, vol-0a1b2c3d4e5f, kafka-broker-tls, Building C Floor 3 Room 312, 3-level retry
