/**
 * Context Event Store
 *
 * CRUD operations for ContextEvent objects in the local SQLite database.
 * Sensitive text fields (summary, entities, commitments) are encrypted
 * with AES-256-GCM before storage and decrypted on read.
 *
 * Uses the same database instance as the rest of the app (via getDatabase()).
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { getDatabase } from '../../main/db/database';
import type { ContextEvent, ContextEventType, Commitment, SkillSignal } from '../types';

// ============================================================================
// Encryption Helpers
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Derive a 32-byte key from the app's encryption passphrase
function deriveKey(passphrase: string): Buffer {
  return createHash('sha256').update(passphrase).digest();
}

function encrypt(text: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:encrypted
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

function decrypt(data: string, key: Buffer): string {
  const parts = data.split(':');
  if (parts.length !== 3) return data; // Not encrypted, return as-is
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ============================================================================
// Context Event Store
// ============================================================================

export class ContextEventStore {
  private encryptionKey: Buffer | null = null;
  private encryptionEnabled: boolean;

  constructor(encryptionEnabled: boolean = true, passphrase?: string) {
    this.encryptionEnabled = encryptionEnabled;
    if (encryptionEnabled) {
      this.encryptionKey = deriveKey(passphrase || 'sync-desktop-deep-context-v1');
    }
  }

  // ============================================================================
  // Insert
  // ============================================================================

  insert(event: ContextEvent): number {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO context_events (
        timestamp, event_type, source_application, source_window_title,
        source_url, source_file_path, summary, entities, intent,
        commitments, skill_signals, confidence, privacy_level, synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      event.timestamp,
      event.eventType,
      event.source.application,
      event.source.windowTitle,
      event.source.url || null,
      event.source.filePath || null,
      this.encryptField(event.semanticPayload.summary),
      this.encryptField(JSON.stringify(event.semanticPayload.entities)),
      event.semanticPayload.intent || null,
      event.semanticPayload.commitments
        ? this.encryptField(JSON.stringify(event.semanticPayload.commitments))
        : null,
      event.semanticPayload.skillSignals
        ? JSON.stringify(event.semanticPayload.skillSignals)
        : null,
      event.confidence,
      event.privacyLevel,
      event.synced ? 1 : 0,
    );

    return result.lastInsertRowid as number;
  }

  // ============================================================================
  // Query
  // ============================================================================

  getById(id: number): ContextEvent | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM context_events WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToEvent(row);
  }

  getByTimeRange(startTs: number, endTs: number, limit: number = 100): ContextEvent[] {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT * FROM context_events WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT ?'
    ).all(startTs, endTs, limit) as any[];
    return rows.map((row) => this.rowToEvent(row));
  }

  getByEventType(eventType: ContextEventType, limit: number = 50): ContextEvent[] {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT * FROM context_events WHERE event_type = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(eventType, limit) as any[];
    return rows.map((row) => this.rowToEvent(row));
  }

  getByApplication(appName: string, limit: number = 50): ContextEvent[] {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT * FROM context_events WHERE source_application = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(appName, limit) as any[];
    return rows.map((row) => this.rowToEvent(row));
  }

  getRecentEvents(minutes: number = 60, limit: number = 100): ContextEvent[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this.getByTimeRange(cutoff, Date.now(), limit);
  }

  getUnsynced(limit: number = 100): ContextEvent[] {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT * FROM context_events WHERE synced = 0 AND privacy_level = ? ORDER BY timestamp ASC LIMIT ?'
    ).all('sync_allowed', limit) as any[];
    return rows.map((row) => this.rowToEvent(row));
  }

  getCommitments(since?: number): Commitment[] {
    const db = getDatabase();
    const cutoff = since || Date.now() - 24 * 60 * 60 * 1000; // Default: last 24h

    const rows = db.prepare(
      'SELECT commitments FROM context_events WHERE event_type = ? AND timestamp >= ? AND commitments IS NOT NULL ORDER BY timestamp DESC'
    ).all('commitment_detected', cutoff) as any[];

    const allCommitments: Commitment[] = [];
    for (const row of rows) {
      try {
        const decrypted = this.decryptField(row.commitments);
        const parsed = JSON.parse(decrypted) as Commitment[];
        allCommitments.push(...parsed);
      } catch {
        // Skip malformed commitment data
      }
    }
    return allCommitments;
  }

  getContextSwitchCount(since: number): number {
    const db = getDatabase();
    const row = db.prepare(
      'SELECT COUNT(*) as count FROM context_events WHERE event_type = ? AND timestamp >= ?'
    ).get('context_switch', since) as any;
    return row?.count || 0;
  }

  getTopApplications(since: number, limit: number = 10): { app: string; count: number }[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT source_application as app, COUNT(*) as count
      FROM context_events
      WHERE timestamp >= ?
      GROUP BY source_application
      ORDER BY count DESC
      LIMIT ?
    `).all(since, limit) as any[];
    return rows;
  }

  // ============================================================================
  // Update
  // ============================================================================

  markSynced(ids: number[]): void {
    if (ids.length === 0) return;
    const db = getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE context_events SET synced = 1 WHERE id IN (${placeholders})`).run(...ids);
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  cleanupOlderThan(days: number): number {
    const db = getDatabase();
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const result = db.prepare('DELETE FROM context_events WHERE timestamp < ?').run(cutoff);
    return result.changes;
  }

  getCount(): number {
    const db = getDatabase();
    const row = db.prepare('SELECT COUNT(*) as count FROM context_events').get() as any;
    return row?.count || 0;
  }

  // ============================================================================
  // Row ↔ Event Mapping
  // ============================================================================

  private rowToEvent(row: any): ContextEvent {
    let entities: string[] = [];
    try {
      entities = JSON.parse(this.decryptField(row.entities || '[]'));
    } catch {
      entities = [];
    }

    let commitments: Commitment[] | undefined;
    if (row.commitments) {
      try {
        commitments = JSON.parse(this.decryptField(row.commitments));
      } catch {
        commitments = undefined;
      }
    }

    let skillSignals: SkillSignal[] | undefined;
    if (row.skill_signals) {
      try {
        skillSignals = JSON.parse(row.skill_signals);
      } catch {
        skillSignals = undefined;
      }
    }

    return {
      id: row.id,
      timestamp: row.timestamp,
      eventType: row.event_type as ContextEventType,
      source: {
        application: row.source_application,
        windowTitle: row.source_window_title || '',
        url: row.source_url || undefined,
        filePath: row.source_file_path || undefined,
      },
      semanticPayload: {
        summary: this.decryptField(row.summary || ''),
        entities,
        intent: row.intent || undefined,
        commitments,
        skillSignals,
      },
      confidence: row.confidence || 0.5,
      privacyLevel: row.privacy_level || 'sync_allowed',
      synced: row.synced === 1,
    };
  }

  // ============================================================================
  // Encryption Wrappers
  // ============================================================================

  private encryptField(value: string): string {
    if (!this.encryptionEnabled || !this.encryptionKey) return value;
    try {
      return encrypt(value, this.encryptionKey);
    } catch {
      return value;
    }
  }

  private decryptField(value: string): string {
    if (!this.encryptionEnabled || !this.encryptionKey) return value;
    try {
      return decrypt(value, this.encryptionKey);
    } catch {
      return value; // Return as-is if decryption fails (unencrypted data)
    }
  }
}
