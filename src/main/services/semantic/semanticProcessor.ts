/**
 * Semantic Processor — Stage 2 of the Semantic Foundation
 *
 * Classifies context events into the activity taxonomy using:
 * 1. Rule engine (fast, handles ~70% of cases)
 * 2. MLX refinement via NotchBridge (for medium-confidence results)
 *
 * Also records activity transitions when the activity type changes.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { ContextEvent } from '../../../deep-context/types';
import type { NotchBridge } from '../notchBridge';
import type { EntityRegistry } from './entityRegistry';
import type { ThreadManager } from './threadManager';
import type { IntentClassifier } from './intentClassifier';
import type {
  ActivityType,
  ActivitySubtype,
  ActivityClassification,
  SemanticActivity,
  ClassificationMethod,
} from './types';
import {
  insertSemanticActivity,
  insertActivityTransition,
  getActivitiesByTimeRange,
  getSyncMetadata,
  setSyncMetadata,
} from '../../db/queries';
import { ActivityRuleEngine } from './activityRuleEngine';

// ============================================================================
// Constants
// ============================================================================

/** Confidence threshold — above this we trust rule engine alone */
const HIGH_CONFIDENCE_THRESHOLD = 0.70;

/** Below this we don't bother with MLX, just use rule result as-is */
const LOW_CONFIDENCE_THRESHOLD = 0.40;

/** Timeout for waiting on MLX result (ms) */
const MLX_TIMEOUT_MS = 5000;

/** Max stale pending requests before cleanup (30s) */
const STALE_REQUEST_MS = 30000;

// ============================================================================
// Types
// ============================================================================

interface PendingClassification {
  event: ContextEvent;
  ruleResult: ActivityClassification;
  timestamp: number;
  resolve: (result: ActivityClassification) => void;
}

interface MLXSemanticResult {
  requestId: string;
  task: string;
  activityType: string;
  activitySubtype: string | null;
  confidence: number;
  latencyMs?: number;
}

// ============================================================================
// SemanticProcessor
// ============================================================================

export class SemanticProcessor extends EventEmitter {
  private ruleEngine: ActivityRuleEngine;
  private entityRegistry: EntityRegistry | null;
  private notchBridge: NotchBridge | null;
  private threadManager: ThreadManager | null = null;
  private intentClassifier: IntentClassifier | null = null;
  private pending: Map<string, PendingClassification> = new Map();
  private lastActivityId: string | null = null;
  private lastActivityTime: number = 0;
  private isStarted: boolean = false;
  private mlxTimeoutCount: number = 0;
  private mlxPausedUntil: number = 0;

  private semanticResultHandler: ((result: MLXSemanticResult) => void) | null = null;

  constructor(entityRegistry?: EntityRegistry, notchBridge?: NotchBridge) {
    super();
    this.ruleEngine = new ActivityRuleEngine();
    this.entityRegistry = entityRegistry || null;
    this.notchBridge = notchBridge || null;
  }

  setThreadManager(tm: ThreadManager): void {
    this.threadManager = tm;
  }

  setIntentClassifier(ic: IntentClassifier): void {
    this.intentClassifier = ic;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;

    // Listen for MLX semantic results from NotchBridge
    if (this.notchBridge) {
      this.semanticResultHandler = (result: MLXSemanticResult) => {
        this.handleMLXResult(result);
      };
      this.notchBridge.on('semantic_result', this.semanticResultHandler);
    }

    console.log('[semantic-processor] Started');
  }

  stop(): void {
    if (!this.isStarted) return;
    this.isStarted = false;

    // Unsubscribe from NotchBridge
    if (this.notchBridge && this.semanticResultHandler) {
      this.notchBridge.removeListener('semantic_result', this.semanticResultHandler);
      this.semanticResultHandler = null;
    }

    // Resolve any pending classifications with rule results
    for (const [, pending] of this.pending) {
      pending.resolve(pending.ruleResult);
    }
    this.pending.clear();

    console.log('[semantic-processor] Stopped');
  }

  // ============================================================================
  // Core Processing
  // ============================================================================

  /**
   * Process a single context event: classify and persist.
   * Called for each incoming event from DeepContextEngine.
   */
  async processEvent(event: ContextEvent): Promise<SemanticActivity | null> {
    if (!this.isStarted) return null;

    try {
      // 1. Classify via rule engine
      const ruleResult = this.ruleEngine.classify(event);

      // 2. Determine if MLX refinement is needed
      let finalResult: ActivityClassification;

      if (ruleResult.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
        // Good enough — use rule result directly
        finalResult = ruleResult;
      } else if (
        ruleResult.confidence >= LOW_CONFIDENCE_THRESHOLD &&
        this.canUseMLX()
      ) {
        // Medium confidence — try MLX refinement
        finalResult = await this.classifyWithMLX(event, ruleResult);
      } else {
        // Low confidence or MLX unavailable — use rule result as-is
        finalResult = ruleResult;
      }

      // 3. Persist the activity
      const activity = this.persistActivity(event, finalResult);

      // 4. Record transition if activity type changed
      this.recordTransition(activity);

      // 5. Extract entities (needed for both entity table and thread assignment)
      let entities: any[] = [];
      if (this.entityRegistry) {
        try {
          entities = this.entityRegistry.extractAndResolve(event);
        } catch (err) {
          // Fall back to last extracted if extraction fails
          entities = this.entityRegistry.getLastExtractedEntities();
        }
      }

      // 6. Assign to thread
      if (this.threadManager) {
        try {
          this.threadManager.assignToThread(event, entities, activity);
        } catch (err) {
          console.error('[semantic-processor] Thread assignment failed:', err);
        }
      }

      // 7. Emit event
      this.emit('activity-classified', activity);

      return activity;
    } catch (error) {
      console.error('[semantic-processor] processEvent failed:', error);
      return null;
    }
  }

  /**
   * Process recent unprocessed events (called by scheduler every 60s).
   */
  async processRecentEvents(): Promise<void> {
    if (!this.isStarted) return;

    const now = Date.now();
    const lastCycleStr = getSyncMetadata('last_semantic_cycle');
    const parsed = lastCycleStr ? parseInt(lastCycleStr, 10) : NaN;
    const lastCycle = Number.isFinite(parsed) ? parsed : now - 120_000; // Default: last 2 minutes

    // Get events that have already been classified in this time range
    const existingActivities = getActivitiesByTimeRange(lastCycle, now);
    const processedEventIds = new Set(existingActivities.map(a => a.eventId));

    // Get unprocessed context events from the deep context store
    // We access them via the database since they're stored there
    let unprocessedEvents: ContextEvent[];
    try {
      const { getDatabase } = await import('../../db/database');
      const db = getDatabase();
      const rows = db.prepare(`
        SELECT id, timestamp, event_type as eventType,
          source_application as sourceApp, source_window_title as sourceWindow,
          source_url as sourceUrl, source_file_path as sourceFile,
          summary, entities, intent, commitments, skill_signals as skillSignals,
          confidence, privacy_level as privacyLevel, synced
        FROM context_events
        WHERE timestamp >= ? AND timestamp < ?
        ORDER BY timestamp ASC
      `).all(lastCycle, now) as any[];

      unprocessedEvents = rows
        .filter(row => !processedEventIds.has(String(row.id)))
        .map(row => {
          // Parse JSON fields safely
          let entities: string[] = [];
          try { entities = JSON.parse(row.entities || '[]'); } catch { /* not JSON */ }
          let commitments: any[] = [];
          try { commitments = JSON.parse(row.commitments || '[]'); } catch { /* not JSON */ }
          let skillSignals: any[] = [];
          try { skillSignals = JSON.parse(row.skillSignals || '[]'); } catch { /* not JSON */ }

          return {
            id: row.id,
            timestamp: row.timestamp,
            eventType: row.eventType,
            source: {
              application: row.sourceApp || '',
              windowTitle: row.sourceWindow || '',
              url: row.sourceUrl || undefined,
              filePath: row.sourceFile || undefined,
            },
            semanticPayload: {
              summary: row.summary || '',
              entities,
              intent: row.intent || undefined,
              commitments,
              skillSignals,
            },
            confidence: row.confidence,
            privacyLevel: row.privacyLevel || 'sync_allowed',
            synced: row.synced === 1,
          };
        });
    } catch (err) {
      console.error('[semantic-processor] Failed to query context_events:', err);
      unprocessedEvents = [];
    }

    // Fallback: if context_events is empty, synthesize from activity_logs
    // This ensures the semantic pipeline produces output even when the
    // accessibility capture service is not working (permission issues, etc.)
    if (unprocessedEvents.length === 0) {
      try {
        const { getDatabase } = await import('../../db/database');
        const db = getDatabase();
        // Group consecutive same-app entries to avoid processing duplicates
        const activityRows = db.prepare(`
          SELECT MIN(id) as id, MIN(timestamp) as timestamp,
                 app_name, window_title, url,
                 SUM(duration_seconds) as total_duration,
                 COUNT(*) as entry_count
          FROM activity_logs
          WHERE timestamp >= ? AND timestamp < ?
          GROUP BY app_name, window_title
          ORDER BY MIN(timestamp) ASC
        `).all(lastCycle, now) as any[];

        if (activityRows.length > 0) {
          console.log(`[semantic-processor] No context_events found, synthesizing ${activityRows.length} grouped events from activity_logs`);
          for (const row of activityRows) {
            const syntheticId = `activity_${row.id}`;
            if (processedEventIds.has(syntheticId)) continue;

            const syntheticEvent: ContextEvent = {
              id: row.id,
              timestamp: typeof row.timestamp === 'string' ? new Date(row.timestamp).getTime() : row.timestamp,
              eventType: 'document_interaction',
              source: {
                application: row.app_name || '',
                windowTitle: row.window_title || '',
                url: row.url || undefined,
              },
              semanticPayload: {
                summary: `Using ${row.app_name || 'application'}: ${(row.window_title || '').substring(0, 80)}`,
                entities: [],
              },
              confidence: 0.6,
              privacyLevel: 'sync_allowed',
              synced: false,
            };
            unprocessedEvents.push(syntheticEvent);
          }
        }
      } catch (err) {
        console.error('[semantic-processor] Fallback activity_logs query failed:', err);
      }
    }

    if (unprocessedEvents.length === 0) {
      setSyncMetadata('last_semantic_cycle', String(now));
      return;
    }

    console.log(`[semantic-processor] Processing ${unprocessedEvents.length} events from cycle`);

    let processed = 0;
    for (const event of unprocessedEvents) {
      const result = await this.processEvent(event);
      if (result) processed++;
    }

    // Update cycle timestamp
    setSyncMetadata('last_semantic_cycle', String(now));

    // Classify intents for threads with enough new events (BEFORE lifecycle check
    // so threads aren't paused/removed from memory before classification runs)
    if (this.intentClassifier) {
      try {
        await this.intentClassifier.classifyUpdatedThreads();
      } catch (err) {
        console.error('[semantic-processor] Intent classification failed:', err);
      }
    }

    // Run thread lifecycle check (pause/abandon stale threads)
    if (this.threadManager) {
      this.threadManager.runLifecycleCheck();
    }

    // DB retroactive pass: classify threads that were paused before
    // in-memory intent classification could run
    if (this.intentClassifier) {
      try {
        await this.intentClassifier.classifyThreadsFromDB();
      } catch (err) {
        console.error('[semantic-processor] DB retroactive intent classification failed:', err);
      }
    }

    // Cleanup stale pending MLX requests
    this.cleanupStalePending();

    console.log(`[semantic-processor] Cycle complete: ${processed}/${unprocessedEvents.length} classified`);
    this.emit('semantic-cycle-complete', { processed, total: unprocessedEvents.length });
  }

  // ============================================================================
  // MLX Integration
  // ============================================================================

  private canUseMLX(): boolean {
    if (!this.notchBridge?.running) return false;
    if (Date.now() < this.mlxPausedUntil) return false;
    return true;
  }

  private classifyWithMLX(
    event: ContextEvent,
    ruleResult: ActivityClassification,
  ): Promise<ActivityClassification> {
    return new Promise<ActivityClassification>((resolve) => {
      const requestId = randomUUID();

      // Store pending request
      this.pending.set(requestId, {
        event,
        ruleResult,
        timestamp: Date.now(),
        resolve,
      });

      // Send to MLX via NotchBridge
      this.notchBridge!.sendSemanticClassify(requestId, event, ruleResult);

      // Timeout: fall back to rule result
      setTimeout(() => {
        const pending = this.pending.get(requestId);
        if (pending) {
          this.pending.delete(requestId);
          this.mlxTimeoutCount++;

          // After 3 consecutive timeouts, pause MLX for 5 minutes
          if (this.mlxTimeoutCount >= 3) {
            console.warn('[semantic-processor] 3 MLX timeouts, pausing for 5 minutes');
            this.mlxPausedUntil = Date.now() + 5 * 60 * 1000;
            this.mlxTimeoutCount = 0;
          }

          resolve(ruleResult);
        }
      }, MLX_TIMEOUT_MS);
    });
  }

  private handleMLXResult(result: MLXSemanticResult): void {
    const pending = this.pending.get(result.requestId);
    if (!pending) return; // Already timed out or unknown request

    this.pending.delete(result.requestId);
    this.mlxTimeoutCount = 0; // Reset timeout counter on success

    // Validate the MLX result
    const validTypes: ActivityType[] = [
      'BUILDING', 'INVESTIGATING', 'COMMUNICATING',
      'ORGANIZING', 'OPERATING', 'CONTEXT_SWITCHING',
    ];

    if (!validTypes.includes(result.activityType as ActivityType)) {
      // Invalid result — use rule result
      pending.resolve(pending.ruleResult);
      return;
    }

    // Take the higher-confidence result
    const mlxConfidence = result.confidence || 0.5;
    if (mlxConfidence > pending.ruleResult.confidence) {
      pending.resolve({
        activityType: result.activityType as ActivityType,
        activitySubtype: (result.activitySubtype as ActivitySubtype) || null,
        confidence: mlxConfidence,
        method: 'hybrid',
      });
    } else {
      pending.resolve({
        ...pending.ruleResult,
        method: 'hybrid', // Still mark as hybrid since we consulted MLX
      });
    }
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  private persistActivity(
    event: ContextEvent,
    classification: ActivityClassification,
  ): SemanticActivity {
    const now = Date.now();
    const activityId = randomUUID();
    const eventId = event.id ? String(event.id) : randomUUID();

    const activity: Omit<SemanticActivity, 'id'> = {
      activityId,
      eventId,
      activityType: classification.activityType,
      activitySubtype: classification.activitySubtype,
      confidence: classification.confidence,
      classificationMethod: classification.method,
      durationMs: null,
      metadata: {
        application: event.source.application,
        windowTitle: event.source.windowTitle,
        url: event.source.url || undefined,
      },
      privacyLevel: event.privacyLevel || 'sync_allowed',
      synced: false,
      createdAt: now,
    };

    insertSemanticActivity(activity);
    return { ...activity, activityId } as SemanticActivity;
  }

  private recordTransition(activity: SemanticActivity): void {
    if (!this.lastActivityId) {
      this.lastActivityId = activity.activityId;
      this.lastActivityTime = activity.createdAt;
      return;
    }

    // Only record transition if activity type actually changed
    const now = activity.createdAt;
    const gap = now - this.lastActivityTime;

    // Skip if same activity happened less than 5 seconds ago (likely same event)
    if (gap < 5000) {
      this.lastActivityId = activity.activityId;
      this.lastActivityTime = now;
      return;
    }

    try {
      insertActivityTransition({
        fromActivityId: this.lastActivityId,
        toActivityId: activity.activityId,
        transitionTime: now,
        gapMs: gap,
        createdAt: now,
      });
    } catch {
      // Transition insert may fail if from_activity_id was cleaned up
    }

    this.lastActivityId = activity.activityId;
    this.lastActivityTime = now;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  private cleanupStalePending(): void {
    const now = Date.now();
    for (const [requestId, pending] of this.pending) {
      if (now - pending.timestamp > STALE_REQUEST_MS) {
        this.pending.delete(requestId);
        pending.resolve(pending.ruleResult);
      }
    }
  }
}
