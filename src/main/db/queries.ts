/**
 * Database Queries
 *
 * All database operations for activity tracking and journaling.
 */

import { getDatabase } from './database';
import { ActivityLog, HourlySummary, DailyJournal } from '../../shared/types';
import type {
  Entity,
  EntityAlias,
  EntityRelationship,
  EventEntityLink,
  SemanticActivity,
  ActivityTransition,
  SemanticThread,
  ThreadEvent,
  ThreadTransition,
  SemanticIntent,
  IntentSequence,
  EntityIntentMap,
  BehavioralSignature,
  ActivityDistribution,
} from '../services/semantic/types';

// ============================================================================
// Activity Logs
// ============================================================================

export function insertActivityLog(
  activity: Omit<ActivityLog, 'id' | 'createdAt'>
): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO activity_logs (timestamp, app_name, window_title, url, bundle_id, duration_seconds, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    activity.timestamp,
    activity.appName,
    activity.windowTitle,
    activity.url || null,
    activity.bundleId || null,
    activity.durationSeconds || 0,
    activity.synced ? 1 : 0
  );

  return result.lastInsertRowid as number;
}

export function updateActivityDuration(id: number, durationSeconds: number): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE activity_logs SET duration_seconds = ? WHERE id = ?
  `);

  stmt.run(durationSeconds, id);
}

export function getRecentActivity(minutes: number = 10): ActivityLog[] {
  const db = getDatabase();

  const cutoff = Date.now() - minutes * 60 * 1000;

  const stmt = db.prepare(`
    SELECT id, timestamp, app_name as appName, window_title as windowTitle,
           url, bundle_id as bundleId, duration_seconds as durationSeconds,
           synced, created_at as createdAt
    FROM activity_logs
    WHERE timestamp > ?
    ORDER BY timestamp DESC
  `);

  const rows = stmt.all(cutoff) as any[];

  return rows.map((row) => ({
    ...row,
    synced: row.synced === 1,
  }));
}

export function getUnsyncedActivity(limit: number = 100): ActivityLog[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, timestamp, app_name as appName, window_title as windowTitle,
           url, bundle_id as bundleId, duration_seconds as durationSeconds,
           synced, created_at as createdAt
    FROM activity_logs
    WHERE synced = 0
    ORDER BY timestamp ASC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as any[];

  return rows.map((row) => ({
    ...row,
    synced: false,
  }));
}

export function markActivitySynced(ids: number[]): void {
  if (ids.length === 0) return;

  const db = getDatabase();

  const placeholders = ids.map(() => '?').join(',');
  const stmt = db.prepare(`
    UPDATE activity_logs SET synced = 1 WHERE id IN (${placeholders})
  `);

  stmt.run(...ids);
}

export function getActivityByDateRange(
  startDate: Date,
  endDate: Date
): ActivityLog[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, timestamp, app_name as appName, window_title as windowTitle,
           url, bundle_id as bundleId, duration_seconds as durationSeconds,
           synced, created_at as createdAt
    FROM activity_logs
    WHERE timestamp >= ? AND timestamp < ?
    ORDER BY timestamp ASC
  `);

  const rows = stmt.all(startDate.getTime(), endDate.getTime()) as any[];

  return rows.map((row) => ({
    ...row,
    synced: row.synced === 1,
  }));
}

// ============================================================================
// Hourly Summaries
// ============================================================================

export function insertHourlySummary(
  summary: Omit<HourlySummary, 'id'>
): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO hourly_summaries (hour_start, app_breakdown, total_minutes, focus_score, ocr_text, semantic_category, commitments, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    summary.hourStart,
    JSON.stringify(summary.appBreakdown),
    summary.totalMinutes,
    summary.focusScore,
    summary.ocrText || null,
    summary.semanticCategory || null,
    summary.commitments || null,
    summary.synced ? 1 : 0
  );

  return result.lastInsertRowid as number;
}

export function upsertHourlySummary(summary: Omit<HourlySummary, 'id'>): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO hourly_summaries (hour_start, app_breakdown, total_minutes, focus_score, ocr_text, semantic_category, commitments, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(hour_start) DO UPDATE SET
      app_breakdown = excluded.app_breakdown,
      total_minutes = excluded.total_minutes,
      focus_score = excluded.focus_score,
      ocr_text = COALESCE(excluded.ocr_text, ocr_text),
      semantic_category = COALESCE(excluded.semantic_category, semantic_category),
      commitments = COALESCE(excluded.commitments, commitments),
      synced = 0
  `);

  stmt.run(
    summary.hourStart,
    JSON.stringify(summary.appBreakdown),
    summary.totalMinutes,
    summary.focusScore,
    summary.ocrText || null,
    summary.semanticCategory || null,
    summary.commitments || null,
    summary.synced ? 1 : 0
  );
}

export function getHourlySummaryByRange(
  startDate: Date,
  endDate: Date
): HourlySummary[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, hour_start as hourStart, app_breakdown as appBreakdown,
           total_minutes as totalMinutes, focus_score as focusScore,
           ocr_text as ocrText, semantic_category as semanticCategory,
           commitments, synced
    FROM hourly_summaries
    WHERE hour_start >= ? AND hour_start < ?
    ORDER BY hour_start ASC
  `);

  const rows = stmt.all(startDate.getTime(), endDate.getTime()) as any[];

  return rows.map((row) => ({
    ...row,
    appBreakdown: JSON.parse(row.appBreakdown || '[]'),
    synced: row.synced === 1,
  }));
}

export function getUnsyncedHourlySummaries(limit: number = 50): HourlySummary[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, hour_start as hourStart, app_breakdown as appBreakdown,
           total_minutes as totalMinutes, focus_score as focusScore,
           ocr_text as ocrText, semantic_category as semanticCategory,
           commitments, synced
    FROM hourly_summaries
    WHERE synced = 0
    ORDER BY hour_start ASC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as any[];

  return rows.map((row) => ({
    ...row,
    appBreakdown: JSON.parse(row.appBreakdown || '[]'),
    synced: false,
  }));
}

export function getUnsyncedSummaries(limit: number = 50): HourlySummary[] {
  return getUnsyncedHourlySummaries(limit);
}

export function markHourlySummaryAsSynced(id: number): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE hourly_summaries SET synced = 1 WHERE id = ?
  `);

  stmt.run(id);
}

export function markSummariesSynced(ids: number[]): void {
  if (ids.length === 0) return;

  const db = getDatabase();

  const placeholders = ids.map(() => '?').join(',');
  const stmt = db.prepare(`
    UPDATE hourly_summaries SET synced = 1 WHERE id IN (${placeholders})
  `);

  stmt.run(...ids);
}

// ============================================================================
// Daily Journals
// ============================================================================

export function insertDailyJournal(
  journal: Omit<DailyJournal, 'id'>
): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO daily_journals (journal_date, overview, highlights, focus_areas, synced)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    journal.journalDate,
    journal.overview,
    JSON.stringify(journal.highlights),
    JSON.stringify(journal.focusAreas),
    journal.synced ? 1 : 0
  );

  return result.lastInsertRowid as number;
}

export function upsertDailyJournal(journal: Omit<DailyJournal, 'id'>): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO daily_journals (journal_date, overview, highlights, focus_areas, synced)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(journal_date) DO UPDATE SET
      overview = excluded.overview,
      highlights = excluded.highlights,
      focus_areas = excluded.focus_areas,
      synced = 0
  `);

  stmt.run(
    journal.journalDate,
    journal.overview,
    JSON.stringify(journal.highlights),
    JSON.stringify(journal.focusAreas),
    journal.synced ? 1 : 0
  );
}

export function getDailyJournalByDate(date: Date): DailyJournal | null {
  const db = getDatabase();

  // Get start and end of day
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const stmt = db.prepare(`
    SELECT id, journal_date as journalDate, overview, highlights, focus_areas as focusAreas, synced
    FROM daily_journals
    WHERE journal_date >= ? AND journal_date < ?
  `);

  const row = stmt.get(dayStart.getTime(), dayEnd.getTime()) as any;

  if (!row) return null;

  return {
    ...row,
    highlights: JSON.parse(row.highlights || '[]'),
    focusAreas: JSON.parse(row.focusAreas || '[]'),
    synced: row.synced === 1,
  };
}

export function getTodayJournal(): DailyJournal | null {
  return getDailyJournalByDate(new Date());
}

export function getUnsyncedDailyJournals(limit: number = 50): DailyJournal[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, journal_date as journalDate, overview, highlights, focus_areas as focusAreas, synced
    FROM daily_journals
    WHERE synced = 0
    ORDER BY journal_date ASC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as any[];

  return rows.map((row) => ({
    ...row,
    highlights: JSON.parse(row.highlights || '[]'),
    focusAreas: JSON.parse(row.focusAreas || '[]'),
    synced: false,
  }));
}

export function markDailyJournalAsSynced(id: number): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE daily_journals SET synced = 1 WHERE id = ?
  `);

  stmt.run(id);
}

export function getJournalHistory(days: number = 30): DailyJournal[] {
  const db = getDatabase();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const stmt = db.prepare(`
    SELECT id, journal_date as journalDate, overview, highlights, focus_areas as focusAreas, synced
    FROM daily_journals
    WHERE journal_date >= ?
    ORDER BY journal_date DESC
  `);

  const rows = stmt.all(cutoff.getTime()) as any[];

  return rows.map((row) => ({
    ...row,
    highlights: JSON.parse(row.highlights || '[]'),
    focusAreas: JSON.parse(row.focusAreas || '[]'),
    synced: row.synced === 1,
  }));
}

// ============================================================================
// Sync Metadata
// ============================================================================

export function getSyncMetadata(key: string): string | null {
  const db = getDatabase();

  const stmt = db.prepare('SELECT value FROM sync_metadata WHERE key = ?');
  const row = stmt.get(key) as { value: string | null } | undefined;

  return row?.value || null;
}

export function setSyncMetadata(key: string, value: string): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO sync_metadata (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run(key, value);
}

// ============================================================================
// Chat Sessions
// ============================================================================

export function saveChatSession(sessionId: string, messages: any[]): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO chat_sessions (id, messages, last_activity)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      messages = excluded.messages,
      last_activity = CURRENT_TIMESTAMP
  `);

  stmt.run(sessionId, JSON.stringify(messages));
}

export function getChatSession(sessionId: string): any[] | null {
  const db = getDatabase();

  const stmt = db.prepare('SELECT messages FROM chat_sessions WHERE id = ?');
  const row = stmt.get(sessionId) as { messages: string } | undefined;

  if (!row) return null;

  return JSON.parse(row.messages);
}

// ============================================================================
// Cleanup
// ============================================================================

export function cleanupOldData(retentionDays: number = 30): void {
  const db = getDatabase();

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  // Delete old activity logs that have been synced
  db.prepare(`
    DELETE FROM activity_logs
    WHERE timestamp < ? AND synced = 1
  `).run(cutoff);

  // Delete old hourly summaries that have been synced
  // hour_start is stored as epoch milliseconds (INTEGER), so compare with epoch-ms cutoff
  db.prepare(`
    DELETE FROM hourly_summaries
    WHERE hour_start < ? AND synced = 1
  `).run(cutoff);

  // Data retention cleanup for large tables with specific retention periods
  const DAY_MS = 24 * 60 * 60 * 1000;

  // context_events: 90-day retention
  const contextEventsCutoff = Date.now() - 90 * DAY_MS;
  const contextEventsDeleted = db.prepare(`
    DELETE FROM context_events WHERE timestamp < ?
  `).run(contextEventsCutoff);

  // screen_captures: 90-day retention
  const screenCapturesCutoff = Date.now() - 90 * DAY_MS;
  const screenCapturesDeleted = db.prepare(`
    DELETE FROM screen_captures WHERE timestamp < ?
  `).run(screenCapturesCutoff);

  // activity_logs: 180-day hard retention (regardless of sync status)
  const activityLogsCutoff = Date.now() - 180 * DAY_MS;
  const activityLogsDeleted = db.prepare(`
    DELETE FROM activity_logs WHERE timestamp < ?
  `).run(activityLogsCutoff);

  console.log('[db] Cleaned up data older than', retentionDays, 'days');
  console.log('[db] Retention cleanup — context_events:', contextEventsDeleted.changes,
    'screen_captures:', screenCapturesDeleted.changes,
    'activity_logs (180d):', activityLogsDeleted.changes);
}

// ============================================================================
// Semantic Entities
// ============================================================================

export function insertEntity(entity: Omit<Entity, 'id'>): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO semantic_entities (entity_id, name, type, confidence, first_seen, last_seen,
      occurrence_count, metadata, privacy_level, synced, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    entity.entityId, entity.name, entity.type, entity.confidence,
    entity.firstSeen, entity.lastSeen, entity.occurrenceCount,
    JSON.stringify(entity.metadata), entity.privacyLevel,
    entity.synced ? 1 : 0, entity.createdAt, entity.updatedAt
  );
  return result.lastInsertRowid as number;
}

export function updateEntity(entityId: string, updates: Partial<Pick<Entity, 'name' | 'confidence' | 'lastSeen' | 'occurrenceCount' | 'metadata'>>): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
  if (updates.confidence !== undefined) { sets.push('confidence = ?'); values.push(updates.confidence); }
  if (updates.lastSeen !== undefined) { sets.push('last_seen = ?'); values.push(updates.lastSeen); }
  if (updates.occurrenceCount !== undefined) { sets.push('occurrence_count = ?'); values.push(updates.occurrenceCount); }
  if (updates.metadata !== undefined) { sets.push('metadata = ?'); values.push(JSON.stringify(updates.metadata)); }

  if (sets.length === 0) return;
  sets.push('updated_at = ?'); values.push(Date.now());
  sets.push('synced = 0');
  values.push(entityId);

  db.prepare(`UPDATE semantic_entities SET ${sets.join(', ')} WHERE entity_id = ?`).run(...values);
}

export function getEntityById(entityId: string): Entity | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT id, entity_id as entityId, name, type, confidence, first_seen as firstSeen,
      last_seen as lastSeen, occurrence_count as occurrenceCount, metadata,
      privacy_level as privacyLevel, synced, created_at as createdAt, updated_at as updatedAt
    FROM semantic_entities WHERE entity_id = ?
  `).get(entityId) as any;

  if (!row) return null;
  return { ...row, metadata: JSON.parse(row.metadata || '{}'), synced: row.synced === 1 };
}

export function findEntityByName(name: string, type?: string): Entity[] {
  const db = getDatabase();
  const sql = type
    ? `SELECT id, entity_id as entityId, name, type, confidence, first_seen as firstSeen,
        last_seen as lastSeen, occurrence_count as occurrenceCount, metadata,
        privacy_level as privacyLevel, synced, created_at as createdAt, updated_at as updatedAt
       FROM semantic_entities WHERE name = ? COLLATE NOCASE AND type = ?`
    : `SELECT id, entity_id as entityId, name, type, confidence, first_seen as firstSeen,
        last_seen as lastSeen, occurrence_count as occurrenceCount, metadata,
        privacy_level as privacyLevel, synced, created_at as createdAt, updated_at as updatedAt
       FROM semantic_entities WHERE name = ? COLLATE NOCASE`;

  const params = type ? [name, type] : [name];
  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(row => ({ ...row, metadata: JSON.parse(row.metadata || '{}'), synced: row.synced === 1 }));
}

export function findEntityByAlias(alias: string): Entity | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT e.id, e.entity_id as entityId, e.name, e.type, e.confidence,
      e.first_seen as firstSeen, e.last_seen as lastSeen,
      e.occurrence_count as occurrenceCount, e.metadata,
      e.privacy_level as privacyLevel, e.synced, e.created_at as createdAt, e.updated_at as updatedAt
    FROM semantic_entities e
    JOIN entity_aliases a ON e.entity_id = a.entity_id
    WHERE a.alias = ? COLLATE NOCASE
    ORDER BY a.frequency DESC
    LIMIT 1
  `).get(alias) as any;

  if (!row) return null;
  return { ...row, metadata: JSON.parse(row.metadata || '{}'), synced: row.synced === 1 };
}

export function getRecentEntities(limit: number = 50): Entity[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, entity_id as entityId, name, type, confidence, first_seen as firstSeen,
      last_seen as lastSeen, occurrence_count as occurrenceCount, metadata,
      privacy_level as privacyLevel, synced, created_at as createdAt, updated_at as updatedAt
    FROM semantic_entities
    ORDER BY last_seen DESC
    LIMIT ?
  `).all(limit) as any[];
  return rows.map(row => ({ ...row, metadata: JSON.parse(row.metadata || '{}'), synced: row.synced === 1 }));
}

export function upsertEntityAlias(alias: Omit<EntityAlias, 'id'>): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO entity_aliases (entity_id, alias, source, frequency, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(entity_id, alias, source) DO UPDATE SET frequency = frequency + 1
  `).run(alias.entityId, alias.alias, alias.source, alias.frequency, alias.createdAt);
}

export function getEntityAliases(entityId: string): EntityAlias[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT id, entity_id as entityId, alias, source, frequency, created_at as createdAt
    FROM entity_aliases WHERE entity_id = ? ORDER BY frequency DESC
  `).all(entityId) as EntityAlias[];
}

export function upsertEntityRelationship(rel: Omit<EntityRelationship, 'id'>): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO entity_relationships (source_entity_id, target_entity_id, relationship_type,
      strength, evidence_count, last_evidence, synced, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_entity_id, target_entity_id, relationship_type)
    DO UPDATE SET
      strength = excluded.strength,
      evidence_count = evidence_count + 1,
      last_evidence = excluded.last_evidence,
      updated_at = ?,
      synced = 0
  `).run(
    rel.sourceEntityId, rel.targetEntityId, rel.relationshipType,
    rel.strength, rel.evidenceCount, rel.lastEvidence,
    rel.synced ? 1 : 0, rel.createdAt, rel.updatedAt,
    Date.now()
  );
}

export function getEntityRelationships(entityId: string): EntityRelationship[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT id, source_entity_id as sourceEntityId, target_entity_id as targetEntityId,
      relationship_type as relationshipType, strength, evidence_count as evidenceCount,
      last_evidence as lastEvidence, synced, created_at as createdAt, updated_at as updatedAt
    FROM entity_relationships
    WHERE source_entity_id = ? OR target_entity_id = ?
    ORDER BY strength DESC
  `).all(entityId, entityId) as any[];
}

export function linkEventToEntity(link: Omit<EventEntityLink, 'id'>): number {
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO event_entity_links (event_id, entity_id, role, extraction_method, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(link.eventId, link.entityId, link.role, link.extractionMethod, link.confidence, link.createdAt);
  return result.lastInsertRowid as number;
}

// ============================================================================
// Semantic Activities
// ============================================================================

export function insertSemanticActivity(activity: Omit<SemanticActivity, 'id'>): number {
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO semantic_activities (activity_id, event_id, activity_type, activity_subtype,
      confidence, classification_method, duration_ms, metadata, privacy_level, synced, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    activity.activityId, activity.eventId, activity.activityType, activity.activitySubtype,
    activity.confidence, activity.classificationMethod, activity.durationMs,
    JSON.stringify(activity.metadata), activity.privacyLevel, activity.synced ? 1 : 0, activity.createdAt
  );
  return result.lastInsertRowid as number;
}

export function getActivitiesByType(activityType: string, limit: number = 100): SemanticActivity[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, activity_id as activityId, event_id as eventId, activity_type as activityType,
      activity_subtype as activitySubtype, confidence, classification_method as classificationMethod,
      duration_ms as durationMs, metadata, privacy_level as privacyLevel, synced, created_at as createdAt
    FROM semantic_activities WHERE activity_type = ? ORDER BY created_at DESC LIMIT ?
  `).all(activityType, limit) as any[];
  return rows.map(row => ({ ...row, metadata: JSON.parse(row.metadata || '{}'), synced: row.synced === 1 }));
}

export function getActivitiesByTimeRange(startTime: number, endTime: number): SemanticActivity[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, activity_id as activityId, event_id as eventId, activity_type as activityType,
      activity_subtype as activitySubtype, confidence, classification_method as classificationMethod,
      duration_ms as durationMs, metadata, privacy_level as privacyLevel, synced, created_at as createdAt
    FROM semantic_activities WHERE created_at >= ? AND created_at < ? ORDER BY created_at ASC
  `).all(startTime, endTime) as any[];
  return rows.map(row => ({ ...row, metadata: JSON.parse(row.metadata || '{}'), synced: row.synced === 1 }));
}

export function insertActivityTransition(transition: Omit<ActivityTransition, 'id'>): number {
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO activity_transitions (from_activity_id, to_activity_id, transition_time, gap_ms, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(transition.fromActivityId, transition.toActivityId, transition.transitionTime, transition.gapMs, transition.createdAt);
  return result.lastInsertRowid as number;
}

export function getActivityDistribution(days: number = 30): ActivityDistribution[] {
  const db = getDatabase();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = db.prepare(`
    SELECT activity_type as type, COUNT(*) as count,
      COALESCE(SUM(duration_ms), 0) as totalDurationMs
    FROM semantic_activities
    WHERE created_at >= ?
    GROUP BY activity_type
    ORDER BY count DESC
  `).all(cutoff) as any[];

  const total = rows.reduce((sum: number, r: any) => sum + r.count, 0);
  return rows.map(row => ({
    ...row,
    percentage: total > 0 ? (row.count / total) * 100 : 0,
  }));
}

// ============================================================================
// Semantic Threads
// ============================================================================

export function insertThread(thread: Omit<SemanticThread, 'id'>): number {
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO semantic_threads (thread_id, title, status, started_at, last_activity_at,
      event_count, primary_entities, primary_activity_type, metadata, privacy_level, synced, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    thread.threadId, thread.title, thread.status, thread.startedAt, thread.lastActivityAt,
    thread.eventCount, JSON.stringify(thread.primaryEntities), thread.primaryActivityType,
    JSON.stringify(thread.metadata), thread.privacyLevel, thread.synced ? 1 : 0, thread.createdAt, thread.updatedAt
  );
  return result.lastInsertRowid as number;
}

export function updateThread(threadId: string, updates: Partial<Pick<SemanticThread, 'title' | 'status' | 'lastActivityAt' | 'eventCount' | 'primaryEntities' | 'primaryActivityType'>>): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) { sets.push('title = ?'); values.push(updates.title); }
  if (updates.status !== undefined) { sets.push('status = ?'); values.push(updates.status); }
  if (updates.lastActivityAt !== undefined) { sets.push('last_activity_at = ?'); values.push(updates.lastActivityAt); }
  if (updates.eventCount !== undefined) { sets.push('event_count = ?'); values.push(updates.eventCount); }
  if (updates.primaryEntities !== undefined) { sets.push('primary_entities = ?'); values.push(JSON.stringify(updates.primaryEntities)); }
  if (updates.primaryActivityType !== undefined) { sets.push('primary_activity_type = ?'); values.push(updates.primaryActivityType); }

  if (sets.length === 0) return;
  sets.push('updated_at = ?'); values.push(Date.now());
  sets.push('synced = 0');
  values.push(threadId);

  db.prepare(`UPDATE semantic_threads SET ${sets.join(', ')} WHERE thread_id = ?`).run(...values);
}

export function getThreadById(threadId: string): SemanticThread | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT id, thread_id as threadId, title, status, started_at as startedAt,
      last_activity_at as lastActivityAt, event_count as eventCount,
      primary_entities as primaryEntities, primary_activity_type as primaryActivityType,
      metadata, privacy_level as privacyLevel, synced, created_at as createdAt, updated_at as updatedAt
    FROM semantic_threads WHERE thread_id = ?
  `).get(threadId) as any;

  if (!row) return null;
  return {
    ...row,
    primaryEntities: JSON.parse(row.primaryEntities || '[]'),
    metadata: JSON.parse(row.metadata || '{}'),
    synced: row.synced === 1,
  };
}

export function getActiveThreads(): SemanticThread[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, thread_id as threadId, title, status, started_at as startedAt,
      last_activity_at as lastActivityAt, event_count as eventCount,
      primary_entities as primaryEntities, primary_activity_type as primaryActivityType,
      metadata, privacy_level as privacyLevel, synced, created_at as createdAt, updated_at as updatedAt
    FROM semantic_threads WHERE status = 'active'
    ORDER BY last_activity_at DESC
  `).all() as any[];

  return rows.map(row => ({
    ...row,
    primaryEntities: JSON.parse(row.primaryEntities || '[]'),
    metadata: JSON.parse(row.metadata || '{}'),
    synced: row.synced === 1,
  }));
}

export function addEventToThread(threadEvent: Omit<ThreadEvent, 'id'>): number {
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO thread_events (thread_id, event_id, relevance_score, added_at)
    VALUES (?, ?, ?, ?)
  `).run(threadEvent.threadId, threadEvent.eventId, threadEvent.relevanceScore, threadEvent.addedAt);
  return result.lastInsertRowid as number;
}

export function getThreadEvents(threadId: string, limit: number = 100): ThreadEvent[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT id, thread_id as threadId, event_id as eventId, relevance_score as relevanceScore, added_at as addedAt
    FROM thread_events WHERE thread_id = ? ORDER BY added_at DESC LIMIT ?
  `).all(threadId, limit) as ThreadEvent[];
}

export function insertThreadTransition(transition: Omit<ThreadTransition, 'id'>): number {
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO thread_transitions (from_thread_id, to_thread_id, transition_type, timestamp, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(transition.fromThreadId, transition.toThreadId, transition.transitionType, transition.timestamp, transition.createdAt);
  return result.lastInsertRowid as number;
}

// ============================================================================
// Semantic Intents
// ============================================================================

export function insertIntent(intent: Omit<SemanticIntent, 'id'>): number {
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO semantic_intents (intent_id, thread_id, intent_type, intent_subtype, confidence,
      classification_method, evidence, resolved_at, outcome, privacy_level, synced, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    intent.intentId, intent.threadId, intent.intentType, intent.intentSubtype,
    intent.confidence, intent.classificationMethod, JSON.stringify(intent.evidence),
    intent.resolvedAt, intent.outcome, intent.privacyLevel, intent.synced ? 1 : 0,
    intent.createdAt, intent.updatedAt
  );
  return result.lastInsertRowid as number;
}

export function updateIntent(intentId: string, updates: Partial<Pick<SemanticIntent, 'intentType' | 'intentSubtype' | 'confidence' | 'resolvedAt' | 'outcome'>>): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.intentType !== undefined) { sets.push('intent_type = ?'); values.push(updates.intentType); }
  if (updates.intentSubtype !== undefined) { sets.push('intent_subtype = ?'); values.push(updates.intentSubtype); }
  if (updates.confidence !== undefined) { sets.push('confidence = ?'); values.push(updates.confidence); }
  if (updates.resolvedAt !== undefined) { sets.push('resolved_at = ?'); values.push(updates.resolvedAt); }
  if (updates.outcome !== undefined) { sets.push('outcome = ?'); values.push(updates.outcome); }

  if (sets.length === 0) return;
  sets.push('updated_at = ?'); values.push(Date.now());
  sets.push('synced = 0');
  values.push(intentId);

  db.prepare(`UPDATE semantic_intents SET ${sets.join(', ')} WHERE intent_id = ?`).run(...values);
}

export function getActiveIntents(): SemanticIntent[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, intent_id as intentId, thread_id as threadId, intent_type as intentType,
      intent_subtype as intentSubtype, confidence, classification_method as classificationMethod,
      evidence, resolved_at as resolvedAt, outcome, privacy_level as privacyLevel,
      synced, created_at as createdAt, updated_at as updatedAt
    FROM semantic_intents WHERE resolved_at IS NULL
    ORDER BY created_at DESC
  `).all() as any[];
  return rows.map(row => ({ ...row, evidence: JSON.parse(row.evidence || '[]'), synced: row.synced === 1 }));
}

export function getIntentByThread(threadId: string): SemanticIntent | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT id, intent_id as intentId, thread_id as threadId, intent_type as intentType,
      intent_subtype as intentSubtype, confidence, classification_method as classificationMethod,
      evidence, resolved_at as resolvedAt, outcome, privacy_level as privacyLevel,
      synced, created_at as createdAt, updated_at as updatedAt
    FROM semantic_intents WHERE thread_id = ? AND resolved_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(threadId) as any;

  if (!row) return null;
  return { ...row, evidence: JSON.parse(row.evidence || '[]'), synced: row.synced === 1 };
}

export function linkIntentToActivity(seq: Omit<IntentSequence, 'id'>): number {
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO intent_sequences (intent_id, activity_id, sequence_order, created_at)
    VALUES (?, ?, ?, ?)
  `).run(seq.intentId, seq.activityId, seq.sequenceOrder, seq.createdAt);
  return result.lastInsertRowid as number;
}

export function linkIntentToEntity(map: Omit<EntityIntentMap, 'id'>): number {
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO entity_intent_map (entity_id, intent_id, role, created_at)
    VALUES (?, ?, ?, ?)
  `).run(map.entityId, map.intentId, map.role, map.createdAt);
  return result.lastInsertRowid as number;
}

export function getEntitiesForEvent(eventId: string): EventEntityLink[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT id, event_id as eventId, entity_id as entityId, role, extraction_method as extractionMethod,
      confidence, created_at as createdAt
    FROM event_entity_links WHERE event_id = ?
  `).all(eventId) as EventEntityLink[];
}

export function getActivitiesForThread(threadId: string, limit: number = 50): SemanticActivity[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT sa.id, sa.activity_id as activityId, sa.event_id as eventId,
      sa.activity_type as activityType, sa.activity_subtype as activitySubtype,
      sa.confidence, sa.classification_method as classificationMethod,
      sa.duration_ms as durationMs, sa.metadata, sa.privacy_level as privacyLevel,
      sa.synced, sa.created_at as createdAt
    FROM semantic_activities sa
    INNER JOIN thread_events te ON te.event_id = sa.event_id
    WHERE te.thread_id = ?
    ORDER BY sa.created_at DESC
    LIMIT ?
  `).all(threadId, limit) as any[];

  return rows.map(row => ({
    ...row,
    metadata: JSON.parse(row.metadata || '{}'),
    synced: row.synced === 1,
  }));
}

export function getThreadsNeedingIntentFromDB(limit: number = 50): SemanticThread[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT t.id, t.thread_id as threadId, t.title, t.status, t.started_at as startedAt,
      t.last_activity_at as lastActivityAt, t.event_count as eventCount,
      t.primary_entities as primaryEntities, t.primary_activity_type as primaryActivityType,
      t.metadata, t.privacy_level as privacyLevel, t.synced, t.created_at as createdAt,
      t.updated_at as updatedAt
    FROM semantic_threads t
    LEFT JOIN semantic_intents i ON i.thread_id = t.thread_id AND i.resolved_at IS NULL
    WHERE t.event_count >= 5
      AND i.intent_id IS NULL
    ORDER BY t.last_activity_at DESC
    LIMIT ?
  `).all(limit) as any[];
  return rows.map(row => ({
    ...row,
    primaryEntities: JSON.parse(row.primaryEntities || '[]'),
    metadata: JSON.parse(row.metadata || '{}'),
    synced: row.synced === 1,
  }));
}

// ============================================================================
// Behavioral Signatures
// ============================================================================

export function upsertSignature(sig: Omit<BehavioralSignature, 'id'>): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO behavioral_signatures (signature_id, category, metric_name, current_value,
      trend, confidence, sample_size, window_days, computed_at, privacy_level, synced, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(category, metric_name, window_days) DO UPDATE SET
      current_value = excluded.current_value,
      trend = excluded.trend,
      confidence = excluded.confidence,
      sample_size = excluded.sample_size,
      computed_at = excluded.computed_at,
      updated_at = excluded.updated_at,
      synced = 0
  `).run(
    sig.signatureId, sig.category, sig.metricName, JSON.stringify(sig.currentValue),
    sig.trend, sig.confidence, sig.sampleSize, sig.windowDays, sig.computedAt,
    sig.privacyLevel, sig.synced ? 1 : 0, sig.createdAt, sig.updatedAt
  );
}

export function getSignaturesByCategory(category: string): BehavioralSignature[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, signature_id as signatureId, category, metric_name as metricName,
      current_value as currentValue, trend, confidence, sample_size as sampleSize,
      window_days as windowDays, computed_at as computedAt, privacy_level as privacyLevel,
      synced, created_at as createdAt, updated_at as updatedAt
    FROM behavioral_signatures WHERE category = ?
    ORDER BY metric_name ASC
  `).all(category) as any[];
  return rows.map(row => ({ ...row, currentValue: JSON.parse(row.currentValue), synced: row.synced === 1 }));
}

export function getAllCurrentSignatures(): BehavioralSignature[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, signature_id as signatureId, category, metric_name as metricName,
      current_value as currentValue, trend, confidence, sample_size as sampleSize,
      window_days as windowDays, computed_at as computedAt, privacy_level as privacyLevel,
      synced, created_at as createdAt, updated_at as updatedAt
    FROM behavioral_signatures
    ORDER BY category ASC, metric_name ASC
  `).all() as any[];
  return rows.map(row => ({ ...row, currentValue: JSON.parse(row.currentValue), synced: row.synced === 1 }));
}

// ============================================================================
// Semantic Sync Operations
// ============================================================================

export function getUnsyncedEntities(limit: number = 100): Entity[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, entity_id as entityId, name, type, confidence, first_seen as firstSeen,
      last_seen as lastSeen, occurrence_count as occurrenceCount, metadata,
      privacy_level as privacyLevel, synced, created_at as createdAt, updated_at as updatedAt
    FROM semantic_entities WHERE synced = 0 AND privacy_level = 'sync_allowed'
    ORDER BY updated_at ASC LIMIT ?
  `).all(limit) as any[];
  return rows.map(row => ({ ...row, metadata: JSON.parse(row.metadata || '{}'), synced: false }));
}

export function markEntitiesSynced(entityIds: string[]): void {
  if (entityIds.length === 0) return;
  const db = getDatabase();
  const placeholders = entityIds.map(() => '?').join(',');
  db.prepare(`UPDATE semantic_entities SET synced = 1 WHERE entity_id IN (${placeholders})`).run(...entityIds);
}

export function getUnsyncedActivities(limit: number = 100): SemanticActivity[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, activity_id as activityId, event_id as eventId, activity_type as activityType,
      activity_subtype as activitySubtype, confidence, classification_method as classificationMethod,
      duration_ms as durationMs, metadata, privacy_level as privacyLevel, synced, created_at as createdAt
    FROM semantic_activities WHERE synced = 0 AND privacy_level = 'sync_allowed'
    ORDER BY created_at ASC LIMIT ?
  `).all(limit) as any[];
  return rows.map(row => ({ ...row, metadata: JSON.parse(row.metadata || '{}'), synced: false }));
}

export function markActivitiesSynced(activityIds: string[]): void {
  if (activityIds.length === 0) return;
  const db = getDatabase();
  const placeholders = activityIds.map(() => '?').join(',');
  db.prepare(`UPDATE semantic_activities SET synced = 1 WHERE activity_id IN (${placeholders})`).run(...activityIds);
}

export function getUnsyncedThreads(limit: number = 100): SemanticThread[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, thread_id as threadId, title, status, started_at as startedAt,
      last_activity_at as lastActivityAt, event_count as eventCount,
      primary_entities as primaryEntities, primary_activity_type as primaryActivityType,
      metadata, privacy_level as privacyLevel, synced, created_at as createdAt, updated_at as updatedAt
    FROM semantic_threads WHERE synced = 0 AND privacy_level = 'sync_allowed'
    ORDER BY updated_at ASC LIMIT ?
  `).all(limit) as any[];
  return rows.map(row => ({
    ...row,
    primaryEntities: JSON.parse(row.primaryEntities || '[]'),
    metadata: JSON.parse(row.metadata || '{}'),
    synced: false,
  }));
}

export function markThreadsSynced(threadIds: string[]): void {
  if (threadIds.length === 0) return;
  const db = getDatabase();
  const placeholders = threadIds.map(() => '?').join(',');
  db.prepare(`UPDATE semantic_threads SET synced = 1 WHERE thread_id IN (${placeholders})`).run(...threadIds);
}

export function getUnsyncedIntents(limit: number = 100): SemanticIntent[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, intent_id as intentId, thread_id as threadId, intent_type as intentType,
      intent_subtype as intentSubtype, confidence, classification_method as classificationMethod,
      evidence, resolved_at as resolvedAt, outcome, privacy_level as privacyLevel,
      synced, created_at as createdAt, updated_at as updatedAt
    FROM semantic_intents WHERE synced = 0 AND privacy_level = 'sync_allowed'
    ORDER BY updated_at ASC LIMIT ?
  `).all(limit) as any[];
  return rows.map(row => ({ ...row, evidence: JSON.parse(row.evidence || '[]'), synced: false }));
}

export function markIntentsSynced(intentIds: string[]): void {
  if (intentIds.length === 0) return;
  const db = getDatabase();
  const placeholders = intentIds.map(() => '?').join(',');
  db.prepare(`UPDATE semantic_intents SET synced = 1 WHERE intent_id IN (${placeholders})`).run(...intentIds);
}

export function getUnsyncedSignatures(limit: number = 100): BehavioralSignature[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, signature_id as signatureId, category, metric_name as metricName,
      current_value as currentValue, trend, confidence, sample_size as sampleSize,
      window_days as windowDays, computed_at as computedAt, privacy_level as privacyLevel,
      synced, created_at as createdAt, updated_at as updatedAt
    FROM behavioral_signatures WHERE synced = 0 AND privacy_level = 'sync_allowed'
    ORDER BY computed_at ASC LIMIT ?
  `).all(limit) as any[];
  return rows.map(row => ({ ...row, currentValue: JSON.parse(row.currentValue), synced: false }));
}

export function markSignaturesSynced(signatureIds: string[]): void {
  if (signatureIds.length === 0) return;
  const db = getDatabase();
  const placeholders = signatureIds.map(() => '?').join(',');
  db.prepare(`UPDATE behavioral_signatures SET synced = 1 WHERE signature_id IN (${placeholders})`).run(...signatureIds);
}

// ============================================================================
// Semantic Cleanup
// ============================================================================

export function cleanupSemanticData(retentionDays: number = 90): void {
  const db = getDatabase();
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  db.prepare('DELETE FROM activity_transitions WHERE transition_time < ?').run(cutoff);

  db.prepare(`
    DELETE FROM thread_events WHERE thread_id IN (
      SELECT thread_id FROM semantic_threads
      WHERE status IN ('completed', 'abandoned') AND last_activity_at < ?
    )
  `).run(cutoff);

  db.prepare(`
    DELETE FROM entity_relationships
    WHERE strength < 0.1 AND last_evidence < ?
  `).run(cutoff);

  console.log('[db] Cleaned up semantic data older than', retentionDays, 'days');
}
