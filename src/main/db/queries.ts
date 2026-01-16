/**
 * Database Queries
 *
 * All database operations for activity tracking and journaling.
 */

import { getDatabase } from './database';
import { ActivityLog, HourlySummary, DailyJournal } from '../../shared/types';

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
    INSERT INTO hourly_summaries (hour_start, app_breakdown, total_minutes, focus_score, synced)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    summary.hourStart,
    JSON.stringify(summary.appBreakdown),
    summary.totalMinutes,
    summary.focusScore,
    summary.synced ? 1 : 0
  );

  return result.lastInsertRowid as number;
}

export function upsertHourlySummary(summary: Omit<HourlySummary, 'id'>): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO hourly_summaries (hour_start, app_breakdown, total_minutes, focus_score, synced)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(hour_start) DO UPDATE SET
      app_breakdown = excluded.app_breakdown,
      total_minutes = excluded.total_minutes,
      focus_score = excluded.focus_score,
      synced = 0
  `);

  stmt.run(
    summary.hourStart,
    JSON.stringify(summary.appBreakdown),
    summary.totalMinutes,
    summary.focusScore,
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
           total_minutes as totalMinutes, focus_score as focusScore, synced
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
           total_minutes as totalMinutes, focus_score as focusScore, synced
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
  db.prepare(`
    DELETE FROM hourly_summaries
    WHERE datetime(hour_start) < datetime('now', '-' || ? || ' days') AND synced = 1
  `).run(retentionDays);

  console.log('[db] Cleaned up data older than', retentionDays, 'days');
}
