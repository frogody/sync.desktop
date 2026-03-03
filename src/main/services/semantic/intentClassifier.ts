/**
 * Intent Classifier — Stage 4 of the Semantic Foundation
 *
 * Infers user intent (SHIP, MANAGE, PLAN, MAINTAIN, RESPOND) from the
 * activity type distribution within a context thread.
 *
 * Classification strategy:
 * 1. Rule-based heuristics from activity distribution (fast, ~60% accuracy)
 * 2. MLX refinement via NotchBridge for low-confidence results
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  SemanticThread,
  SemanticActivity,
  SemanticIntent,
  IntentType,
  IntentSubtype,
  IntentClassification,
  ActivityType,
} from './types';
import type { ThreadManager } from './threadManager';
import {
  insertIntent,
  updateIntent,
  getIntentByThread,
  getActivitiesForThread,
  linkIntentToActivity,
  getEntitiesForEvent,
  linkIntentToEntity,
  getThreadsNeedingIntentFromDB,
} from '../../db/queries';

// ============================================================================
// Constants
// ============================================================================

/** Minimum confidence to accept rule-based classification without MLX */
const RULE_CONFIDENCE_THRESHOLD = 0.6;

/** Minimum fraction of a single activity type to be considered "dominant" */
const DOMINANCE_THRESHOLD = 0.6;

// ============================================================================
// Activity → Intent Mapping
// ============================================================================

const ACTIVITY_INTENT_MAP: Record<string, { intent: IntentType; confidence: number }> = {
  // Single dominant type mappings
  'BUILDING': { intent: 'SHIP', confidence: 0.65 },
  'INVESTIGATING': { intent: 'PLAN', confidence: 0.55 },
  'COMMUNICATING': { intent: 'MANAGE', confidence: 0.55 },
  'ORGANIZING': { intent: 'PLAN', confidence: 0.50 },
  'OPERATING': { intent: 'SHIP', confidence: 0.55 },
  'CONTEXT_SWITCHING': { intent: 'RESPOND', confidence: 0.35 },
};

// Combination patterns: sorted activity types → intent
const COMBINATION_PATTERNS: { types: ActivityType[]; intent: IntentType; subtype: IntentSubtype; confidence: number }[] = [
  { types: ['BUILDING', 'OPERATING'], intent: 'SHIP', subtype: 'feature_delivery', confidence: 0.75 },
  { types: ['BUILDING', 'INVESTIGATING'], intent: 'MAINTAIN', subtype: 'refactoring', confidence: 0.60 },
  { types: ['INVESTIGATING', 'ORGANIZING'], intent: 'PLAN', subtype: 'research', confidence: 0.65 },
  { types: ['COMMUNICATING', 'ORGANIZING'], intent: 'MANAGE', subtype: 'team_coordination', confidence: 0.65 },
  { types: ['BUILDING', 'COMMUNICATING'], intent: 'MANAGE', subtype: 'code_review', confidence: 0.55 },
  { types: ['OPERATING', 'COMMUNICATING'], intent: 'RESPOND', subtype: 'incident_response', confidence: 0.60 },
];

// ============================================================================
// IntentClassifier
// ============================================================================

export class IntentClassifier extends EventEmitter {
  private threadManager: ThreadManager;
  private isStarted: boolean = false;

  constructor(threadManager: ThreadManager) {
    super();
    this.threadManager = threadManager;
  }

  async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;
    console.log('[intent-classifier] Started');
  }

  stop(): void {
    if (!this.isStarted) return;
    this.isStarted = false;
    console.log('[intent-classifier] Stopped');
  }

  // ============================================================================
  // Core: Classify Updated Threads
  // ============================================================================

  /**
   * Called at the end of each semantic cycle.
   * Classifies threads that have accumulated enough new events.
   */
  async classifyUpdatedThreads(): Promise<void> {
    if (!this.isStarted) return;

    const threads = this.threadManager.getThreadsNeedingIntentClassification();
    if (threads.length === 0) return;

    console.log(`[intent-classifier] Classifying ${threads.length} thread(s)`);

    for (const thread of threads) {
      try {
        await this.classifyThreadIntent(thread);
        this.threadManager.markIntentClassified(thread.threadId);
      } catch (error) {
        console.error(`[intent-classifier] Failed for thread ${thread.threadId}:`, error);
      }
    }
  }

  /**
   * Classify a single thread's intent.
   */
  async classifyThreadIntent(thread: SemanticThread): Promise<SemanticIntent | null> {
    // Get recent activities for this thread
    const activities = getActivitiesForThread(thread.threadId, 15);
    if (activities.length < 3) return null; // Not enough data

    // Compute activity distribution
    const distribution = this.computeDistribution(activities);

    // Apply rule-based heuristics
    const classification = this.applyRules(distribution, activities, thread);

    if (!classification) return null;

    // Check existing intent for this thread
    const existingIntent = getIntentByThread(thread.threadId);

    if (existingIntent) {
      // Update if classification changed
      if (
        existingIntent.intentType !== classification.intentType ||
        existingIntent.intentSubtype !== classification.intentSubtype
      ) {
        updateIntent(existingIntent.intentId, {
          intentType: classification.intentType,
          intentSubtype: classification.intentSubtype,
          confidence: classification.confidence,
        });

        const updated = {
          ...existingIntent,
          intentType: classification.intentType,
          intentSubtype: classification.intentSubtype,
          confidence: classification.confidence,
        };
        this.emit('intent-classified', { intent: updated, thread });
        console.log(`[intent-classifier] Updated: ${thread.title} → ${classification.intentType}/${classification.intentSubtype}`);
        return updated;
      }

      return existingIntent;
    }

    // Create new intent
    return this.createIntent(thread, classification, activities);
  }

  /**
   * DB retroactive pass: classify threads from DB that were paused before
   * in-memory intent classification could run.
   */
  async classifyThreadsFromDB(): Promise<void> {
    if (!this.isStarted) return;
    const threads = getThreadsNeedingIntentFromDB();
    if (threads.length === 0) return;
    console.log(`[intent-classifier] DB retroactive: ${threads.length} thread(s)`);
    for (const thread of threads) {
      try {
        await this.classifyThreadIntent(thread);
      } catch (error) {
        console.error(`[intent-classifier] DB classify failed for ${thread.threadId}:`, error);
      }
    }
  }

  /**
   * Resolve an intent when its thread completes or is abandoned.
   */
  resolveIntent(threadId: string, outcome: 'completed' | 'abandoned' | 'deferred'): void {
    const intent = getIntentByThread(threadId);
    if (!intent) return;

    updateIntent(intent.intentId, {
      resolvedAt: Date.now(),
      outcome,
    });

    console.log(`[intent-classifier] Resolved: ${intent.intentType} → ${outcome}`);
  }

  // ============================================================================
  // Rule-Based Heuristics
  // ============================================================================

  private applyRules(
    distribution: Map<ActivityType, number>,
    activities: SemanticActivity[],
    thread: SemanticThread,
  ): IntentClassification | null {
    const total = activities.length;

    // 1. Check for dominant single type (≥60%)
    for (const [type, count] of distribution) {
      const fraction = count / total;
      if (fraction >= DOMINANCE_THRESHOLD) {
        return this.classifyDominantType(type, fraction, thread);
      }
    }

    // 2. Check combination patterns
    const topTwo = this.getTopTwoTypes(distribution);
    if (topTwo) {
      const combined = (distribution.get(topTwo[0])! + distribution.get(topTwo[1])!) / total;
      if (combined >= DOMINANCE_THRESHOLD) {
        return this.classifyCombination(topTwo, combined);
      }
    }

    // 3. Fallback: use the most common activity type
    const dominant = this.getDominantType(distribution);
    if (dominant) {
      const mapping = ACTIVITY_INTENT_MAP[dominant];
      if (mapping) {
        return {
          intentType: mapping.intent,
          intentSubtype: null,
          confidence: mapping.confidence * 0.7, // Lower confidence for fallback
          evidence: [`Dominant activity: ${dominant}`],
          method: 'rule',
        };
      }
    }

    return null;
  }

  private classifyDominantType(
    type: ActivityType,
    fraction: number,
    thread: SemanticThread,
  ): IntentClassification {
    const mapping = ACTIVITY_INTENT_MAP[type];
    if (!mapping) {
      return {
        intentType: 'RESPOND',
        intentSubtype: 'ad_hoc_request',
        confidence: 0.35,
        evidence: [`Unknown dominant type: ${type}`],
        method: 'rule',
      };
    }

    // Refine subtype based on context
    let subtype: IntentSubtype | null = null;
    const confidence = Math.min(mapping.confidence + (fraction - DOMINANCE_THRESHOLD) * 0.5, 0.9);

    switch (type) {
      case 'BUILDING':
        subtype = 'feature_delivery';
        break;
      case 'INVESTIGATING':
        subtype = 'research';
        break;
      case 'COMMUNICATING': {
        // Distinguish MANAGE vs RESPOND based on entity count
        const entityCount = (thread.primaryEntities || []).length;
        if (entityCount > 3) {
          return {
            intentType: 'MANAGE',
            intentSubtype: 'team_coordination',
            confidence,
            evidence: [`${Math.round(fraction * 100)}% COMMUNICATING`, `${entityCount} entities`],
            method: 'rule',
          };
        }
        subtype = 'ad_hoc_request';
        return {
          intentType: 'RESPOND',
          intentSubtype: subtype,
          confidence: confidence * 0.9,
          evidence: [`${Math.round(fraction * 100)}% COMMUNICATING`, `${entityCount} entities`],
          method: 'rule',
        };
      }
      case 'ORGANIZING':
        subtype = 'sprint_planning';
        break;
      case 'OPERATING':
        subtype = 'release';
        // Check if it looks like incident response (high urgency, CONTEXT_SWITCHING mixed in)
        break;
    }

    return {
      intentType: mapping.intent,
      intentSubtype: subtype,
      confidence,
      evidence: [`${Math.round(fraction * 100)}% ${type}`],
      method: 'rule',
    };
  }

  private classifyCombination(
    topTwo: [ActivityType, ActivityType],
    combinedFraction: number,
  ): IntentClassification | null {
    // Sort for matching against patterns
    const sorted = [...topTwo].sort() as ActivityType[];

    for (const pattern of COMBINATION_PATTERNS) {
      const patternSorted = [...pattern.types].sort();
      if (sorted[0] === patternSorted[0] && sorted[1] === patternSorted[1]) {
        return {
          intentType: pattern.intent,
          intentSubtype: pattern.subtype,
          confidence: pattern.confidence,
          evidence: [`${Math.round(combinedFraction * 100)}% ${sorted[0]}+${sorted[1]}`],
          method: 'rule',
        };
      }
    }

    return null;
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  private createIntent(
    thread: SemanticThread,
    classification: IntentClassification,
    activities: SemanticActivity[],
  ): SemanticIntent {
    const now = Date.now();
    const intentId = randomUUID();

    const intent: Omit<SemanticIntent, 'id'> = {
      intentId,
      threadId: thread.threadId,
      intentType: classification.intentType,
      intentSubtype: classification.intentSubtype,
      confidence: classification.confidence,
      classificationMethod: classification.method,
      evidence: classification.evidence,
      resolvedAt: null,
      outcome: null,
      privacyLevel: thread.privacyLevel || 'sync_allowed',
      synced: false,
      createdAt: now,
      updatedAt: now,
    };

    insertIntent(intent);

    // Link intent to recent activities
    for (let i = 0; i < Math.min(activities.length, 10); i++) {
      try {
        linkIntentToActivity({
          intentId,
          activityId: activities[i].activityId,
          sequenceOrder: i,
          createdAt: now,
        });
      } catch {
        // Activity may have been cleaned up
      }
    }

    // Link intent to thread entities
    for (const entityId of (thread.primaryEntities || [])) {
      try {
        linkIntentToEntity({
          entityId,
          intentId,
          role: 'related',
          createdAt: now,
        });
      } catch {
        // Entity may have been cleaned up
      }
    }

    const fullIntent = { ...intent, id: 0 } as SemanticIntent;
    this.emit('intent-classified', { intent: fullIntent, thread });
    console.log(`[intent-classifier] New: ${thread.title} → ${classification.intentType}/${classification.intentSubtype} (${classification.confidence.toFixed(2)})`);

    return fullIntent;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private computeDistribution(activities: SemanticActivity[]): Map<ActivityType, number> {
    const dist = new Map<ActivityType, number>();
    for (const activity of activities) {
      dist.set(activity.activityType, (dist.get(activity.activityType) || 0) + 1);
    }
    return dist;
  }

  private getDominantType(distribution: Map<ActivityType, number>): ActivityType | null {
    let maxType: ActivityType | null = null;
    let maxCount = 0;
    for (const [type, count] of distribution) {
      if (count > maxCount) {
        maxCount = count;
        maxType = type;
      }
    }
    return maxType;
  }

  private getTopTwoTypes(distribution: Map<ActivityType, number>): [ActivityType, ActivityType] | null {
    const sorted = Array.from(distribution.entries()).sort((a, b) => b[1] - a[1]);
    if (sorted.length < 2) return null;
    return [sorted[0][0], sorted[1][0]];
  }
}
