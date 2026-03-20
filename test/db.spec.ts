/**
 * Database Layer Tests
 *
 * Tests for database migrations (database.ts) and all query functions (queries.ts).
 * Uses in-memory SQLite via better-sqlite3 for speed and isolation.
 */

import Database from 'better-sqlite3';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// We cannot call the real initDatabase() because it depends on Electron's
// `app.getPath()`. Instead we replicate the migration SQL inline and set the
// module-level `db` via the exported getDatabase / closeDatabase helpers.
// We mock the 'electron' module so the import inside database.ts doesn't blow up,
// then we use a small helper that opens an in-memory DB and runs migrations.
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/test-sync-desktop',
  },
}));

// We need to set the db instance that getDatabase() returns.
// database.ts keeps `db` in module scope. We'll use a workaround:
// import the module, then call a helper that sets up the DB for us.

let db: Database.Database;

// --------------------------------------------------------------------------
// Migration SQL — extracted from database.ts runMigrations()
// --------------------------------------------------------------------------

const MIGRATION_SQL = `
  -- migrations table
  CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 001_initial_schema
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

  CREATE TABLE IF NOT EXISTS hourly_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hour_start INTEGER NOT NULL UNIQUE,
    app_breakdown TEXT NOT NULL,
    total_minutes INTEGER DEFAULT 0,
    focus_score REAL DEFAULT 0,
    ocr_text TEXT,
    semantic_category TEXT,
    commitments TEXT,
    synced INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_hourly_start ON hourly_summaries(hour_start);
  CREATE INDEX IF NOT EXISTS idx_hourly_synced ON hourly_summaries(synced);

  CREATE TABLE IF NOT EXISTS daily_journals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    journal_date INTEGER NOT NULL UNIQUE,
    overview TEXT,
    highlights TEXT,
    focus_areas TEXT,
    synced INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_journal_date ON daily_journals(journal_date);
  CREATE INDEX IF NOT EXISTS idx_journal_synced ON daily_journals(synced);

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    messages TEXT NOT NULL,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 002_add_sync_metadata
  CREATE TABLE IF NOT EXISTS sync_metadata (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('last_activity_sync', NULL);
  INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('last_journal_sync', NULL);

  -- 004_deep_context_tables (screen_captures, commitments, action_items, etc.)
  CREATE TABLE IF NOT EXISTS screen_captures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    app_name TEXT NOT NULL,
    window_title TEXT,
    text_content TEXT,
    analysis TEXT,
    image_hash TEXT,
    synced INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_captures_timestamp ON screen_captures(timestamp);
  CREATE INDEX IF NOT EXISTS idx_captures_app ON screen_captures(app_name);
  CREATE INDEX IF NOT EXISTS idx_captures_hash ON screen_captures(image_hash);

  CREATE TABLE IF NOT EXISTS commitments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    type TEXT NOT NULL,
    recipient TEXT,
    deadline INTEGER,
    detected_at INTEGER NOT NULL,
    completed_at INTEGER,
    status TEXT DEFAULT 'pending',
    source_capture_id INTEGER REFERENCES screen_captures(id),
    context TEXT,
    confidence REAL DEFAULT 0.5,
    synced INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_commitments_status ON commitments(status);
  CREATE INDEX IF NOT EXISTS idx_commitments_deadline ON commitments(deadline);
  CREATE INDEX IF NOT EXISTS idx_commitments_detected ON commitments(detected_at);

  CREATE TABLE IF NOT EXISTS action_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    priority TEXT DEFAULT 'medium',
    source TEXT,
    detected_at INTEGER NOT NULL,
    completed_at INTEGER,
    status TEXT DEFAULT 'pending',
    source_capture_id INTEGER REFERENCES screen_captures(id),
    context TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_actions_status ON action_items(status);
  CREATE INDEX IF NOT EXISTS idx_actions_priority ON action_items(priority);

  CREATE TABLE IF NOT EXISTS completed_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,
    details TEXT,
    timestamp INTEGER NOT NULL,
    app_name TEXT,
    matched_commitment_id INTEGER REFERENCES commitments(id)
  );
  CREATE INDEX IF NOT EXISTS idx_completed_timestamp ON completed_actions(timestamp);
  CREATE INDEX IF NOT EXISTS idx_completed_type ON completed_actions(action_type);

  CREATE TABLE IF NOT EXISTS email_contexts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    app_name TEXT NOT NULL,
    action TEXT NOT NULL,
    recipient TEXT,
    subject TEXT,
    body_preview TEXT,
    has_attachment INTEGER DEFAULT 0,
    source_capture_id INTEGER REFERENCES screen_captures(id)
  );
  CREATE INDEX IF NOT EXISTS idx_email_timestamp ON email_contexts(timestamp);
  CREATE INDEX IF NOT EXISTS idx_email_action ON email_contexts(action);

  CREATE TABLE IF NOT EXISTS calendar_contexts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    app_name TEXT NOT NULL,
    action TEXT NOT NULL,
    event_title TEXT,
    event_time TEXT,
    participants TEXT,
    source_capture_id INTEGER REFERENCES screen_captures(id)
  );
  CREATE INDEX IF NOT EXISTS idx_calendar_timestamp ON calendar_contexts(timestamp);
  CREATE INDEX IF NOT EXISTS idx_calendar_action ON calendar_contexts(action);

  INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('deep_context_enabled', 'true');
  INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('capture_interval_ms', '30000');
  INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('last_commitment_check', NULL);

  -- 005_context_events
  CREATE TABLE IF NOT EXISTS context_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    source_application TEXT NOT NULL,
    source_window_title TEXT,
    source_url TEXT,
    source_file_path TEXT,
    summary TEXT,
    entities TEXT,
    intent TEXT,
    commitments TEXT,
    skill_signals TEXT,
    confidence REAL DEFAULT 0.5,
    privacy_level TEXT DEFAULT 'sync_allowed',
    synced INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_context_events_timestamp ON context_events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_context_events_type ON context_events(event_type);
  CREATE INDEX IF NOT EXISTS idx_context_events_app ON context_events(source_application);
  CREATE INDEX IF NOT EXISTS idx_context_events_synced ON context_events(synced);

  INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('deep_context_engine_enabled', 'true');
  INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('deep_context_capture_interval_ms', '15000');

  -- 006_semantic_entities
  CREATE TABLE IF NOT EXISTS semantic_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    metadata TEXT DEFAULT '{}',
    privacy_level TEXT DEFAULT 'sync_allowed',
    synced INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_entities_type ON semantic_entities(type);
  CREATE INDEX IF NOT EXISTS idx_entities_name ON semantic_entities(name);
  CREATE INDEX IF NOT EXISTS idx_entities_last_seen ON semantic_entities(last_seen);
  CREATE INDEX IF NOT EXISTS idx_entities_synced ON semantic_entities(synced) WHERE synced = 0;

  CREATE TABLE IF NOT EXISTS entity_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id TEXT NOT NULL REFERENCES semantic_entities(entity_id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    source TEXT NOT NULL,
    frequency INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_aliases_entity ON entity_aliases(entity_id);
  CREATE INDEX IF NOT EXISTS idx_aliases_alias ON entity_aliases(alias);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_aliases_unique ON entity_aliases(entity_id, alias, source);

  CREATE TABLE IF NOT EXISTS entity_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_entity_id TEXT NOT NULL REFERENCES semantic_entities(entity_id) ON DELETE CASCADE,
    target_entity_id TEXT NOT NULL REFERENCES semantic_entities(entity_id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL,
    strength REAL NOT NULL DEFAULT 0.5,
    evidence_count INTEGER NOT NULL DEFAULT 1,
    last_evidence INTEGER NOT NULL,
    synced INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_relationships_source ON entity_relationships(source_entity_id);
  CREATE INDEX IF NOT EXISTS idx_relationships_target ON entity_relationships(target_entity_id);
  CREATE INDEX IF NOT EXISTS idx_relationships_type ON entity_relationships(relationship_type);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_relationships_unique
    ON entity_relationships(source_entity_id, target_entity_id, relationship_type);

  CREATE TABLE IF NOT EXISTS event_entity_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL,
    entity_id TEXT NOT NULL REFERENCES semantic_entities(entity_id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'mentioned',
    extraction_method TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_event_entities_event ON event_entity_links(event_id);
  CREATE INDEX IF NOT EXISTS idx_event_entities_entity ON event_entity_links(entity_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_event_entity_links_unique
    ON event_entity_links(event_id, entity_id);

  -- 007_semantic_activities
  CREATE TABLE IF NOT EXISTS semantic_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id TEXT NOT NULL UNIQUE,
    event_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    activity_subtype TEXT,
    confidence REAL NOT NULL DEFAULT 0.5,
    classification_method TEXT NOT NULL,
    duration_ms INTEGER,
    metadata TEXT DEFAULT '{}',
    privacy_level TEXT DEFAULT 'sync_allowed',
    synced INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activities_type ON semantic_activities(activity_type);
  CREATE INDEX IF NOT EXISTS idx_activities_event ON semantic_activities(event_id);
  CREATE INDEX IF NOT EXISTS idx_activities_created ON semantic_activities(created_at);
  CREATE INDEX IF NOT EXISTS idx_activities_synced ON semantic_activities(synced) WHERE synced = 0;

  CREATE TABLE IF NOT EXISTS activity_transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_activity_id TEXT NOT NULL REFERENCES semantic_activities(activity_id) ON DELETE CASCADE,
    to_activity_id TEXT NOT NULL REFERENCES semantic_activities(activity_id) ON DELETE CASCADE,
    transition_time INTEGER NOT NULL,
    gap_ms INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_transitions_from ON activity_transitions(from_activity_id);
  CREATE INDEX IF NOT EXISTS idx_transitions_time ON activity_transitions(transition_time);

  -- 008_semantic_threads_intents
  CREATE TABLE IF NOT EXISTS semantic_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id TEXT NOT NULL UNIQUE,
    title TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    started_at INTEGER NOT NULL,
    last_activity_at INTEGER NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    primary_entities TEXT DEFAULT '[]',
    primary_activity_type TEXT,
    metadata TEXT DEFAULT '{}',
    privacy_level TEXT DEFAULT 'sync_allowed',
    synced INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_threads_status ON semantic_threads(status);
  CREATE INDEX IF NOT EXISTS idx_threads_last_activity ON semantic_threads(last_activity_at);
  CREATE INDEX IF NOT EXISTS idx_threads_synced ON semantic_threads(synced) WHERE synced = 0;

  CREATE TABLE IF NOT EXISTS thread_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id TEXT NOT NULL REFERENCES semantic_threads(thread_id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    relevance_score REAL NOT NULL DEFAULT 0.5,
    added_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_thread_events_thread ON thread_events(thread_id);
  CREATE INDEX IF NOT EXISTS idx_thread_events_event ON thread_events(event_id);

  CREATE TABLE IF NOT EXISTS thread_transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_thread_id TEXT NOT NULL REFERENCES semantic_threads(thread_id) ON DELETE CASCADE,
    to_thread_id TEXT NOT NULL REFERENCES semantic_threads(thread_id) ON DELETE CASCADE,
    transition_type TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_thread_trans_from ON thread_transitions(from_thread_id);
  CREATE INDEX IF NOT EXISTS idx_thread_trans_time ON thread_transitions(timestamp);

  CREATE TABLE IF NOT EXISTS semantic_intents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    intent_id TEXT NOT NULL UNIQUE,
    thread_id TEXT REFERENCES semantic_threads(thread_id) ON DELETE SET NULL,
    intent_type TEXT NOT NULL,
    intent_subtype TEXT,
    confidence REAL NOT NULL DEFAULT 0.5,
    classification_method TEXT NOT NULL,
    evidence TEXT DEFAULT '[]',
    resolved_at INTEGER,
    outcome TEXT,
    privacy_level TEXT DEFAULT 'sync_allowed',
    synced INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_intents_type ON semantic_intents(intent_type);
  CREATE INDEX IF NOT EXISTS idx_intents_thread ON semantic_intents(thread_id);
  CREATE INDEX IF NOT EXISTS idx_intents_synced ON semantic_intents(synced) WHERE synced = 0;

  CREATE TABLE IF NOT EXISTS intent_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    intent_id TEXT NOT NULL REFERENCES semantic_intents(intent_id) ON DELETE CASCADE,
    activity_id TEXT NOT NULL REFERENCES semantic_activities(activity_id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_intent_seq_intent ON intent_sequences(intent_id);

  CREATE TABLE IF NOT EXISTS entity_intent_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id TEXT NOT NULL REFERENCES semantic_entities(entity_id) ON DELETE CASCADE,
    intent_id TEXT NOT NULL REFERENCES semantic_intents(intent_id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'related',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_entity_intent_entity ON entity_intent_map(entity_id);
  CREATE INDEX IF NOT EXISTS idx_entity_intent_intent ON entity_intent_map(intent_id);

  -- 009_semantic_signatures
  CREATE TABLE IF NOT EXISTS behavioral_signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signature_id TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    current_value TEXT NOT NULL,
    trend TEXT DEFAULT 'stable',
    confidence REAL NOT NULL DEFAULT 0.5,
    sample_size INTEGER NOT NULL DEFAULT 0,
    window_days INTEGER NOT NULL DEFAULT 30,
    computed_at INTEGER NOT NULL,
    privacy_level TEXT DEFAULT 'sync_allowed',
    synced INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_signatures_category ON behavioral_signatures(category);
  CREATE INDEX IF NOT EXISTS idx_signatures_metric ON behavioral_signatures(metric_name);
  CREATE INDEX IF NOT EXISTS idx_signatures_computed ON behavioral_signatures(computed_at);
  CREATE INDEX IF NOT EXISTS idx_signatures_synced ON behavioral_signatures(synced) WHERE synced = 0;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_signatures_unique ON behavioral_signatures(category, metric_name, window_days);

  INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('semantic_foundation_enabled', 'true');
  INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('last_semantic_cycle', NULL);
  INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('last_signature_computation', NULL);

  -- 014_local_actions_table
  CREATE TABLE IF NOT EXISTS local_actions (
    action_id TEXT PRIMARY KEY,
    event_hash TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'detected',
    local_title TEXT NOT NULL,
    cloud_title TEXT,
    action_type TEXT NOT NULL,
    local_payload TEXT,
    confidence REAL,
    synced INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT
  );
`;

function createTestDb(): Database.Database {
  const testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  testDb.exec(MIGRATION_SQL);
  return testDb;
}

// We need to mock getDatabase() so the query functions use our in-memory DB.
vi.mock('../src/main/db/database', () => ({
  getDatabase: () => db,
  initDatabase: vi.fn(),
  closeDatabase: vi.fn(),
}));

// Now import query functions — they'll use our mocked getDatabase().
import {
  insertActivityLog,
  updateActivityDuration,
  getRecentActivity,
  getUnsyncedActivity,
  markActivitySynced,
  getActivityByDateRange,
  insertHourlySummary,
  upsertHourlySummary,
  getHourlySummaryByRange,
  getUnsyncedHourlySummaries,
  getUnsyncedSummaries,
  markHourlySummaryAsSynced,
  markSummariesSynced,
  insertDailyJournal,
  upsertDailyJournal,
  getDailyJournalByDate,
  getTodayJournal,
  getUnsyncedDailyJournals,
  markDailyJournalAsSynced,
  getJournalHistory,
  getSyncMetadata,
  setSyncMetadata,
  saveChatSession,
  getChatSession,
  cleanupOldData,
  insertEntity,
  updateEntity,
  getEntityById,
  findEntityByName,
  findEntityByAlias,
  getRecentEntities,
  upsertEntityAlias,
  getEntityAliases,
  upsertEntityRelationship,
  getEntityRelationships,
  linkEventToEntity,
  insertSemanticActivity,
  getActivitiesByType,
  insertActivityTransition,
  insertThread,
  updateThread,
  getThreadById,
  getActiveThreads,
  addEventToThread,
  getThreadEvents,
  insertIntent,
  updateIntent,
  getActiveIntents,
  getIntentByThread,
  linkIntentToEntity,
  upsertSignature,
  getSignaturesByCategory,
  getAllCurrentSignatures,
  getUnsyncedEntities,
  markEntitiesSynced,
  cleanupSemanticData,
} from '../src/main/db/queries';

// ============================================================================
// Test Helpers
// ============================================================================

const NOW = Date.now();

function makeActivity(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: NOW,
    appName: 'VS Code',
    windowTitle: 'index.ts',
    url: undefined,
    bundleId: 'com.microsoft.VSCode',
    durationSeconds: 60,
    synced: false,
    ...overrides,
  };
}

function makeEntity(overrides: Record<string, unknown> = {}) {
  return {
    entityId: `entity-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Entity',
    type: 'person' as const,
    confidence: 0.8,
    firstSeen: NOW - 100000,
    lastSeen: NOW,
    occurrenceCount: 5,
    metadata: { source: 'test' },
    privacyLevel: 'sync_allowed' as const,
    synced: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeThread(overrides: Record<string, unknown> = {}) {
  return {
    threadId: `thread-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Thread',
    status: 'active' as const,
    startedAt: NOW - 60000,
    lastActivityAt: NOW,
    eventCount: 3,
    primaryEntities: ['entity-1'],
    primaryActivityType: 'coding',
    metadata: {},
    privacyLevel: 'sync_allowed' as const,
    synced: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeSemanticActivity(overrides: Record<string, unknown> = {}) {
  return {
    activityId: `activity-${Math.random().toString(36).slice(2, 8)}`,
    eventId: 'evt-1',
    activityType: 'coding',
    activitySubtype: 'editing',
    confidence: 0.9,
    classificationMethod: 'rule' as const,
    durationMs: 30000,
    metadata: {},
    privacyLevel: 'sync_allowed' as const,
    synced: false,
    createdAt: NOW,
    ...overrides,
  };
}

// ============================================================================
// 1. Migration Tests
// ============================================================================

describe('Database Migrations', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('should create all expected tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);

    const expected = [
      'action_items',
      'activity_logs',
      'activity_transitions',
      'behavioral_signatures',
      'calendar_contexts',
      'chat_sessions',
      'commitments',
      'completed_actions',
      'context_events',
      'daily_journals',
      'email_contexts',
      'entity_aliases',
      'entity_intent_map',
      'entity_relationships',
      'event_entity_links',
      'hourly_summaries',
      'intent_sequences',
      'local_actions',
      'screen_captures',
      'semantic_activities',
      'semantic_entities',
      'semantic_intents',
      'semantic_threads',
      'sync_metadata',
      'thread_events',
      'thread_transitions',
    ];

    for (const table of expected) {
      expect(tables).toContain(table);
    }
  });

  it('should have correct columns on activity_logs', () => {
    const cols = db
      .prepare("PRAGMA table_info('activity_logs')")
      .all()
      .map((c: any) => c.name);

    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'timestamp', 'app_name', 'window_title', 'url',
        'bundle_id', 'duration_seconds', 'synced', 'created_at',
      ])
    );
  });

  it('should have correct columns on hourly_summaries (including deep context cols)', () => {
    const cols = db
      .prepare("PRAGMA table_info('hourly_summaries')")
      .all()
      .map((c: any) => c.name);

    expect(cols).toContain('ocr_text');
    expect(cols).toContain('semantic_category');
    expect(cols).toContain('commitments');
    expect(cols).toContain('hour_start');
    expect(cols).toContain('focus_score');
  });

  it('should have correct columns on semantic_entities', () => {
    const cols = db
      .prepare("PRAGMA table_info('semantic_entities')")
      .all()
      .map((c: any) => c.name);

    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'entity_id', 'name', 'type', 'confidence',
        'first_seen', 'last_seen', 'occurrence_count', 'metadata',
        'privacy_level', 'synced', 'created_at', 'updated_at',
      ])
    );
  });

  it('should have correct columns on behavioral_signatures', () => {
    const cols = db
      .prepare("PRAGMA table_info('behavioral_signatures')")
      .all()
      .map((c: any) => c.name);

    expect(cols).toEqual(
      expect.arrayContaining([
        'signature_id', 'category', 'metric_name', 'current_value',
        'trend', 'confidence', 'sample_size', 'window_days', 'computed_at',
      ])
    );
  });

  it('should seed sync_metadata with expected keys', () => {
    const keys = db
      .prepare('SELECT key FROM sync_metadata ORDER BY key')
      .all()
      .map((r: any) => r.key);

    expect(keys).toContain('last_activity_sync');
    expect(keys).toContain('last_journal_sync');
    expect(keys).toContain('deep_context_enabled');
    expect(keys).toContain('semantic_foundation_enabled');
  });
});

// ============================================================================
// 2. PRAGMA foreign_keys
// ============================================================================

describe('PRAGMA foreign_keys', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('should have foreign_keys ON', () => {
    const result = db.pragma('foreign_keys') as any[];
    expect(result[0].foreign_keys).toBe(1);
  });

  it('should enforce foreign key constraints', () => {
    // Inserting an entity_alias referencing a non-existent entity should fail
    expect(() => {
      db.prepare(`
        INSERT INTO entity_aliases (entity_id, alias, source, frequency, created_at)
        VALUES ('nonexistent', 'test', 'test', 1, ${NOW})
      `).run();
    }).toThrow();
  });
});

// ============================================================================
// 3. Activity Log CRUD
// ============================================================================

describe('Activity Logs', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('should insert and return an id', () => {
    const id = insertActivityLog(makeActivity());
    expect(id).toBeGreaterThan(0);
  });

  it('should retrieve recent activity', () => {
    // Insert activity with timestamp = now (within 10 min window)
    insertActivityLog(makeActivity({ timestamp: Date.now() }));
    insertActivityLog(makeActivity({ timestamp: Date.now(), appName: 'Chrome' }));

    const recent = getRecentActivity(10);
    expect(recent.length).toBe(2);
    expect(recent[0].appName).toBeDefined();
    expect(recent[0].synced).toBe(false);
  });

  it('should not return old activity in getRecentActivity', () => {
    const oldTimestamp = Date.now() - 20 * 60 * 1000; // 20 min ago
    insertActivityLog(makeActivity({ timestamp: oldTimestamp }));

    const recent = getRecentActivity(10);
    expect(recent.length).toBe(0);
  });

  it('should update activity duration', () => {
    const id = insertActivityLog(makeActivity({ durationSeconds: 10 }));
    updateActivityDuration(id, 120);

    const rows = db.prepare('SELECT duration_seconds FROM activity_logs WHERE id = ?').get(id) as any;
    expect(rows.duration_seconds).toBe(120);
  });

  it('should get unsynced activity', () => {
    insertActivityLog(makeActivity({ synced: false }));
    insertActivityLog(makeActivity({ synced: true }));

    const unsynced = getUnsyncedActivity(100);
    expect(unsynced.length).toBe(1);
    expect(unsynced[0].synced).toBe(false);
  });

  it('should mark activity as synced', () => {
    const id1 = insertActivityLog(makeActivity({ synced: false }));
    const id2 = insertActivityLog(makeActivity({ synced: false }));

    markActivitySynced([id1, id2]);

    const unsynced = getUnsyncedActivity(100);
    expect(unsynced.length).toBe(0);
  });

  it('should handle markActivitySynced with empty array', () => {
    // Should not throw
    markActivitySynced([]);
  });

  it('should get activity by date range', () => {
    const ts1 = new Date('2026-03-15T10:00:00Z').getTime();
    const ts2 = new Date('2026-03-15T14:00:00Z').getTime();
    const ts3 = new Date('2026-03-16T10:00:00Z').getTime();

    insertActivityLog(makeActivity({ timestamp: ts1 }));
    insertActivityLog(makeActivity({ timestamp: ts2 }));
    insertActivityLog(makeActivity({ timestamp: ts3 }));

    const results = getActivityByDateRange(
      new Date('2026-03-15T00:00:00Z'),
      new Date('2026-03-16T00:00:00Z')
    );
    expect(results.length).toBe(2);
  });

  it('should handle NULL url and bundleId', () => {
    const id = insertActivityLog(makeActivity({ url: undefined, bundleId: undefined }));
    const row = db.prepare('SELECT url, bundle_id FROM activity_logs WHERE id = ?').get(id) as any;
    expect(row.url).toBeNull();
    expect(row.bundle_id).toBeNull();
  });
});

// ============================================================================
// 4. Hourly Summary CRUD
// ============================================================================

describe('Hourly Summaries', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db) db.close();
  });

  const makeSummary = (overrides: Record<string, unknown> = {}) => ({
    id: 0, // ignored by insert
    hourStart: NOW,
    appBreakdown: [{ appName: 'VS Code', minutes: 45, percentage: 75, category: 'Development' }],
    totalMinutes: 60,
    focusScore: 0.85,
    ocrText: null,
    semanticCategory: null,
    commitments: null,
    synced: false,
    ...overrides,
  });

  it('should insert and return an id', () => {
    const id = insertHourlySummary(makeSummary());
    expect(id).toBeGreaterThan(0);
  });

  it('should enforce unique hour_start', () => {
    insertHourlySummary(makeSummary({ hourStart: 1000 }));
    expect(() => insertHourlySummary(makeSummary({ hourStart: 1000 }))).toThrow();
  });

  it('should upsert hourly summary (update on conflict)', () => {
    const hourStart = 1000;
    insertHourlySummary(makeSummary({ hourStart, totalMinutes: 30 }));
    upsertHourlySummary(makeSummary({ hourStart, totalMinutes: 45 }));

    const row = db.prepare('SELECT total_minutes FROM hourly_summaries WHERE hour_start = ?').get(hourStart) as any;
    expect(row.total_minutes).toBe(45);
  });

  it('should reset synced to 0 on upsert', () => {
    const hourStart = 2000;
    insertHourlySummary(makeSummary({ hourStart, synced: false }));

    // Manually mark synced
    db.prepare('UPDATE hourly_summaries SET synced = 1 WHERE hour_start = ?').run(hourStart);

    // Upsert should reset synced to 0
    upsertHourlySummary(makeSummary({ hourStart, totalMinutes: 50 }));

    const row = db.prepare('SELECT synced FROM hourly_summaries WHERE hour_start = ?').get(hourStart) as any;
    expect(row.synced).toBe(0);
  });

  it('should get unsynced summaries', () => {
    insertHourlySummary(makeSummary({ hourStart: 1000, synced: false }));
    insertHourlySummary(makeSummary({ hourStart: 2000, synced: true }));

    const unsynced = getUnsyncedHourlySummaries(50);
    expect(unsynced.length).toBe(1);
    expect(unsynced[0].synced).toBe(false);
  });

  it('should alias getUnsyncedSummaries to getUnsyncedHourlySummaries', () => {
    insertHourlySummary(makeSummary({ hourStart: 1000, synced: false }));
    const result = getUnsyncedSummaries(50);
    expect(result.length).toBe(1);
  });

  it('should mark single summary as synced', () => {
    const id = insertHourlySummary(makeSummary({ synced: false }));
    markHourlySummaryAsSynced(id);

    const unsynced = getUnsyncedHourlySummaries(50);
    expect(unsynced.length).toBe(0);
  });

  it('should mark multiple summaries as synced', () => {
    const id1 = insertHourlySummary(makeSummary({ hourStart: 1000 }));
    const id2 = insertHourlySummary(makeSummary({ hourStart: 2000 }));

    markSummariesSynced([id1, id2]);
    expect(getUnsyncedHourlySummaries(50).length).toBe(0);
  });

  it('should get summaries by range', () => {
    insertHourlySummary(makeSummary({ hourStart: 1000 }));
    insertHourlySummary(makeSummary({ hourStart: 2000 }));
    insertHourlySummary(makeSummary({ hourStart: 3000 }));

    const results = getHourlySummaryByRange(new Date(1500), new Date(3500));
    expect(results.length).toBe(2);
    expect(results[0].hourStart).toBe(2000);
  });

  it('should parse appBreakdown JSON correctly', () => {
    const breakdown = [{ appName: 'Chrome', minutes: 30, percentage: 50, category: 'Browser' }];
    insertHourlySummary(makeSummary({ hourStart: 5000, appBreakdown: breakdown }));

    const results = getHourlySummaryByRange(new Date(4000), new Date(6000));
    expect(results[0].appBreakdown).toEqual(breakdown);
  });
});

// ============================================================================
// 5. Daily Journal CRUD
// ============================================================================

describe('Daily Journals', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db) db.close();
  });

  const makeJournal = (overrides: Record<string, unknown> = {}) => ({
    id: 0,
    journalDate: NOW,
    overview: 'Productive day focused on coding.',
    highlights: [{ type: 'achievement', description: 'Shipped feature X' }],
    focusAreas: [{ category: 'Development', minutes: 240, percentage: 66, apps: ['VS Code'] }],
    synced: false,
    ...overrides,
  });

  it('should insert and return an id', () => {
    const id = insertDailyJournal(makeJournal());
    expect(id).toBeGreaterThan(0);
  });

  it('should get journal by date', () => {
    // journalDate is epoch-ms; getDailyJournalByDate compares with day start/end
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const journalDate = today.getTime();

    insertDailyJournal(makeJournal({ journalDate }));

    const result = getDailyJournalByDate(today);
    expect(result).not.toBeNull();
    expect(result!.overview).toBe('Productive day focused on coding.');
    expect(result!.highlights).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'achievement' }),
    ]));
  });

  it('should return null for missing date', () => {
    const result = getDailyJournalByDate(new Date('2020-01-01'));
    expect(result).toBeNull();
  });

  it('should get unsynced journals', () => {
    insertDailyJournal(makeJournal({ journalDate: 1000, synced: false }));
    insertDailyJournal(makeJournal({ journalDate: 2000, synced: true }));

    const unsynced = getUnsyncedDailyJournals(50);
    expect(unsynced.length).toBe(1);
    expect(unsynced[0].synced).toBe(false);
  });

  it('should mark journal as synced', () => {
    const id = insertDailyJournal(makeJournal({ journalDate: 3000 }));
    markDailyJournalAsSynced(id);

    const unsynced = getUnsyncedDailyJournals(50);
    expect(unsynced.length).toBe(0);
  });

  it('should upsert daily journal (update on conflict)', () => {
    const journalDate = 5000;
    insertDailyJournal(makeJournal({ journalDate, overview: 'First' }));
    upsertDailyJournal(makeJournal({ journalDate, overview: 'Updated' }));

    const row = db.prepare('SELECT overview FROM daily_journals WHERE journal_date = ?').get(journalDate) as any;
    expect(row.overview).toBe('Updated');
  });

  it('should get journal history', () => {
    // Insert journals with recent timestamps
    const now = Date.now();
    insertDailyJournal(makeJournal({ journalDate: now - 1000 }));
    insertDailyJournal(makeJournal({ journalDate: now - 2000 }));

    const history = getJournalHistory(30);
    expect(history.length).toBe(2);
    // Should be ordered DESC
    expect(history[0].journalDate).toBeGreaterThan(history[1].journalDate);
  });

  it('should parse highlights and focusAreas JSON', () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const journalDate = today.getTime();

    const highlights = [{ type: 'focus_session', description: 'Deep work 3h' }];
    const focusAreas = [{ category: 'Coding', minutes: 180, percentage: 75, apps: ['VS Code'] }];

    insertDailyJournal(makeJournal({ journalDate, highlights, focusAreas }));

    const result = getDailyJournalByDate(today);
    expect(result!.highlights).toEqual(highlights);
    expect(result!.focusAreas).toEqual(focusAreas);
  });
});

// ============================================================================
// 6. Context Events
// ============================================================================

describe('Context Events', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('should insert context events directly', () => {
    // context_events has no query functions in queries.ts, so test via raw SQL
    db.prepare(`
      INSERT INTO context_events (timestamp, event_type, source_application, summary, confidence, synced)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(NOW, 'app_switch', 'VS Code', 'Editing index.ts', 0.9, 0);

    const row = db.prepare('SELECT * FROM context_events WHERE event_type = ?').get('app_switch') as any;
    expect(row).toBeTruthy();
    expect(row.source_application).toBe('VS Code');
    expect(row.confidence).toBe(0.9);
  });

  it('should query context events by type', () => {
    db.prepare(`
      INSERT INTO context_events (timestamp, event_type, source_application, synced)
      VALUES (?, ?, ?, ?)
    `).run(NOW, 'app_switch', 'Chrome', 0);
    db.prepare(`
      INSERT INTO context_events (timestamp, event_type, source_application, synced)
      VALUES (?, ?, ?, ?)
    `).run(NOW, 'file_edit', 'VS Code', 0);
    db.prepare(`
      INSERT INTO context_events (timestamp, event_type, source_application, synced)
      VALUES (?, ?, ?, ?)
    `).run(NOW, 'app_switch', 'Slack', 0);

    const rows = db.prepare('SELECT * FROM context_events WHERE event_type = ?').all('app_switch') as any[];
    expect(rows.length).toBe(2);
  });

  it('should support all context event columns', () => {
    db.prepare(`
      INSERT INTO context_events (timestamp, event_type, source_application,
        source_window_title, source_url, source_file_path, summary, entities,
        intent, commitments, skill_signals, confidence, privacy_level, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      NOW, 'browsing', 'Chrome', 'Google Docs - Report',
      'https://docs.google.com/123', null, 'Editing report',
      '["Project X"]', 'writing', '["finish report by Friday"]',
      '["document editing"]', 0.95, 'sync_allowed', 0
    );

    const row = db.prepare('SELECT * FROM context_events').get() as any;
    expect(row.source_url).toBe('https://docs.google.com/123');
    expect(row.entities).toBe('["Project X"]');
    expect(row.privacy_level).toBe('sync_allowed');
  });
});

// ============================================================================
// 7. Semantic Entities
// ============================================================================

describe('Semantic Entities', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('should insert and retrieve entity by id', () => {
    const entity = makeEntity({ entityId: 'ent-001' });
    insertEntity(entity);

    const result = getEntityById('ent-001');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Test Entity');
    expect(result!.type).toBe('person');
    expect(result!.metadata).toEqual({ source: 'test' });
    expect(result!.synced).toBe(false);
  });

  it('should return null for non-existent entity', () => {
    expect(getEntityById('nonexistent')).toBeNull();
  });

  it('should find entities by name (case insensitive)', () => {
    insertEntity(makeEntity({ entityId: 'e1', name: 'John Doe', type: 'person' }));
    insertEntity(makeEntity({ entityId: 'e2', name: 'john doe', type: 'person' }));
    insertEntity(makeEntity({ entityId: 'e3', name: 'Jane Doe', type: 'person' }));

    const results = findEntityByName('john doe');
    expect(results.length).toBe(2);
  });

  it('should find entities by name and type', () => {
    insertEntity(makeEntity({ entityId: 'e1', name: 'React', type: 'tool' }));
    insertEntity(makeEntity({ entityId: 'e2', name: 'React', type: 'topic' }));

    const tools = findEntityByName('React', 'tool');
    expect(tools.length).toBe(1);
    expect(tools[0].type).toBe('tool');
  });

  it('should update entity fields', () => {
    insertEntity(makeEntity({ entityId: 'e-update', confidence: 0.5, occurrenceCount: 1 }));

    updateEntity('e-update', { confidence: 0.95, occurrenceCount: 10, lastSeen: NOW + 1000 });

    const result = getEntityById('e-update');
    expect(result!.confidence).toBe(0.95);
    expect(result!.occurrenceCount).toBe(10);
    expect(result!.synced).toBe(false); // updateEntity resets synced to 0
  });

  it('should get recent entities ordered by last_seen DESC', () => {
    insertEntity(makeEntity({ entityId: 'e-old', lastSeen: NOW - 5000 }));
    insertEntity(makeEntity({ entityId: 'e-new', lastSeen: NOW }));

    const recent = getRecentEntities(10);
    expect(recent[0].entityId).toBe('e-new');
    expect(recent[1].entityId).toBe('e-old');
  });

  it('should upsert entity alias (increment frequency on conflict)', () => {
    insertEntity(makeEntity({ entityId: 'e-alias' }));

    upsertEntityAlias({ entityId: 'e-alias', alias: 'JD', source: 'email', frequency: 1, createdAt: NOW });
    upsertEntityAlias({ entityId: 'e-alias', alias: 'JD', source: 'email', frequency: 1, createdAt: NOW });

    const aliases = getEntityAliases('e-alias');
    expect(aliases.length).toBe(1);
    expect(aliases[0].frequency).toBe(2); // incremented
  });

  it('should find entity by alias', () => {
    insertEntity(makeEntity({ entityId: 'e-byalias', name: 'John Smith' }));
    upsertEntityAlias({ entityId: 'e-byalias', alias: 'JS', source: 'chat', frequency: 5, createdAt: NOW });

    const found = findEntityByAlias('JS');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('John Smith');
  });

  it('should upsert entity relationship (ON CONFLICT increments evidence_count)', () => {
    insertEntity(makeEntity({ entityId: 'e-a' }));
    insertEntity(makeEntity({ entityId: 'e-b' }));

    const rel = {
      sourceEntityId: 'e-a',
      targetEntityId: 'e-b',
      relationshipType: 'collaborates_with' as const,
      strength: 0.5,
      evidenceCount: 1,
      lastEvidence: NOW,
      synced: false,
      createdAt: NOW,
      updatedAt: NOW,
    };

    upsertEntityRelationship(rel);
    upsertEntityRelationship({ ...rel, strength: 0.8 });

    const rels = getEntityRelationships('e-a');
    expect(rels.length).toBe(1);
    expect(rels[0].strength).toBe(0.8);
    expect(rels[0].evidenceCount).toBe(2); // incremented
  });

  it('should link event to entity', () => {
    insertEntity(makeEntity({ entityId: 'e-link' }));

    const linkId = linkEventToEntity({
      eventId: 'evt-100',
      entityId: 'e-link',
      role: 'primary' as const,
      extractionMethod: 'regex' as const,
      confidence: 0.9,
      createdAt: NOW,
    });

    expect(linkId).toBeGreaterThan(0);
  });

  it('should get unsynced entities', () => {
    insertEntity(makeEntity({ entityId: 'e-synced', synced: true }));
    insertEntity(makeEntity({ entityId: 'e-unsynced', synced: false }));

    const unsynced = getUnsyncedEntities(100);
    expect(unsynced.length).toBe(1);
    expect(unsynced[0].entityId).toBe('e-unsynced');
  });

  it('should mark entities synced', () => {
    insertEntity(makeEntity({ entityId: 'e-mark', synced: false }));
    markEntitiesSynced(['e-mark']);

    const result = getEntityById('e-mark');
    expect(result!.synced).toBe(true);
  });
});

// ============================================================================
// 8. Semantic Threads
// ============================================================================

describe('Semantic Threads', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('should create and retrieve a thread', () => {
    const thread = makeThread({ threadId: 'thread-001' });
    insertThread(thread);

    const result = getThreadById('thread-001');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Test Thread');
    expect(result!.status).toBe('active');
    expect(result!.primaryEntities).toEqual(['entity-1']);
    expect(result!.metadata).toEqual({});
    expect(result!.synced).toBe(false);
  });

  it('should get active threads only', () => {
    insertThread(makeThread({ threadId: 't-active', status: 'active' }));
    insertThread(makeThread({ threadId: 't-completed', status: 'completed' }));

    const active = getActiveThreads();
    expect(active.length).toBe(1);
    expect(active[0].threadId).toBe('t-active');
  });

  it('should update thread fields', () => {
    insertThread(makeThread({ threadId: 't-up', eventCount: 3 }));
    updateThread('t-up', { eventCount: 10, status: 'completed' });

    const result = getThreadById('t-up');
    expect(result!.eventCount).toBe(10);
    expect(result!.status).toBe('completed');
    expect(result!.synced).toBe(false);
  });

  it('should add events to thread', () => {
    insertThread(makeThread({ threadId: 't-evt' }));

    addEventToThread({ threadId: 't-evt', eventId: 'evt-1', relevanceScore: 0.8, addedAt: NOW });
    addEventToThread({ threadId: 't-evt', eventId: 'evt-2', relevanceScore: 0.6, addedAt: NOW + 1 });

    const events = getThreadEvents('t-evt', 100);
    expect(events.length).toBe(2);
    // Ordered by added_at DESC
    expect(events[0].eventId).toBe('evt-2');
  });
});

// ============================================================================
// 9. Semantic Intents
// ============================================================================

describe('Semantic Intents', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('should create an intent linked to a thread', () => {
    insertThread(makeThread({ threadId: 't-intent' }));

    const id = insertIntent({
      intentId: 'int-001',
      threadId: 't-intent',
      intentType: 'SHIP',
      intentSubtype: 'feature_dev',
      confidence: 0.85,
      classificationMethod: 'rule' as const,
      evidence: [{ type: 'activity_pattern', detail: 'long coding session' }],
      resolvedAt: null,
      outcome: null,
      privacyLevel: 'sync_allowed' as const,
      synced: false,
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(id).toBeGreaterThan(0);
  });

  it('should get active (unresolved) intents', () => {
    insertThread(makeThread({ threadId: 't-int' }));

    insertIntent({
      intentId: 'int-active',
      threadId: 't-int',
      intentType: 'SHIP',
      intentSubtype: null,
      confidence: 0.7,
      classificationMethod: 'rule' as const,
      evidence: [],
      resolvedAt: null,
      outcome: null,
      privacyLevel: 'sync_allowed' as const,
      synced: false,
      createdAt: NOW,
      updatedAt: NOW,
    });

    insertIntent({
      intentId: 'int-resolved',
      threadId: 't-int',
      intentType: 'MANAGE',
      intentSubtype: null,
      confidence: 0.7,
      classificationMethod: 'rule' as const,
      evidence: [],
      resolvedAt: NOW,
      outcome: 'completed',
      privacyLevel: 'sync_allowed' as const,
      synced: false,
      createdAt: NOW - 1000,
      updatedAt: NOW,
    });

    const active = getActiveIntents();
    expect(active.length).toBe(1);
    expect(active[0].intentId).toBe('int-active');
    expect(active[0].evidence).toEqual([]);
  });

  it('should get intent by thread', () => {
    insertThread(makeThread({ threadId: 't-bythread' }));

    insertIntent({
      intentId: 'int-bt',
      threadId: 't-bythread',
      intentType: 'PLAN',
      intentSubtype: null,
      confidence: 0.6,
      classificationMethod: 'hybrid' as const,
      evidence: [],
      resolvedAt: null,
      outcome: null,
      privacyLevel: 'sync_allowed' as const,
      synced: false,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = getIntentByThread('t-bythread');
    expect(result).not.toBeNull();
    expect(result!.intentType).toBe('PLAN');
  });

  it('should update intent (resolve it)', () => {
    insertThread(makeThread({ threadId: 't-resolve' }));

    insertIntent({
      intentId: 'int-toresolve',
      threadId: 't-resolve',
      intentType: 'RESPOND',
      intentSubtype: null,
      confidence: 0.7,
      classificationMethod: 'rule' as const,
      evidence: [],
      resolvedAt: null,
      outcome: null,
      privacyLevel: 'sync_allowed' as const,
      synced: false,
      createdAt: NOW,
      updatedAt: NOW,
    });

    updateIntent('int-toresolve', { resolvedAt: NOW + 5000, outcome: 'completed' });

    const active = getActiveIntents();
    expect(active.length).toBe(0);
  });

  it('should link intent to entity', () => {
    insertEntity(makeEntity({ entityId: 'e-intent' }));
    insertThread(makeThread({ threadId: 't-link' }));

    insertIntent({
      intentId: 'int-link',
      threadId: 't-link',
      intentType: 'SHIP',
      intentSubtype: null,
      confidence: 0.8,
      classificationMethod: 'rule' as const,
      evidence: [],
      resolvedAt: null,
      outcome: null,
      privacyLevel: 'sync_allowed' as const,
      synced: false,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const id = linkIntentToEntity({
      entityId: 'e-intent',
      intentId: 'int-link',
      role: 'primary' as const,
      createdAt: NOW,
    });

    expect(id).toBeGreaterThan(0);
  });
});

// ============================================================================
// 10. Behavioral Signatures
// ============================================================================

describe('Behavioral Signatures', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db) db.close();
  });

  const makeSig = (overrides: Record<string, unknown> = {}) => ({
    signatureId: `sig-${Math.random().toString(36).slice(2, 8)}`,
    category: 'rhythm' as const,
    metricName: 'peak_hour',
    currentValue: { hour: 14, productivity: 0.9 },
    trend: 'stable' as const,
    confidence: 0.85,
    sampleSize: 30,
    windowDays: 30,
    computedAt: NOW,
    privacyLevel: 'sync_allowed' as const,
    synced: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });

  it('should upsert and retrieve by category', () => {
    upsertSignature(makeSig({ category: 'rhythm', metricName: 'peak_hour' }));
    upsertSignature(makeSig({ category: 'rhythm', metricName: 'avg_focus_score' }));
    upsertSignature(makeSig({ category: 'workflow', metricName: 'context_switches' }));

    const rhythmSigs = getSignaturesByCategory('rhythm');
    expect(rhythmSigs.length).toBe(2);

    const workflowSigs = getSignaturesByCategory('workflow');
    expect(workflowSigs.length).toBe(1);
  });

  it('should update on conflict (same category + metric_name + window_days)', () => {
    const sig = makeSig({ signatureId: 'sig-1', category: 'quality', metricName: 'accuracy', windowDays: 30 });
    upsertSignature(sig);

    // Upsert with different signatureId but same category/metric/window
    upsertSignature({
      ...sig,
      signatureId: 'sig-2',
      currentValue: { accuracy: 0.99 },
      sampleSize: 50,
    });

    const results = getSignaturesByCategory('quality');
    expect(results.length).toBe(1);
    expect(results[0].currentValue).toEqual({ accuracy: 0.99 });
    expect(results[0].sampleSize).toBe(50);
  });

  it('should get all current signatures', () => {
    upsertSignature(makeSig({ category: 'rhythm', metricName: 'a' }));
    upsertSignature(makeSig({ category: 'stress', metricName: 'b' }));

    const all = getAllCurrentSignatures();
    expect(all.length).toBe(2);
  });

  it('should parse currentValue JSON', () => {
    const value = { deep_work_ratio: 0.65, avg_session_minutes: 45 };
    upsertSignature(makeSig({ currentValue: value, category: 'workflow', metricName: 'deep_work' }));

    const results = getSignaturesByCategory('workflow');
    expect(results[0].currentValue).toEqual(value);
  });
});

// ============================================================================
// 11. cleanupOldData
// ============================================================================

describe('cleanupOldData', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('should delete old synced activity logs', () => {
    const oldTimestamp = Date.now() - 60 * 24 * 60 * 60 * 1000; // 60 days ago
    const recentTimestamp = Date.now();

    insertActivityLog(makeActivity({ timestamp: oldTimestamp, synced: true }));
    insertActivityLog(makeActivity({ timestamp: recentTimestamp, synced: true }));

    cleanupOldData(30);

    const count = (db.prepare('SELECT COUNT(*) as c FROM activity_logs').get() as any).c;
    expect(count).toBe(1);
  });

  it('should NOT delete old unsynced activity logs', () => {
    const oldTimestamp = Date.now() - 60 * 24 * 60 * 60 * 1000;
    insertActivityLog(makeActivity({ timestamp: oldTimestamp, synced: false }));

    cleanupOldData(30);

    const count = (db.prepare('SELECT COUNT(*) as c FROM activity_logs').get() as any).c;
    expect(count).toBe(1); // preserved because not synced
  });

  it('should delete old synced hourly summaries using epoch-ms timestamps', () => {
    const oldHourStart = Date.now() - 60 * 24 * 60 * 60 * 1000; // 60 days ago in ms
    const recentHourStart = Date.now();

    // Insert directly to avoid upsert/unique conflicts with helper
    db.prepare(`INSERT INTO hourly_summaries (hour_start, app_breakdown, total_minutes, focus_score, synced) VALUES (?, '[]', 30, 0.5, 1)`).run(oldHourStart);
    db.prepare(`INSERT INTO hourly_summaries (hour_start, app_breakdown, total_minutes, focus_score, synced) VALUES (?, '[]', 30, 0.5, 1)`).run(recentHourStart);

    cleanupOldData(30);

    const count = (db.prepare('SELECT COUNT(*) as c FROM hourly_summaries').get() as any).c;
    expect(count).toBe(1);
  });

  it('should handle cleanupOldData when tables are empty', () => {
    // Should not throw
    cleanupOldData(30);
  });
});

// ============================================================================
// 12. Chat Sessions
// ============================================================================

describe('Chat Sessions', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('should save and retrieve chat session', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];

    saveChatSession('session-1', messages);

    const result = getChatSession('session-1');
    expect(result).toEqual(messages);
  });

  it('should return null for non-existent session', () => {
    expect(getChatSession('nonexistent')).toBeNull();
  });

  it('should update messages on save (upsert)', () => {
    saveChatSession('session-2', [{ role: 'user', content: 'First' }]);
    saveChatSession('session-2', [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Response' },
    ]);

    const result = getChatSession('session-2');
    expect(result!.length).toBe(2);
  });

  it('should handle empty messages array', () => {
    saveChatSession('empty-session', []);
    const result = getChatSession('empty-session');
    expect(result).toEqual([]);
  });

  it('should handle large message payloads', () => {
    const bigContent = 'x'.repeat(100000);
    const messages = [{ role: 'user', content: bigContent }];

    saveChatSession('big-session', messages);
    const result = getChatSession('big-session');
    expect(result![0].content.length).toBe(100000);
  });
});

// ============================================================================
// 13. Sync Metadata
// ============================================================================

describe('Sync Metadata', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('should get seeded metadata values', () => {
    const result = getSyncMetadata('deep_context_enabled');
    expect(result).toBe('true');
  });

  it('should return null for unknown keys', () => {
    expect(getSyncMetadata('nonexistent_key')).toBeNull();
  });

  it('should set and get custom key-value', () => {
    setSyncMetadata('custom_key', 'custom_value');
    expect(getSyncMetadata('custom_key')).toBe('custom_value');
  });

  it('should update existing key (upsert)', () => {
    setSyncMetadata('test_key', 'value_1');
    setSyncMetadata('test_key', 'value_2');
    expect(getSyncMetadata('test_key')).toBe('value_2');
  });

  it('should return null for seeded keys with NULL value', () => {
    // last_activity_sync is seeded with NULL
    expect(getSyncMetadata('last_activity_sync')).toBeNull();
  });
});

// ============================================================================
// 14. Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('should handle special characters in window titles', () => {
    const id = insertActivityLog(makeActivity({
      windowTitle: "O'Brien's \"Report\" — Draft <v2> & Final",
    }));
    const row = db.prepare('SELECT window_title FROM activity_logs WHERE id = ?').get(id) as any;
    expect(row.window_title).toBe("O'Brien's \"Report\" — Draft <v2> & Final");
  });

  it('should handle unicode in entity names', () => {
    insertEntity(makeEntity({ entityId: 'e-unicode', name: 'Gody D\u00fc\u00efnsbergen' }));
    const result = getEntityById('e-unicode');
    expect(result!.name).toBe('Gody D\u00fc\u00efnsbergen');
  });

  it('should handle very long strings', () => {
    const longTitle = 'A'.repeat(10000);
    const id = insertActivityLog(makeActivity({ windowTitle: longTitle }));
    const row = db.prepare('SELECT window_title FROM activity_logs WHERE id = ?').get(id) as any;
    expect(row.window_title.length).toBe(10000);
  });

  it('should handle concurrent inserts to same table', () => {
    // SQLite serializes writes, but this tests that our queries don't conflict
    for (let i = 0; i < 100; i++) {
      insertActivityLog(makeActivity({ timestamp: NOW + i }));
    }
    const count = (db.prepare('SELECT COUNT(*) as c FROM activity_logs').get() as any).c;
    expect(count).toBe(100);
  });

  it('should handle duplicate entity_id insert (unique constraint)', () => {
    insertEntity(makeEntity({ entityId: 'dup-id' }));
    expect(() => insertEntity(makeEntity({ entityId: 'dup-id' }))).toThrow();
  });

  it('should handle JSON metadata with nested objects', () => {
    const metadata = {
      emails: ['test@example.com'],
      projects: [{ name: 'SYNC', role: 'developer' }],
      nested: { deep: { value: 42 } },
    };
    insertEntity(makeEntity({ entityId: 'e-meta', metadata }));

    const result = getEntityById('e-meta');
    expect(result!.metadata).toEqual(metadata);
  });

  it('should handle NULL summary and entities in context events', () => {
    db.prepare(`
      INSERT INTO context_events (timestamp, event_type, source_application, summary, entities, synced)
      VALUES (?, ?, ?, NULL, NULL, 0)
    `).run(NOW, 'idle', 'System');

    const row = db.prepare('SELECT summary, entities FROM context_events').get() as any;
    expect(row.summary).toBeNull();
    expect(row.entities).toBeNull();
  });

  it('should cascade delete entity aliases when entity is deleted', () => {
    insertEntity(makeEntity({ entityId: 'e-cascade' }));
    upsertEntityAlias({ entityId: 'e-cascade', alias: 'EC', source: 'test', frequency: 1, createdAt: NOW });

    db.prepare('DELETE FROM semantic_entities WHERE entity_id = ?').run('e-cascade');

    const aliases = getEntityAliases('e-cascade');
    expect(aliases.length).toBe(0);
  });

  it('should handle cleanupSemanticData', () => {
    // Insert entities and relationships first
    insertEntity(makeEntity({ entityId: 'e-clean-a' }));
    insertEntity(makeEntity({ entityId: 'e-clean-b' }));

    const oldEvidence = Date.now() - 120 * 24 * 60 * 60 * 1000; // 120 days ago
    upsertEntityRelationship({
      sourceEntityId: 'e-clean-a',
      targetEntityId: 'e-clean-b',
      relationshipType: 'collaborates_with' as const,
      strength: 0.05, // below 0.1 threshold
      evidenceCount: 1,
      lastEvidence: oldEvidence,
      synced: false,
      createdAt: oldEvidence,
      updatedAt: oldEvidence,
    });

    cleanupSemanticData(90);

    const rels = getEntityRelationships('e-clean-a');
    expect(rels.length).toBe(0);
  });
});
