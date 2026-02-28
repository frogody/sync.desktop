# SYNC Semantic Pipeline Diagnostic Report
Generated: 2026-02-28 01:02:55

## Summary
| Check | Status | Score |
|-------|--------|-------|
| Entity Resolution Quality | SKIP | - |
| Thread Coherence | SKIP | - |
| Activity Classification | SKIP | - |
| Intent Accuracy | SKIP | - |
| Signature Stability | SKIP | - |
| Pipeline Health | FAIL | 3/6 |
| Before/After Comparison | FAIL | 1/6 |

Overall: 4/12 metrics passing (33%)

## Check 1: Entity Resolution Quality
| Metric | Value | Status |
|--------|-------|--------|
| Total entities | 0 | FAIL |

## Check 2: Thread Coherence
| Metric | Value | Status |
|--------|-------|--------|
| Total threads | 0 | FAIL |

## Check 3: Activity Classification
| Metric | Value | Status |
|--------|-------|--------|
| Total activities | 0 | FAIL |

## Check 4: Intent Accuracy
| Metric | Value | Status |
|--------|-------|--------|
| Total intents | 0 | FAIL |

## Check 5: Signature Stability
| Metric | Value | Status |
|--------|-------|--------|
| Total signatures | 0 | SKIP |

## Check 6: Pipeline Health
| Metric | Value | Status |
|--------|-------|--------|
| Semantic cycle enabled | true | PASS |
| Last semantic cycle | Never | FAIL |
| Last signature computation | Never (expected on first run) | SKIP |
| Source events (24h) | 22875 | PASS |
| Processing rate (1h) | 0 activities / 0 events = 0 | SKIP |
| Sync backlog (unsynced rows) | 0 | PASS |

## Check 7: Before/After Comparison
| Metric | Value | Status |
|--------|-------|--------|
| Raw events (24h) | 22875 | PASS |
| Semantic activities (24h) | 0 | FAIL |
| Conversion rate (activities/events) | 0.000 | FAIL |
| Entity extraction rate | 0 entities / 22875 events = 0.000 | FAIL |
| Thread assignment rate | 0 / 22875 = 0.000 | FAIL |
| Enrichment depth (entities/event) | 0.000 | FAIL |

