# Database Schema Consistency Audit - Phase 1 (SPOTTER)

**Date:** 2026-03-20
**Scope:** sync.desktop SQLite schema (better-sqlite3)
**Status:** READ-ONLY audit

---

## Finding DB-001: Migration ordering — DROP+CREATE loses columns (hourly_summaries)

- **Table:** hourly_summaries
- **Column/Relationship:** ocr_text, semantic_category, commitments
- **Issue:** Migration `003_add_deep_context_columns` adds three columns (ocr_text, semantic_category, commitments) via ALTER TABLE. Migration `003_update_timestamp_columns` (same prefix, different name) drops and recreates hourly_summaries WITHOUT those three columns. Migration `010_fix_hourly_summaries_columns` re-adds them, but only if it hasn't already been applied. On a fresh install migration order is: 003_add_deep_context_columns, 003_update_timestamp_columns, then 010_fix. The data-migration INSERT in 003_update_timestamp_columns does NOT copy ocr_text, semantic_category, or commitments, so any data in those columns is silently dropped during migration.
- **Direct Impact:** Data loss of deep-context enrichment data on existing databases during migration 003_update_timestamp_columns.
- **Indirect Impact:** Already mitigated by migration 010, but the data loss from the DROP TABLE is permanent for any rows that existed before 010 was applied. Future similar patterns could repeat this bug.
- **Severity:** Medium
- **Status:** MITIGATED (structural — data already lost is not recoverable; migration 010 re-adds columns; no code fix possible for historical data loss)

---

## Finding DB-002: Missing index on completed_actions(matched_commitment_id)

- **Table:** completed_actions
- **Column/Relationship:** matched_commitment_id (FK to commitments.id)
- **Issue:** `matched_commitment_id` is a foreign key column referencing `commitments(id)` but has no index. The `checkForMatchingAction()` method in deepContextManager.ts queries `completed_actions WHERE timestamp > ?` but never joins on this FK. However, any future query to find which actions matched a given commitment will require a full table scan.
- **Direct Impact:** No current query uses this FK for lookups, so performance impact is theoretical.
- **Indirect Impact:** Missing index on a FK column violates best practice. If commitment-to-action resolution logic ever queries by matched_commitment_id, it will be slow.
- **Severity:** Low
- **Status:** RESOLVED (migration 016_add_fk_indexes adds index on completed_actions.matched_commitment_id)

---

## Finding DB-003: Missing index on email_contexts(source_capture_id)

- **Table:** email_contexts
- **Column/Relationship:** source_capture_id (FK to screen_captures.id)
- **Issue:** Foreign key column `source_capture_id` has no index. Similarly, `calendar_contexts.source_capture_id` and `action_items.source_capture_id` and `commitments.source_capture_id` all lack dedicated indexes on their FK columns.
- **Direct Impact:** Queries joining screen_captures to these tables (e.g., cascading deletes or lookups) require full scans.
- **Indirect Impact:** If screen_captures grows large, any cross-reference by capture ID will be slow.
- **Severity:** Low
- **Status:** RESOLVED (migration 016_add_fk_indexes adds indexes on all 4 source_capture_id FK columns)

---

## Finding DB-004: daily_journals.app_breakdown column dropped in migration

- **Table:** daily_journals
- **Column/Relationship:** app_breakdown
- **Issue:** Migration `001_initial_schema` defines `daily_journals` with an `app_breakdown TEXT` column. Migration `003_update_timestamp_columns` drops and recreates `daily_journals` as `daily_journals_new` WITHOUT the `app_breakdown` column, and the INSERT INTO migration does not copy it. The column is permanently lost. Code in `journalService.ts` and `cloudSyncService.ts` never inserts or reads `app_breakdown` from daily_journals, so this is consistent with current code but represents a schema drift from original design.
- **Direct Impact:** None — code no longer uses this column.
- **Indirect Impact:** If any code or query assumes app_breakdown exists on daily_journals (e.g., the web app), it will get NULL.
- **Severity:** Low
- **Status:** ACCEPTED RISK (column intentionally removed — code no longer uses app_breakdown on daily_journals; data is available via hourly_summaries.app_breakdown instead)

---

## Finding DB-005: Orphan table — chat_sessions

- **Table:** chat_sessions
- **Column/Relationship:** entire table
- **Issue:** `chat_sessions` is defined in migration 001 and has query functions `saveChatSession()` and `getChatSession()` in queries.ts. However, a grep across services shows these functions are only imported/called from `ipc/handlers.ts`. The table stores chat messages as JSON. With the SYNC chat going through the web/edge function, this table may be partially or fully orphaned depending on current IPC usage.
- **Direct Impact:** Table consumes space but may not be actively written to.
- **Indirect Impact:** Low — not a data integrity issue.
- **Severity:** Low
- **Status:** ACCEPTED RISK (table has query functions in queries.ts and IPC handlers — kept for future local chat persistence use)

---

## Finding DB-006: local_actions table created via ensureTable() — not in migrations

- **Table:** local_actions
- **Column/Relationship:** entire table
- **Issue:** The `local_actions` table is created dynamically in `actionService.ts` via `ensureTable()` using `CREATE TABLE IF NOT EXISTS`, bypassing the migration system entirely. This means: (1) the migrations table has no record of it, (2) schema changes to local_actions won't be tracked, (3) the table structure is only defined in application code, not in the migration chain.
- **Direct Impact:** The table works because `CREATE TABLE IF NOT EXISTS` is idempotent. But if the schema ever needs to change (add columns, alter types), there is no migration path — ALTER TABLE would need to be handled ad-hoc in ensureTable().
- **Indirect Impact:** Schema divergence between instances. No guarantee all running copies have the same local_actions schema.
- **Severity:** Medium
- **Status:** RESOLVED (migration 014_local_actions_table added to database.ts; CREATE TABLE IF NOT EXISTS ensures compatibility with existing ensureTable() calls)

---

## Finding DB-007: Missing synced column on action_items table

- **Table:** action_items
- **Column/Relationship:** synced (missing)
- **Issue:** The `action_items` table (migration 004) does NOT have a `synced` column. While `commitments` has `synced INTEGER DEFAULT 0` and `screen_captures` got it added in migration 011, `action_items` was never given one. The `cloudSyncService.ts` does not sync action_items to the cloud, but if it ever needs to, there's no sync flag. This is inconsistent with the pattern used by every other table that stores user-generated data.
- **Direct Impact:** Action items cannot be tracked for sync status.
- **Indirect Impact:** If cloud sync of action items is added later, a migration will be needed first.
- **Severity:** Low
- **Status:** RESOLVED (migration 017_add_synced_columns adds synced INTEGER DEFAULT 0 to action_items)

---

## Finding DB-008: Missing synced column on email_contexts and calendar_contexts

- **Table:** email_contexts, calendar_contexts
- **Column/Relationship:** synced (missing)
- **Issue:** Neither `email_contexts` nor `calendar_contexts` has a `synced` column. These tables store contextual data (email compose/read, calendar events) but cannot be selectively synced to the cloud. The `cloudSyncService.ts` does not sync these tables, but the pattern is inconsistent with commitments and screen_captures which do have sync tracking.
- **Direct Impact:** No current sync path for these tables.
- **Indirect Impact:** Pattern inconsistency. Adding sync later requires a migration.
- **Severity:** Low
- **Status:** RESOLVED (migration 017_add_synced_columns adds synced INTEGER DEFAULT 0 to email_contexts and calendar_contexts)

---

## Finding DB-009: cleanupOldData uses wrong comparison for hourly_summaries

- **Table:** hourly_summaries
- **Column/Relationship:** hour_start
- **Issue:** In `cleanupOldData()` (queries.ts line ~478), the cleanup query for hourly_summaries uses `datetime(hour_start) < datetime('now', '-' || ? || ' days')`. But after migration `003_update_timestamp_columns`, `hour_start` is an INTEGER (epoch milliseconds), not a DATETIME string. The `datetime()` SQLite function on a millisecond timestamp will produce incorrect results — it interprets the value as seconds since 2000-01-01, not as a Unix timestamp. This means cleanup may delete records it shouldn't, or fail to delete old ones.
- **Direct Impact:** Hourly summary cleanup is broken — old synced summaries may never be purged, or recent ones may be incorrectly deleted.
- **Indirect Impact:** Database bloat over time if old summaries are never cleaned.
- **Severity:** High
- **Status:** RESOLVED (cleanupOldData now uses epoch-ms cutoff comparison instead of datetime() function)

---

## Finding DB-010: entity_relationships ON CONFLICT DO NOTHING — no unique constraint defined

- **Table:** entity_relationships
- **Column/Relationship:** source_entity_id, target_entity_id, relationship_type
- **Issue:** In `upsertEntityRelationship()` (queries.ts line ~606), the INSERT uses `ON CONFLICT DO NOTHING`, but the table `entity_relationships` has NO unique constraint on (source_entity_id, target_entity_id, relationship_type). Without a unique constraint, `ON CONFLICT DO NOTHING` will never trigger — every INSERT will succeed, creating duplicate rows. The subsequent UPDATE statement (line ~616) then updates ALL matching rows, which somewhat mitigates the issue but leads to duplicate rows accumulating.
- **Direct Impact:** Duplicate entity_relationships rows accumulate in the database. Each co-occurrence of two entities creates a new row instead of incrementing the existing one.
- **Indirect Impact:** Database bloat, incorrect evidence_count (always 1 on each row instead of incrementing), incorrect strength values, and potentially incorrect relationship queries that return multiple rows for the same pair.
- **Severity:** High
- **Status:** RESOLVED (migration 012 deduplicates existing rows and adds UNIQUE index; upsertEntityRelationship rewritten to use proper ON CONFLICT DO UPDATE)

---

## Finding DB-011: event_entity_links.event_id is TEXT but context_events.id is INTEGER

- **Table:** event_entity_links
- **Column/Relationship:** event_id (TEXT) referencing context_events.id (INTEGER)
- **Issue:** The `event_entity_links` table stores `event_id` as TEXT, but `context_events.id` is INTEGER (autoincrement). In `entityRegistry.ts` line ~451, the event_id is created as `String(event.id || event.timestamp)`, converting the integer to a string. This works in SQLite due to its type affinity system, but is a data type mismatch. The `thread_events` table also stores `event_id` as TEXT via the same pattern. Neither has a formal FOREIGN KEY constraint to context_events, so the relationship is purely application-enforced.
- **Direct Impact:** Queries joining event_entity_links to context_events by event_id will work due to SQLite's flexible typing, but the semantic meaning is unclear — some event_ids are stringified integers, others are timestamps.
- **Indirect Impact:** If event_id is sometimes a timestamp (when `event.id` is undefined), there's no referential integrity at all — the "event_id" doesn't point to any real row.
- **Severity:** Medium
- **Status:** ACCEPTED RISK (SQLite type affinity handles TEXT-vs-INTEGER comparisons correctly; event_id values are stringified integers via `String(event.id)` in entityRegistry.ts; adding a formal FK would require rebuilding tables with CASCADE implications — risk does not justify the migration complexity)

---

## Finding DB-012: Missing UNIQUE constraint on entity_intent_map(entity_id, intent_id)

- **Table:** entity_intent_map
- **Column/Relationship:** entity_id + intent_id
- **Issue:** The `entity_intent_map` table has no unique constraint on (entity_id, intent_id). The `linkIntentToEntity()` function in queries.ts does a plain INSERT. If the same entity is linked to the same intent multiple times (e.g., across multiple classification runs), duplicate rows will be created.
- **Direct Impact:** Duplicate entity-intent mappings in the database.
- **Indirect Impact:** Queries counting entity-intent relationships will return inflated counts.
- **Severity:** Low
- **Status:** RESOLVED (migration 018_unique_constraints_dedup deduplicates existing rows and adds UNIQUE index on entity_intent_map(entity_id, intent_id))

---

## Finding DB-013: Missing UNIQUE constraint on intent_sequences(intent_id, activity_id)

- **Table:** intent_sequences
- **Column/Relationship:** intent_id + activity_id
- **Issue:** Similar to DB-012, `intent_sequences` has no unique constraint on (intent_id, activity_id). The `linkIntentToActivity()` function does plain INSERTs wrapped in try/catch, but without a unique constraint the catch will never trigger from duplicates.
- **Direct Impact:** Duplicate intent-activity sequence entries.
- **Indirect Impact:** Incorrect sequence ordering if the same activity appears multiple times in an intent's sequence.
- **Severity:** Low
- **Status:** RESOLVED (migration 018_unique_constraints_dedup deduplicates existing rows and adds UNIQUE index on intent_sequences(intent_id, activity_id))

---

## Finding DB-014: Missing UNIQUE constraint on event_entity_links(event_id, entity_id)

- **Table:** event_entity_links
- **Column/Relationship:** event_id + entity_id
- **Issue:** No unique constraint prevents the same entity from being linked to the same event multiple times. In `entityRegistry.ts`, `linkEventToEntity()` is wrapped in try/catch expecting "duplicate link errors" but there is no constraint to generate such errors.
- **Direct Impact:** Duplicate event-entity links accumulate. The try/catch on line ~463 of entityRegistry.ts will never catch anything.
- **Indirect Impact:** Inflated entity co-occurrence counts, incorrect relationship strength calculations.
- **Severity:** Medium
- **Status:** RESOLVED (migration 013 deduplicates existing rows and adds UNIQUE index on event_entity_links(event_id, entity_id))

---

## Finding DB-015: Nullable inconsistency — commitments.context stored as JSON string but column is TEXT

- **Table:** commitments
- **Column/Relationship:** context
- **Issue:** The `context` column is defined as `TEXT` and stores JSON strings (`JSON.stringify(commitment.context)`). In `deepContextManager.ts`, it is read back with `JSON.parse(row.context)`. This is a TEXT-stored-JSON pattern that works but has no schema-level validation. If a non-JSON value is ever written, the parse will throw. The same pattern applies to `hourly_summaries.app_breakdown`, `daily_journals.highlights`, `daily_journals.focus_areas`, `semantic_entities.metadata`, `semantic_threads.primary_entities`, `semantic_threads.metadata`, `semantic_intents.evidence`, `behavioral_signatures.current_value`, and `screen_captures.analysis`.
- **Direct Impact:** All JSON parsing is wrapped in fallback handling (e.g., `JSON.parse(row.metadata || '{}')`) so crashes are prevented.
- **Indirect Impact:** No schema-level enforcement. This is a known SQLite pattern but worth documenting. Inconsistency: some parse calls have fallbacks, others (like `commitments.context`) don't have explicit fallback in all code paths.
- **Severity:** Low
- **Status:** ACCEPTED RISK (standard SQLite TEXT-as-JSON pattern; SQLite has no native JSON column type; all parse paths have fallback handling or are wrapped in try/catch)

---

## Finding DB-016: Missing created_at on commitments and completed_actions

- **Table:** commitments, completed_actions
- **Column/Relationship:** created_at (missing)
- **Issue:** Both `commitments` and `completed_actions` tables lack a `created_at` column. The `commitments` table uses `detected_at` as the timestamp, and `completed_actions` uses `timestamp`. This is inconsistent with every other table in the schema which has `created_at DATETIME DEFAULT CURRENT_TIMESTAMP`. While functionally equivalent (detected_at/timestamp serve the same purpose), it makes cross-table queries and generic cleanup routines harder.
- **Direct Impact:** None functionally, but inconsistent naming convention.
- **Indirect Impact:** Generic cleanup queries that rely on `created_at` won't work for these tables.
- **Severity:** Low
- **Status:** ACCEPTED RISK (cosmetic naming inconsistency; detected_at and timestamp serve the same purpose; renaming would require DROP+CREATE migrations with data loss risk for zero functional benefit)

---

## Finding DB-017: screen_captures missing NOT NULL on synced column default

- **Table:** screen_captures
- **Column/Relationship:** synced
- **Issue:** Migration 011 adds `synced INTEGER DEFAULT 0` to screen_captures. For rows inserted before migration 011 was applied, the `synced` column will be NULL (not 0). The `cloudSyncService.ts` query `WHERE synced = 0` will NOT match NULL rows (in SQL, NULL != 0). This means pre-migration screen captures will never be synced.
- **Direct Impact:** Any screen_captures inserted before migration 011 cannot be synced to the cloud (they have synced=NULL, and the WHERE clause filters for synced=0).
- **Indirect Impact:** Data loss for early screen captures — they exist locally but will never reach the cloud.
- **Severity:** Medium
- **Status:** RESOLVED (migration 015 sets synced=0 for all NULL rows in screen_captures)

---

## Finding DB-018: storeScreenCapture does not set synced column

- **Table:** screen_captures
- **Column/Relationship:** synced
- **Issue:** In `deepContextManager.ts`, the `storeScreenCapture()` method inserts into screen_captures with columns (timestamp, app_name, window_title, text_content, analysis, image_hash) but does NOT include `synced` in the INSERT. Since the column was added by ALTER TABLE with `DEFAULT 0`, this works — new rows get synced=0. However, the INSERT statement is fragile: if the DEFAULT were ever changed or removed, inserts would silently set synced=NULL.
- **Direct Impact:** Currently works due to DEFAULT. But the intent to set synced=0 on insert is implicit, not explicit.
- **Indirect Impact:** Minor — defensive coding concern.
- **Severity:** Low
- **Status:** ACCEPTED RISK (DEFAULT 0 is set via ALTER TABLE and works correctly for all INSERTs; explicit synced=0 in INSERT would be a code-level change, not a migration fix)

---

## Finding DB-019: Orphan columns — hourly_summaries.ocr_text, semantic_category, commitments read but rarely written

- **Table:** hourly_summaries
- **Column/Relationship:** ocr_text, semantic_category, commitments
- **Issue:** These three columns are written by `summaryService.ts` (via `insertHourlySummary` and `upsertHourlySummary`) only when `deepContextData` is provided. They are read by `getHourlySummaryByRange` and `getUnsyncedHourlySummaries`, and synced to cloud by `cloudSyncService.ts`. However, the deep context data only populates these columns when the screen capture/OCR pipeline is active. If deep context is disabled (which is common — the OCR pipeline depends on screen recording permissions), these columns are always NULL.
- **Direct Impact:** Columns exist and are properly wired in code, but are NULL for most users.
- **Indirect Impact:** Cloud receives null values for these enrichment columns, reducing the value of the synced data.
- **Severity:** Low
- **Status:** ACCEPTED RISK (columns are correctly wired and populated when deep context/OCR pipeline is active; NULL values are expected when screen recording is not enabled — this is by design)

---

## Finding DB-020: Missing index on context_events(privacy_level) used in sync queries

- **Table:** context_events
- **Column/Relationship:** privacy_level
- **Issue:** The `getUnsynced()` method in `contextEventStore.ts` queries `WHERE synced = 0 AND privacy_level = 'sync_allowed'`. While there's an index on `synced`, there's no composite index on (synced, privacy_level). Similarly, the semantic sync queries in queries.ts filter by `synced = 0 AND privacy_level = 'sync_allowed'` on semantic_entities, semantic_activities, semantic_threads, semantic_intents, and behavioral_signatures — all use partial indexes `WHERE synced = 0` but none include privacy_level.
- **Direct Impact:** The partial index on synced=0 narrows the scan significantly, so the privacy_level filter adds minimal overhead. Performance impact is minor.
- **Indirect Impact:** As data grows, composite indexes could help.
- **Severity:** Low
- **Status:** ACCEPTED RISK (partial indexes on synced=0 already narrow scans to unsynced rows only, which is a small subset; adding composite indexes would marginally help but adds write overhead — not worth it at current scale)

---

## Finding DB-021: activity_logs synced column set to 0 on insert but never synced to cloud

- **Table:** activity_logs
- **Column/Relationship:** synced
- **Issue:** `insertActivityLog()` sets `synced` based on `activity.synced ? 1 : 0` (always 0 since ActivityTracker passes `synced: false`). `getUnsyncedActivity()` and `markActivitySynced()` exist in queries.ts and are imported in cloudSyncService.ts. However, `cloudSyncService.sync()` explicitly comments "Note: We don't sync raw activity logs to save bandwidth" and never calls the sync path for activity_logs. The `synced` column and its index `idx_activity_synced` are therefore unused overhead.
- **Direct Impact:** Index `idx_activity_synced` consumes space and slows inserts for no benefit. The `synced` column is always 0.
- **Indirect Impact:** The `getUnsyncedActivity` function exists but is dead code — misleading for future developers.
- **Severity:** Low
- **Status:** ACCEPTED RISK (synced column and index are low overhead; keeping the infrastructure allows enabling activity sync later without a migration; dead code in queries.ts is documented)

---

## Finding DB-022: Missing FOREIGN KEY enforcement — PRAGMA foreign_keys not enabled

- **Table:** All tables with REFERENCES clauses
- **Column/Relationship:** All foreign key relationships
- **Issue:** The database initialization in `database.ts` sets `journal_mode = WAL` but does NOT set `PRAGMA foreign_keys = ON`. By default, SQLite does NOT enforce foreign key constraints. This means all the `REFERENCES` clauses in migrations 004, 006, 007, and 008 are purely documentary — they have no runtime effect. Rows can be inserted with invalid foreign key references, and CASCADE deletes won't trigger.
- **Direct Impact:** Foreign key constraints defined on commitments.source_capture_id, action_items.source_capture_id, completed_actions.matched_commitment_id, entity_aliases.entity_id, entity_relationships.source_entity_id/target_entity_id, event_entity_links.entity_id, thread_events.thread_id, thread_transitions.from_thread_id/to_thread_id, semantic_intents.thread_id, intent_sequences.intent_id/activity_id, and entity_intent_map.entity_id/intent_id — none are enforced.
- **Indirect Impact:** ON DELETE CASCADE clauses on entity_aliases, entity_relationships, event_entity_links, thread_events, thread_transitions, intent_sequences, entity_intent_map — none will fire. Deleting a semantic_entity will leave orphaned aliases, relationships, and links.
- **Severity:** Critical
- **Status:** RESOLVED (PRAGMA foreign_keys = ON added to initDatabase() after connection open, before migrations)

---

## Finding DB-023: Duplicate migration name prefix — two migrations named 003_*

- **Table:** migrations
- **Column/Relationship:** migration ordering
- **Issue:** There are two migrations with prefix `003_`: `003_add_deep_context_columns` and `003_update_timestamp_columns`. While the migration system uses the full name string (not just the number), this naming is confusing and suggests they were created independently without coordination. The ordering depends on their position in the `migrations` array, not alphabetical sorting.
- **Direct Impact:** Both migrations run in array order. As noted in DB-001, the second one (003_update_timestamp_columns) undoes work from the first (003_add_deep_context_columns).
- **Indirect Impact:** Developer confusion about migration ordering.
- **Severity:** Low
- **Status:** ACCEPTED RISK (migration system uses full name strings, not numeric prefixes; both migrations run in correct array order; renaming would break existing databases that have already applied these migrations)

---

## Finding DB-024: Missing index on thread_events(event_id) for getActivitiesForThread JOIN

- **Table:** thread_events, semantic_activities
- **Column/Relationship:** thread_events.event_id joined with semantic_activities.event_id
- **Issue:** The `getActivitiesForThread()` query in queries.ts performs `INNER JOIN thread_events te ON te.event_id = sa.event_id WHERE te.thread_id = ?`. While `thread_events` has indexes on both `thread_id` and `event_id`, the `semantic_activities` table has an index on `event_id` (`idx_activities_event`). This join should be efficient. However, the index on `semantic_activities.event_id` is not a UNIQUE index, and `event_id` in `semantic_activities` is TEXT type while it could be inconsistently typed as noted in DB-011.
- **Direct Impact:** Join performance is acceptable with current indexes.
- **Indirect Impact:** Type mismatch between event_id representations could cause missed joins.
- **Severity:** Low
- **Status:** ACCEPTED RISK (SQLite type affinity handles TEXT-vs-INTEGER joins correctly; existing indexes cover the join columns; same type mismatch documented in DB-011)

---

## Finding DB-025: Orphan table — activity_transitions

- **Table:** activity_transitions
- **Column/Relationship:** entire table
- **Issue:** The `activity_transitions` table is defined in migration 007 and has an `insertActivityTransition()` function in queries.ts. However, searching all service files, this function is never called. The `semanticProcessor.ts` (which orchestrates the semantic pipeline) does not appear to record activity transitions. The table exists in the schema but is never populated.
- **Direct Impact:** Empty table consuming schema space. Indexes `idx_transitions_from` and `idx_transitions_time` are unused.
- **Indirect Impact:** Dead code in queries.ts (`insertActivityTransition`).
- **Severity:** Low
- **Status:** ACCEPTED RISK (table is part of the semantic foundation schema and may be populated by future activity transition tracking; dropping it would require a migration and removes future capability; minimal overhead as empty table)

---

---

# Summary Table

| # | Table | Finding | Severity | Status |
|---|-------|---------|----------|--------|
| DB-001 | hourly_summaries | Migration ordering drops columns, data loss | Medium | MITIGATED |
| DB-002 | completed_actions | Missing index on matched_commitment_id FK | Low | RESOLVED |
| DB-003 | email_contexts, calendar_contexts, action_items, commitments | Missing indexes on source_capture_id FKs | Low | RESOLVED |
| DB-004 | daily_journals | app_breakdown column silently dropped | Low | ACCEPTED RISK |
| DB-005 | chat_sessions | Potentially orphan table | Low | ACCEPTED RISK |
| DB-006 | local_actions | Table created outside migration system | Medium | RESOLVED |
| DB-007 | action_items | Missing synced column | Low | RESOLVED |
| DB-008 | email_contexts, calendar_contexts | Missing synced columns | Low | RESOLVED |
| DB-009 | hourly_summaries | cleanupOldData uses datetime() on integer timestamp | High | RESOLVED |
| DB-010 | entity_relationships | ON CONFLICT DO NOTHING without unique constraint — duplicates | High | RESOLVED |
| DB-011 | event_entity_links, thread_events | event_id TEXT vs context_events.id INTEGER mismatch | Medium | ACCEPTED RISK |
| DB-012 | entity_intent_map | Missing UNIQUE constraint — duplicates | Low | RESOLVED |
| DB-013 | intent_sequences | Missing UNIQUE constraint — duplicates | Low | RESOLVED |
| DB-014 | event_entity_links | Missing UNIQUE constraint — duplicates | Medium | RESOLVED |
| DB-015 | Multiple tables | TEXT columns storing JSON without schema validation | Low | ACCEPTED RISK |
| DB-016 | commitments, completed_actions | Missing created_at column (naming inconsistency) | Low | ACCEPTED RISK |
| DB-017 | screen_captures | Pre-migration rows have synced=NULL, never matched by WHERE synced=0 | Medium | RESOLVED |
| DB-018 | screen_captures | storeScreenCapture INSERT omits synced column | Low | ACCEPTED RISK |
| DB-019 | hourly_summaries | ocr_text, semantic_category, commitments usually NULL | Low | ACCEPTED RISK |
| DB-020 | context_events + semantic tables | Missing composite indexes for sync queries | Low | ACCEPTED RISK |
| DB-021 | activity_logs | synced column and index unused — raw logs never synced | Low | ACCEPTED RISK |
| DB-022 | All FK tables | PRAGMA foreign_keys not enabled — FKs not enforced | Critical | RESOLVED |
| DB-023 | migrations | Duplicate 003_ prefix naming | Low | ACCEPTED RISK |
| DB-024 | thread_events / semantic_activities | event_id type inconsistency in JOIN | Low | ACCEPTED RISK |
| DB-025 | activity_transitions | Orphan table — never populated | Low | ACCEPTED RISK |

## Tables Inspected

| Table | Status | Notes |
|-------|--------|-------|
| migrations | OK | System table, functioning correctly |
| activity_logs | Minor issues | synced column/index unused (DB-021) |
| hourly_summaries | Issues found | DB-001, DB-009, DB-019 |
| daily_journals | Minor issue | DB-004 — app_breakdown dropped |
| chat_sessions | Potentially orphan | DB-005 |
| sync_metadata | OK | Simple key-value, no issues found |
| screen_captures | Issues found | DB-017, DB-018 |
| commitments | Minor issues | DB-003, DB-016 |
| action_items | Minor issues | DB-003, DB-007 |
| completed_actions | Minor issues | DB-002, DB-016 |
| email_contexts | Minor issues | DB-003, DB-008 |
| calendar_contexts | Minor issues | DB-003, DB-008 |
| context_events | Minor issue | DB-020 |
| semantic_entities | OK | Well-indexed, partial index on synced |
| entity_aliases | OK | Proper unique index |
| entity_relationships | Issue found | DB-010 — missing unique constraint |
| event_entity_links | Issue found | DB-011, DB-014 |
| semantic_activities | OK | Properly indexed |
| activity_transitions | Orphan | DB-025 — never populated |
| semantic_threads | OK | Properly indexed |
| thread_events | Minor issue | DB-024 — event_id type |
| thread_transitions | OK | Properly structured |
| semantic_intents | OK | Properly indexed |
| intent_sequences | Minor issue | DB-013 |
| entity_intent_map | Minor issue | DB-012 |
| behavioral_signatures | OK | Unique index present |
| local_actions | Issue found | DB-006 — outside migration system |

## Critical/High Priority Items (fix first)

1. **DB-022 (Critical):** ~~Enable `PRAGMA foreign_keys = ON` in database.ts initialization.~~ **RESOLVED** — PRAGMA added to initDatabase().
2. **DB-010 (High):** ~~Add unique index on entity_relationships.~~ **RESOLVED** — Migration 012 + upsert rewrite.
3. **DB-009 (High):** ~~Fix `cleanupOldData()` to use integer comparison.~~ **RESOLVED** — Now uses epoch-ms cutoff.
