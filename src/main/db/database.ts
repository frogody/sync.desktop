/**
 * SQLite Database Setup
 *
 * Uses better-sqlite3 for fast, synchronous database operations.
 * Data is stored locally and synced to Supabase cloud.
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

// ============================================================================
// Database Instance
// ============================================================================

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// ============================================================================
// Initialization
// ============================================================================

export async function initDatabase(): Promise<void> {
  // Get user data directory
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'sync-desktop.db');

  console.log('[db] Initializing database at:', dbPath);

  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Open database
  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // Run migrations
  runMigrations();

  console.log('[db] Database initialized successfully');
}

// ============================================================================
// Migrations
// ============================================================================

function runMigrations(): void {
  if (!db) return;

  // Create migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get applied migrations
  const appliedMigrations = db
    .prepare('SELECT name FROM migrations')
    .all()
    .map((row: any) => row.name);

  // Define migrations
  const migrations = [
    {
      name: '001_initial_schema',
      sql: `
        -- Activity logs - raw window tracking data
        CREATE TABLE IF NOT EXISTS activity_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          app_name TEXT NOT NULL,
          window_title TEXT,
          url TEXT,
          bundle_id TEXT,
          duration_seconds INTEGER DEFAULT 0,
          synced INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_activity_synced ON activity_logs(synced);
        CREATE INDEX IF NOT EXISTS idx_activity_app ON activity_logs(app_name);

        -- Hourly summaries - aggregated data
        CREATE TABLE IF NOT EXISTS hourly_summaries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          hour_start DATETIME NOT NULL UNIQUE,
          app_breakdown TEXT NOT NULL, -- JSON
          total_minutes INTEGER DEFAULT 0,
          focus_score REAL DEFAULT 0,
          synced INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_hourly_start ON hourly_summaries(hour_start);
        CREATE INDEX IF NOT EXISTS idx_hourly_synced ON hourly_summaries(synced);

        -- Daily journals - AI-generated summaries
        CREATE TABLE IF NOT EXISTS daily_journals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          journal_date DATE NOT NULL UNIQUE,
          overview TEXT,
          highlights TEXT, -- JSON array
          focus_areas TEXT, -- JSON array
          app_breakdown TEXT, -- JSON
          synced INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_journal_date ON daily_journals(journal_date);
        CREATE INDEX IF NOT EXISTS idx_journal_synced ON daily_journals(synced);

        -- Chat sessions - for persistence
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          messages TEXT NOT NULL, -- JSON array
          last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `,
    },
    {
      name: '002_add_sync_metadata',
      sql: `
        -- Sync metadata - track last successful sync
        CREATE TABLE IF NOT EXISTS sync_metadata (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Initialize sync timestamps
        INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('last_activity_sync', NULL);
        INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('last_journal_sync', NULL);
      `,
    },
    {
      name: '003_update_timestamp_columns',
      sql: `
        -- Update hourly_summaries to use INTEGER timestamps
        -- Drop and recreate table since SQLite doesn't support ALTER COLUMN
        CREATE TABLE IF NOT EXISTS hourly_summaries_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          hour_start INTEGER NOT NULL UNIQUE,
          app_breakdown TEXT NOT NULL,
          total_minutes INTEGER DEFAULT 0,
          focus_score REAL DEFAULT 0,
          synced INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Migrate data (convert datetime string to timestamp if exists)
        INSERT OR IGNORE INTO hourly_summaries_new (id, hour_start, app_breakdown, total_minutes, focus_score, synced, created_at)
        SELECT id,
               CASE
                 WHEN typeof(hour_start) = 'text' THEN strftime('%s', hour_start) * 1000
                 ELSE hour_start
               END,
               app_breakdown, total_minutes, focus_score, synced, created_at
        FROM hourly_summaries;

        DROP TABLE IF EXISTS hourly_summaries;
        ALTER TABLE hourly_summaries_new RENAME TO hourly_summaries;

        CREATE INDEX IF NOT EXISTS idx_hourly_start ON hourly_summaries(hour_start);
        CREATE INDEX IF NOT EXISTS idx_hourly_synced ON hourly_summaries(synced);

        -- Update daily_journals to use INTEGER timestamps
        CREATE TABLE IF NOT EXISTS daily_journals_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          journal_date INTEGER NOT NULL UNIQUE,
          overview TEXT,
          highlights TEXT,
          focus_areas TEXT,
          synced INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Migrate data
        INSERT OR IGNORE INTO daily_journals_new (id, journal_date, overview, highlights, focus_areas, synced, created_at)
        SELECT id,
               CASE
                 WHEN typeof(journal_date) = 'text' THEN strftime('%s', journal_date) * 1000
                 ELSE journal_date
               END,
               overview, highlights, focus_areas, synced, created_at
        FROM daily_journals;

        DROP TABLE IF EXISTS daily_journals;
        ALTER TABLE daily_journals_new RENAME TO daily_journals;

        CREATE INDEX IF NOT EXISTS idx_journal_date ON daily_journals(journal_date);
        CREATE INDEX IF NOT EXISTS idx_journal_synced ON daily_journals(synced);
      `,
    },
  ];

  // Apply unapplied migrations
  for (const migration of migrations) {
    if (!appliedMigrations.includes(migration.name)) {
      console.log('[db] Applying migration:', migration.name);

      db.exec(migration.sql);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);

      console.log('[db] Migration applied:', migration.name);
    }
  }
}

// ============================================================================
// Cleanup
// ============================================================================

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[db] Database closed');
  }
}
