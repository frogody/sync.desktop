/**
 * Action Service
 *
 * Coordinates the notch action approval system between the local
 * Swift MLX classifier (via NotchBridge) and the cloud (Supabase).
 *
 * Responsibilities:
 * - Manages local SQLite `local_actions` table for offline tracking
 * - Listens for action events from NotchBridge (MLX detections, user approvals/dismissals)
 * - POSTs to analyze-action / execute-action edge functions
 * - Subscribes to Supabase Realtime for pending_actions updates
 * - Handles deduplication, acknowledgment, and fallback polling
 * - Cleans up expired actions
 */

import crypto from 'crypto';
import WebSocket from 'ws';
import { getDatabase } from '../db/database';
import { getAccessToken, getUser } from '../store';
import { refreshAccessToken } from './authUtils';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../shared/constants';
import type { NotchBridge, DetectedAction } from './notchBridge';
import type Database from 'better-sqlite3';

// ============================================================================
// Types
// ============================================================================

interface LocalAction {
  action_id: string;
  event_hash: string;
  status: string;
  local_title: string;
  cloud_title: string | null;
  action_type: string;
  local_payload: string | null;
  confidence: number | null;
  synced: number;
  created_at: string;
  resolved_at: string | null;
}

interface ActionServiceStatus {
  running: boolean;
  localActionCount: number;
  pendingSyncCount: number;
  realtimeConnected: boolean;
}

// ============================================================================
// Action Service Class
// ============================================================================

export class ActionService {
  private notchBridge: NotchBridge | null = null;
  private realtimeWs: WebSocket | null = null;
  private realtimeConnected: boolean = false;
  private running: boolean = false;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private pendingAckTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private realtimeHeartbeat: ReturnType<typeof setInterval> | null = null;

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(notchBridge: NotchBridge): void {
    if (this.running) return;

    this.notchBridge = notchBridge;
    this.running = true;

    console.log('[action-service] Starting...');

    // Ensure local_actions table exists
    this.ensureTable();

    // Wire up NotchBridge events
    this.subscribeToNotchBridge();

    // Connect to Supabase Realtime
    this.connectRealtime();

    // Periodic cleanup of old actions (every 30 minutes)
    this.cleanupInterval = setInterval(() => this.cleanupOldActions(), 30 * 60 * 1000);

    console.log('[action-service] Started');
  }

  stop(): void {
    if (!this.running) return;

    console.log('[action-service] Stopping...');
    this.running = false;

    // Unsubscribe from NotchBridge
    this.unsubscribeFromNotchBridge();

    // Disconnect Realtime
    this.disconnectRealtime();

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear pending ack timers
    for (const timer of this.pendingAckTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingAckTimers.clear();

    this.notchBridge = null;
    console.log('[action-service] Stopped');
  }

  getStatus(): ActionServiceStatus {
    const db = this.getDb();
    if (!db) {
      return { running: this.running, localActionCount: 0, pendingSyncCount: 0, realtimeConnected: this.realtimeConnected };
    }

    const totalRow = db.prepare('SELECT COUNT(*) as count FROM local_actions').get() as { count: number } | undefined;
    const unsyncedRow = db.prepare('SELECT COUNT(*) as count FROM local_actions WHERE synced = 0').get() as { count: number } | undefined;

    return {
      running: this.running,
      localActionCount: totalRow?.count ?? 0,
      pendingSyncCount: unsyncedRow?.count ?? 0,
      realtimeConnected: this.realtimeConnected,
    };
  }

  // ============================================================================
  // SQLite Table
  // ============================================================================

  private ensureTable(): void {
    const db = this.getDb();
    if (!db) return;

    db.exec(`
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
      )
    `);
  }

  private getDb(): Database.Database | null {
    try {
      return getDatabase();
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Event Hash Generation
  // ============================================================================

  private generateEventHash(eventType: string, sourceApp: string, summary: string): string {
    const timestampMinute = Math.floor(Date.now() / 60000);
    return crypto
      .createHash('sha256')
      .update(eventType + sourceApp + summary + timestampMinute)
      .digest('hex');
  }

  // ============================================================================
  // NotchBridge Event Handlers
  // ============================================================================

  private subscribeToNotchBridge(): void {
    if (!this.notchBridge) return;

    this.notchBridge.on('action_detected', this.onActionDetected);
    this.notchBridge.on('action_approved', this.onActionApproved);
    this.notchBridge.on('action_dismissed', this.onActionDismissed);
  }

  private unsubscribeFromNotchBridge(): void {
    if (!this.notchBridge) return;

    this.notchBridge.removeListener('action_detected', this.onActionDetected);
    this.notchBridge.removeListener('action_approved', this.onActionApproved);
    this.notchBridge.removeListener('action_dismissed', this.onActionDismissed);
  }

  private onActionDetected = (detected: DetectedAction): void => {
    const db = this.getDb();
    if (!db) return;

    const { id, eventHash, title, actionType, confidence, localPayload } = detected;

    // Dedup: check if event_hash already exists
    const existing = db.prepare('SELECT action_id FROM local_actions WHERE event_hash = ?').get(eventHash) as { action_id: string } | undefined;
    if (existing) {
      console.log('[action-service] Duplicate event_hash, skipping:', eventHash.substring(0, 12));
      return;
    }

    // Store locally
    db.prepare(`
      INSERT INTO local_actions (action_id, event_hash, status, local_title, action_type, local_payload, confidence)
      VALUES (?, ?, 'detected', ?, ?, ?, ?)
    `).run(id, eventHash, title, actionType, JSON.stringify(localPayload), confidence);

    console.log('[action-service] Action stored locally:', id, title);

    // POST to analyze-action edge function
    this.postAnalyzeAction(id, eventHash, title, actionType, confidence, localPayload);

    // Start fallback polling timer (10 seconds)
    this.startAckTimer(id);
  };

  private onActionApproved = (payload: { id: string }): void => {
    const { id } = payload;
    console.log('[action-service] Action approved by user:', id);

    // Update local status
    const db = this.getDb();
    if (db) {
      db.prepare(`UPDATE local_actions SET status = 'approved', resolved_at = datetime('now') WHERE action_id = ?`).run(id);
    }

    // POST to execute-action edge function
    this.postExecuteAction(id);
  };

  private onActionDismissed = (payload: { id: string }): void => {
    const { id } = payload;
    console.log('[action-service] Action dismissed by user:', id);

    // Update local status
    const db = this.getDb();
    if (db) {
      db.prepare(`UPDATE local_actions SET status = 'dismissed', resolved_at = datetime('now') WHERE action_id = ?`).run(id);
    }

    // Update cloud status
    this.patchActionStatus(id, 'dismissed');
  };

  // ============================================================================
  // Edge Function Calls
  // ============================================================================

  private async postAnalyzeAction(
    actionId: string,
    eventHash: string,
    localTitle: string,
    actionType: string,
    confidence: number,
    localPayload: Record<string, unknown>
  ): Promise<void> {
    const user = getUser();
    if (!user?.id || !user?.companyId) {
      console.error('[action-service] Cannot analyze action: user data incomplete');
      return;
    }

    try {
      const response = await this.supabaseFetch(
        '/functions/v1/analyze-action',
        'POST',
        {
          action_id: actionId,
          event_hash: eventHash,
          user_id: user.id,
          company_id: user.companyId,
          action_type: actionType,
          local_title: localTitle,
          local_confidence: confidence,
          trigger_context: localPayload,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[action-service] analyze-action failed:', response.status, errorText);
        return;
      }

      const result = await response.json();
      console.log('[action-service] analyze-action response:', result.status, result.title);

      // Update local record with cloud response
      const db = this.getDb();
      if (db && result.title) {
        db.prepare(`UPDATE local_actions SET cloud_title = ?, status = ?, synced = 1 WHERE action_id = ?`)
          .run(result.title, result.status || 'pending', actionId);
      }

      // Clear ack timer since we got a response
      this.clearAckTimer(actionId);

      // If cloud enriched the title, update the notch
      if (result.title && result.title !== localTitle && this.notchBridge) {
        this.notchBridge.sendAction({
          id: actionId,
          title: result.title,
          subtitle: result.subtitle || undefined,
          actionType,
        });
      }

      // If cloud invalidated the action, hide it
      if (result.status === 'invalidated' && this.notchBridge) {
        this.notchBridge.hideAction(actionId, result.status_message || 'Already done');
        const db2 = this.getDb();
        if (db2) {
          db2.prepare(`UPDATE local_actions SET status = 'invalidated', resolved_at = datetime('now') WHERE action_id = ?`).run(actionId);
        }
      }
    } catch (error) {
      console.error('[action-service] analyze-action error:', (error as Error).message);
    }
  }

  private async postExecuteAction(actionId: string): Promise<void> {
    const user = getUser();
    if (!user?.id) {
      console.error('[action-service] Cannot execute action: no user');
      return;
    }

    try {
      const response = await this.supabaseFetch(
        '/functions/v1/execute-action',
        'POST',
        {
          action_id: actionId,
          user_id: user.id,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[action-service] execute-action failed:', response.status, errorText);
        if (this.notchBridge) {
          this.notchBridge.sendActionResult(actionId, false, 'Execution failed');
        }
        return;
      }

      const result = await response.json();
      console.log('[action-service] execute-action result:', result.status);

      const success = result.status === 'completed';
      if (this.notchBridge) {
        this.notchBridge.sendActionResult(actionId, success, result.status_message || undefined);
      }

      // Update local status
      const db = this.getDb();
      if (db) {
        db.prepare(`UPDATE local_actions SET status = ?, resolved_at = datetime('now') WHERE action_id = ?`)
          .run(result.status || (success ? 'completed' : 'failed'), actionId);
      }
    } catch (error) {
      console.error('[action-service] execute-action error:', (error as Error).message);
      if (this.notchBridge) {
        this.notchBridge.sendActionResult(actionId, false, (error as Error).message);
      }
    }
  }

  private async patchActionStatus(actionId: string, status: string): Promise<void> {
    try {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/pending_actions?id=eq.${actionId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            status,
            resolved_at: new Date().toISOString(),
          }),
        }
      );

      if (!response.ok) {
        console.error('[action-service] patchActionStatus failed:', response.status);
      }
    } catch (error) {
      console.error('[action-service] patchActionStatus error:', (error as Error).message);
    }
  }

  // ============================================================================
  // HTTP Helper
  // ============================================================================

  private async supabaseFetch(
    path: string,
    method: string,
    body: Record<string, unknown>,
    isRetry: boolean = false
  ): Promise<Response> {
    let accessToken = getAccessToken();
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // Handle expired token — refresh once and retry
    if ((response.status === 401 || response.status === 403) && !isRetry) {
      console.log('[action-service] Token expired, refreshing...');
      const newToken = await refreshAccessToken();
      if (newToken) {
        return this.supabaseFetch(path, method, body, true);
      }
    }

    return response;
  }

  // ============================================================================
  // Acknowledgment + Fallback Polling
  // ============================================================================

  private startAckTimer(actionId: string): void {
    // If no Realtime ack within 10 seconds, poll via REST
    const timer = setTimeout(() => {
      this.pendingAckTimers.delete(actionId);
      this.pollActionStatus(actionId);
    }, 10000);

    this.pendingAckTimers.set(actionId, timer);
  }

  private clearAckTimer(actionId: string): void {
    const timer = this.pendingAckTimers.get(actionId);
    if (timer) {
      clearTimeout(timer);
      this.pendingAckTimers.delete(actionId);
    }
  }

  private async pollActionStatus(actionId: string): Promise<void> {
    console.log('[action-service] Fallback polling for action:', actionId);

    try {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/pending_actions?id=eq.${actionId}&select=id,title,status,status_message`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) return;

      const rows = await response.json();
      if (!rows || rows.length === 0) return;

      const row = rows[0];
      const db = this.getDb();
      if (!db) return;

      // Update local record
      db.prepare(`UPDATE local_actions SET synced = 1, cloud_title = COALESCE(?, cloud_title), status = ? WHERE action_id = ?`)
        .run(row.title, row.status, actionId);

      // Handle status changes
      this.handleCloudStatusChange(actionId, row.status, row.title, row.status_message);
    } catch (error) {
      console.error('[action-service] Fallback poll error:', (error as Error).message);
    }
  }

  // ============================================================================
  // Supabase Realtime
  // ============================================================================

  private connectRealtime(): void {
    const user = getUser();
    const accessToken = getAccessToken();
    if (!user?.id || !accessToken) {
      console.log('[action-service] Cannot connect Realtime: no auth');
      return;
    }

    const wsUrl = SUPABASE_URL.replace('https://', 'wss://');
    const realtimeUrl = `${wsUrl}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`;

    try {
      this.realtimeWs = new WebSocket(realtimeUrl);

      this.realtimeWs.onopen = () => {
        console.log('[action-service] Realtime WebSocket connected');
        this.realtimeConnected = true;

        // Join the pending_actions channel filtered by user_id
        const joinMsg = JSON.stringify({
          topic: `realtime:public:pending_actions:user_id=eq.${user.id}`,
          event: 'phx_join',
          payload: {
            config: {
              broadcast: { self: false },
              presence: { key: '' },
              postgres_changes: [
                {
                  event: '*',
                  schema: 'public',
                  table: 'pending_actions',
                  filter: `user_id=eq.${user.id}`,
                },
              ],
            },
            access_token: accessToken,
          },
          ref: '1',
        });

        this.realtimeWs?.send(joinMsg);

        // Start heartbeat every 30 seconds
        this.realtimeHeartbeat = setInterval(() => {
          if (this.realtimeWs?.readyState === WebSocket.OPEN) {
            this.realtimeWs.send(JSON.stringify({
              topic: 'phoenix',
              event: 'heartbeat',
              payload: {},
              ref: Date.now().toString(),
            }));
          }
        }, 30000);
      };

      this.realtimeWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          this.handleRealtimeMessage(msg);
        } catch {
          // Ignore parse errors
        }
      };

      this.realtimeWs.onclose = (event) => {
        console.log('[action-service] Realtime WebSocket closed:', event.code, event.reason);
        this.realtimeConnected = false;
        this.clearHeartbeat();

        // Reconnect after 5 seconds if still running
        if (this.running) {
          setTimeout(() => this.connectRealtime(), 5000);
        }
      };

      this.realtimeWs.onerror = (error) => {
        console.error('[action-service] Realtime WebSocket error');
        this.realtimeConnected = false;
      };
    } catch (error) {
      console.error('[action-service] Failed to connect Realtime:', (error as Error).message);
    }
  }

  private disconnectRealtime(): void {
    this.clearHeartbeat();

    if (this.realtimeWs) {
      this.realtimeWs.onclose = null; // Prevent reconnect
      this.realtimeWs.close();
      this.realtimeWs = null;
    }

    this.realtimeConnected = false;
  }

  private clearHeartbeat(): void {
    if (this.realtimeHeartbeat) {
      clearInterval(this.realtimeHeartbeat);
      this.realtimeHeartbeat = null;
    }
  }

  private handleRealtimeMessage(msg: any): void {
    // Supabase Realtime postgres_changes events
    if (msg.event === 'postgres_changes') {
      const payload = msg.payload;
      if (!payload?.data) return;

      const { type, record } = payload.data;

      if (type === 'INSERT') {
        this.handleRealtimeInsert(record);
      } else if (type === 'UPDATE') {
        this.handleRealtimeUpdate(record);
      }
    }
  }

  private handleRealtimeInsert(record: any): void {
    if (!record?.id) return;

    const actionId = record.id;
    const db = this.getDb();
    if (!db) return;

    // Check if this matches a local action
    const localAction = db.prepare('SELECT * FROM local_actions WHERE action_id = ?').get(actionId) as LocalAction | undefined;

    if (localAction) {
      // Mark as synced, update cloud_title if different
      const cloudTitle = record.title || localAction.local_title;
      db.prepare(`UPDATE local_actions SET synced = 1, cloud_title = ?, status = ? WHERE action_id = ?`)
        .run(cloudTitle, record.status || 'pending', actionId);

      // Clear ack timer
      this.clearAckTimer(actionId);

      // Update notch if cloud enriched the title
      if (cloudTitle !== localAction.local_title && this.notchBridge) {
        this.notchBridge.sendAction({
          id: actionId,
          title: cloudTitle,
          subtitle: record.subtitle || undefined,
          actionType: localAction.action_type,
        });
      }

      console.log('[action-service] Realtime INSERT synced for:', actionId);
    }
  }

  private handleRealtimeUpdate(record: any): void {
    if (!record?.id) return;

    const actionId = record.id;
    const status = record.status;

    console.log('[action-service] Realtime UPDATE:', actionId, 'status:', status);

    // Update local record
    const db = this.getDb();
    if (db) {
      db.prepare(`UPDATE local_actions SET status = ?, cloud_title = COALESCE(?, cloud_title) WHERE action_id = ?`)
        .run(status, record.title || null, actionId);
    }

    this.handleCloudStatusChange(actionId, status, record.title, record.status_message);
  }

  private handleCloudStatusChange(actionId: string, status: string, title?: string, statusMessage?: string): void {
    if (!this.notchBridge) return;

    switch (status) {
      case 'invalidated':
      case 'expired':
        this.notchBridge.hideAction(actionId, statusMessage || status);
        break;

      case 'completed':
        this.notchBridge.sendActionResult(actionId, true, statusMessage || 'Done');
        break;

      case 'failed':
        this.notchBridge.sendActionResult(actionId, false, statusMessage || 'Failed');
        break;

      case 'pending':
        // Cloud may have enriched the action — update notch
        if (title) {
          const db = this.getDb();
          const localAction = db?.prepare('SELECT action_type FROM local_actions WHERE action_id = ?').get(actionId) as { action_type: string } | undefined;
          if (localAction) {
            this.notchBridge.sendAction({
              id: actionId,
              title,
              actionType: localAction.action_type,
            });
          }
        }
        break;
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  private cleanupOldActions(): void {
    const db = this.getDb();
    if (!db) return;

    const result = db.prepare(`
      DELETE FROM local_actions
      WHERE created_at < datetime('now', '-24 hours')
    `).run();

    if (result.changes > 0) {
      console.log(`[action-service] Cleaned up ${result.changes} old local actions`);
    }
  }
}
