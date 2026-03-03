# SYNC Semantic Pipeline Diagnostic Report
Generated: 2026-03-01 16:52:29

## Summary
| Check | Status | Score |
|-------|--------|-------|
| Entity Resolution Quality | PASS | 6/6 |
| Thread Coherence | WARN | 5/6 |
| Activity Classification | WARN | 5/6 |
| Intent Accuracy | PASS | 6/6 |
| Signature Stability | PASS | 6/6 |
| Pipeline Health | WARN | 4/6 |
| Before/After Comparison | FAIL | 5/6 |

Overall: 37/42 metrics passing (88%)

## Check 1: Entity Resolution Quality
| Metric | Value | Status |
|--------|-------|--------|
| Total entities | 260 | PASS |
| Entity type distribution | person(2), project(246), tool(1), topic(11) | PASS |
| Aliases per entity (avg) | 1.00 | PASS |
| Duplicate name check | None | PASS |
| Relationship count | 104093 | PASS |
| Avg confidence | 0.698 | PASS |

## Check 2: Thread Coherence
| Metric | Value | Status |
|--------|-------|--------|
| Total threads | 95 | PASS |
| Active threads | 0 | WARN |
| Avg events per thread | 297.5 | PASS |
| Threads with entities | 95/95 (100.0%) | PASS |
| Avg thread duration (min) | 245.8 | PASS |
| Orphan threads (0 events) | 0 | PASS |

## Check 3: Activity Classification
| Metric | Value | Status |
|--------|-------|--------|
| Total activities | 28266 | PASS |
| Avg confidence | 0.782 | PASS |
| Low confidence (< 0.3) | 0 (0.0%) | PASS |
| Classification methods | rule(28266) | PASS |
| Activity type coverage | 3/6 types | PASS |
| Activities with duration | 0 (0.0%) | WARN |

## Check 4: Intent Accuracy
| Metric | Value | Status |
|--------|-------|--------|
| Total intents | 64 | PASS |
| Intent type coverage | 2/5 types | PASS |
| Avg confidence | 0.828 | PASS |
| Intents linked to threads | 64/64 (100.0%) | PASS |
| Resolved intents | 0 (0.0%) | PASS |
| Recent intents (sample) | SHIP(0.85) → 550x429.jpg; SHIP(0.85) → Screenshot 2026 8.37.59; SHIP(0.75) → screencapture demo syncstore; SHIP(0.85) → IMG_0855.jpg; SHIP(0.85) → Screenshot 2026 1.06.09 | PASS |

## Check 5: Signature Stability
| Metric | Value | Status |
|--------|-------|--------|
| Total signatures | 17 | PASS |
| Categories present | 6/6 | PASS |
| Avg confidence | 0.712 | PASS |
| Trend distribution | stable(17) | PASS |
| Key metrics present | context_switch_rate, deep_work_ratio, meeting_load, peak_hours | PASS |
| Last computed | 0.0h ago | PASS |

## Check 6: Pipeline Health
| Metric | Value | Status |
|--------|-------|--------|
| Semantic cycle enabled | true | PASS |
| Last semantic cycle | 0.8 min ago | PASS |
| Last signature computation | Never (expected on first run) | SKIP |
| Source events (24h) | 1541 | PASS |
| Processing rate (1h) | 28266 activities / 0 events = 0 | SKIP |
| Sync backlog (unsynced rows) | 28126 | PASS |

## Check 7: Before/After Comparison
| Metric | Value | Status |
|--------|-------|--------|
| Raw events (24h) | 1541 | PASS |
| Semantic activities (24h) | 28266 | PASS |
| Conversion rate (activities/events) | 18.343 | PASS |
| Entity extraction rate | 12 entities / 1541 events = 0.008 | FAIL |
| Thread assignment rate | 1541 / 1541 = 1.000 | PASS |
| Enrichment depth (entities/event) | 3.738 | PASS |

