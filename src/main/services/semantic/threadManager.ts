/**
 * Thread Manager — Stage 3 of the Semantic Foundation
 *
 * Groups related activity events into coherent work threads using
 * weighted similarity scoring:
 *   0.4 × entityOverlap + 0.2 × activityContinuity
 *   + 0.2 × temporalProximity + 0.2 × topicCoherence
 *
 * Thread lifecycle: ACTIVE → PAUSED (2h) → COMPLETED/ABANDONED (8h)
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { ContextEvent } from '../../../deep-context/types';
import type {
  Entity,
  SemanticActivity,
  SemanticThread,
  ActivityType,
  ThreadStatus,
} from './types';
import {
  insertThread,
  updateThread,
  getActiveThreads,
  addEventToThread,
  getThreadEvents,
  insertThreadTransition,
  getEntitiesForEvent,
} from '../../db/queries';

// ============================================================================
// Constants
// ============================================================================

/** Score threshold for auto-assigning to an existing thread */
const ASSIGN_THRESHOLD = 0.5;

/** Hours of inactivity before a thread is paused */
const PAUSE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Hours of inactivity before a paused thread is abandoned */
const ABANDON_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours

/** Max active threads in memory */
const MAX_ACTIVE_THREADS = 20;

/** Related activity type pairs that score 0.5 for continuity */
const RELATED_PAIRS: [ActivityType, ActivityType][] = [
  ['BUILDING', 'INVESTIGATING'],
  ['COMMUNICATING', 'ORGANIZING'],
  ['BUILDING', 'OPERATING'],
  ['INVESTIGATING', 'ORGANIZING'],
];

// ============================================================================
// Types
// ============================================================================

interface ActiveThread {
  thread: SemanticThread;
  entityIds: Set<string>;
  titleTokens: Set<string>;
  recentEventCount: number; // events added since last intent classification
}

// ============================================================================
// ThreadManager
// ============================================================================

export class ThreadManager extends EventEmitter {
  private activeThreads: Map<string, ActiveThread> = new Map();
  private lastThreadId: string | null = null;
  private isStarted: boolean = false;

  async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;

    // Load active threads from DB
    const threads = getActiveThreads();
    for (const thread of threads) {
      const entityIds = new Set(thread.primaryEntities || []);
      const titleTokens = this.tokenize(thread.title || '');
      this.activeThreads.set(thread.threadId, {
        thread,
        entityIds,
        titleTokens,
        recentEventCount: thread.eventCount >= 5 ? 5 : thread.eventCount,
      });
    }

    // Run lifecycle check on load (pause/abandon stale threads)
    this.runLifecycleCheck();

    console.log(`[thread-manager] Started with ${this.activeThreads.size} active threads`);
  }

  stop(): void {
    if (!this.isStarted) return;
    this.isStarted = false;
    this.activeThreads.clear();
    console.log('[thread-manager] Stopped');
  }

  // ============================================================================
  // Core: Thread Assignment
  // ============================================================================

  /**
   * Assign an event + its activity to the best matching thread, or create a new one.
   */
  assignToThread(
    event: ContextEvent,
    entities: Entity[],
    activity: SemanticActivity,
  ): SemanticThread {
    if (!this.isStarted) {
      return this.createThread(event, entities, activity);
    }

    const eventEntityIds = new Set(entities.map(e => e.entityId));
    const eventTitleTokens = this.tokenize(event.source.windowTitle || '');
    const eventTime = event.timestamp;

    let bestThread: ActiveThread | null = null;
    let bestScore = 0;

    for (const active of this.activeThreads.values()) {
      const score = this.computeSimilarity(
        eventEntityIds,
        activity.activityType,
        eventTime,
        eventTitleTokens,
        active,
      );
      if (score > bestScore) {
        bestScore = score;
        bestThread = active;
      }
    }

    if (bestScore >= ASSIGN_THRESHOLD && bestThread) {
      return this.addToThread(bestThread, event, entities, activity);
    }

    return this.createThread(event, entities, activity);
  }

  /**
   * Get threads that received 5+ new events since last intent classification.
   */
  getThreadsNeedingIntentClassification(): SemanticThread[] {
    const result: SemanticThread[] = [];
    for (const active of this.activeThreads.values()) {
      if (active.recentEventCount >= 5) {
        result.push(active.thread);
      }
    }
    return result;
  }

  /**
   * Reset the recent event counter after intent classification.
   */
  markIntentClassified(threadId: string): void {
    const active = this.activeThreads.get(threadId);
    if (active) {
      active.recentEventCount = 0;
    }
  }

  /**
   * Run lifecycle management: pause inactive threads, abandon old paused ones.
   */
  runLifecycleCheck(): void {
    const now = Date.now();

    for (const [threadId, active] of this.activeThreads) {
      const gap = now - active.thread.lastActivityAt;

      if (gap > ABANDON_TIMEOUT_MS) {
        // Abandon
        updateThread(threadId, { status: 'abandoned' as ThreadStatus });
        this.activeThreads.delete(threadId);
        console.log(`[thread-manager] Abandoned thread: ${active.thread.title || threadId}`);
      } else if (gap > PAUSE_TIMEOUT_MS) {
        // Pause
        updateThread(threadId, { status: 'paused' as ThreadStatus });
        this.activeThreads.delete(threadId);

        // Record transition if there was a previous active thread
        if (this.lastThreadId && this.lastThreadId !== threadId) {
          try {
            insertThreadTransition({
              fromThreadId: this.lastThreadId,
              toThreadId: threadId,
              transitionType: 'switch',
              timestamp: now,
              createdAt: now,
            });
          } catch {
            // Transition may fail if from thread was deleted
          }
        }

        console.log(`[thread-manager] Paused thread: ${active.thread.title || threadId}`);
      }
    }
  }

  // ============================================================================
  // Similarity Scoring
  // ============================================================================

  private computeSimilarity(
    eventEntityIds: Set<string>,
    activityType: ActivityType,
    eventTime: number,
    eventTitleTokens: Set<string>,
    thread: ActiveThread,
  ): number {
    const entityOverlap = this.jaccardSimilarity(eventEntityIds, thread.entityIds);
    const activityContinuity = this.activityContinuityScore(activityType, thread.thread.primaryActivityType);
    const temporalProximity = this.temporalProximityScore(eventTime, thread.thread.lastActivityAt);
    const topicCoherence = this.jaccardSimilarity(eventTitleTokens, thread.titleTokens);

    return (
      0.4 * entityOverlap +
      0.2 * activityContinuity +
      0.2 * temporalProximity +
      0.2 * topicCoherence
    );
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let intersection = 0;
    for (const item of a) {
      if (b.has(item)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  private activityContinuityScore(
    current: ActivityType,
    threadPrimary: ActivityType | null,
  ): number {
    if (!threadPrimary) return 0.3; // No primary yet — slight affinity
    if (current === threadPrimary) return 1.0;

    // Check related pairs
    for (const [a, b] of RELATED_PAIRS) {
      if ((current === a && threadPrimary === b) || (current === b && threadPrimary === a)) {
        return 0.5;
      }
    }

    return 0.0;
  }

  private temporalProximityScore(eventTime: number, lastActivity: number): number {
    const gapMinutes = (eventTime - lastActivity) / 60_000;
    if (gapMinutes < 0) return 1.0; // Event before thread? Full proximity.
    return Math.exp(-gapMinutes / 30); // 30-min half-life
  }

  // ============================================================================
  // Thread Creation & Update
  // ============================================================================

  private createThread(
    event: ContextEvent,
    entities: Entity[],
    activity: SemanticActivity,
  ): SemanticThread {
    const now = Date.now();
    const threadId = randomUUID();
    const entityIds = entities.map(e => e.entityId);

    // Generate a simple title from window title + app
    const title = this.generateTitle(event, entities);

    const thread: Omit<SemanticThread, 'id'> = {
      threadId,
      title,
      status: 'active',
      startedAt: event.timestamp,
      lastActivityAt: event.timestamp,
      eventCount: 1,
      primaryEntities: entityIds,
      primaryActivityType: activity.activityType,
      metadata: {},
      privacyLevel: event.privacyLevel || 'sync_allowed',
      synced: false,
      createdAt: now,
      updatedAt: now,
    };

    insertThread(thread);

    // Link event to thread
    const eventId = event.id ? String(event.id) : activity.eventId;
    addEventToThread({
      threadId,
      eventId,
      relevanceScore: 1.0,
      addedAt: now,
    });

    const fullThread = { ...thread, id: 0 } as SemanticThread;

    // Enforce max active threads
    this.enforceMaxThreads();

    // Add to in-memory map
    this.activeThreads.set(threadId, {
      thread: fullThread,
      entityIds: new Set(entityIds),
      titleTokens: this.tokenize(title || ''),
      recentEventCount: 1,
    });

    // Record thread switch
    if (this.lastThreadId && this.lastThreadId !== threadId) {
      try {
        insertThreadTransition({
          fromThreadId: this.lastThreadId,
          toThreadId: threadId,
          transitionType: 'switch',
          timestamp: now,
          createdAt: now,
        });
      } catch {
        // Ignore transition failures
      }
    }
    this.lastThreadId = threadId;

    this.emit('thread-assigned', { thread: fullThread, event, isNew: true });
    console.log(`[thread-manager] New thread: "${title}" (${threadId.slice(0, 8)})`);

    return fullThread;
  }

  private addToThread(
    active: ActiveThread,
    event: ContextEvent,
    entities: Entity[],
    activity: SemanticActivity,
  ): SemanticThread {
    const now = Date.now();
    const threadId = active.thread.threadId;
    const eventId = event.id ? String(event.id) : activity.eventId;

    // Link event
    addEventToThread({
      threadId,
      eventId,
      relevanceScore: 0.8,
      addedAt: now,
    });

    // Update entities
    for (const entity of entities) {
      active.entityIds.add(entity.entityId);
    }
    const entityArray = Array.from(active.entityIds);

    // Recompute dominant activity type
    const primaryActivityType = activity.activityType;

    // Update DB
    const newCount = active.thread.eventCount + 1;
    updateThread(threadId, {
      lastActivityAt: event.timestamp,
      eventCount: newCount,
      primaryEntities: entityArray,
      primaryActivityType,
    });

    // Update in-memory
    active.thread.lastActivityAt = event.timestamp;
    active.thread.eventCount = newCount;
    active.thread.primaryEntities = entityArray;
    active.thread.primaryActivityType = primaryActivityType;
    active.recentEventCount++;

    // Update title tokens from new window title
    const newTokens = this.tokenize(event.source.windowTitle || '');
    for (const token of newTokens) {
      active.titleTokens.add(token);
    }

    // Record thread switch if different from last
    if (this.lastThreadId && this.lastThreadId !== threadId) {
      try {
        insertThreadTransition({
          fromThreadId: this.lastThreadId,
          toThreadId: threadId,
          transitionType: 'switch',
          timestamp: now,
          createdAt: now,
        });
      } catch {
        // Ignore
      }
    }
    this.lastThreadId = threadId;

    this.emit('thread-assigned', { thread: active.thread, event, isNew: false });
    return active.thread;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private generateTitle(event: ContextEvent, entities: Entity[]): string {
    const app = event.source.application || '';
    const windowTitle = event.source.windowTitle || '';

    // Try to extract a meaningful project/file name from window title
    const titleParts = windowTitle
      .replace(/[—–\-|]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && w.length < 30)
      .slice(0, 3);

    if (titleParts.length > 0) {
      return titleParts.join(' ');
    }

    // Fallback: app name + first entity
    const entityName = entities.length > 0 ? entities[0].name : '';
    if (entityName) {
      return `${app} — ${entityName}`;
    }

    return app || 'Unknown Thread';
  }

  private tokenize(text: string): Set<string> {
    if (!text) return new Set();
    // Lowercase, split on non-alphanumeric, filter short/common words
    const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'has', 'not']);
    return new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(w => w.length > 2 && !stopWords.has(w))
    );
  }

  private enforceMaxThreads(): void {
    if (this.activeThreads.size < MAX_ACTIVE_THREADS) return;

    // Find oldest thread by lastActivityAt and pause it
    let oldest: ActiveThread | null = null;
    for (const active of this.activeThreads.values()) {
      if (!oldest || active.thread.lastActivityAt < oldest.thread.lastActivityAt) {
        oldest = active;
      }
    }

    if (oldest) {
      updateThread(oldest.thread.threadId, { status: 'paused' as ThreadStatus });
      this.activeThreads.delete(oldest.thread.threadId);
      console.log(`[thread-manager] Paused oldest thread to enforce max: ${oldest.thread.title}`);
    }
  }
}
