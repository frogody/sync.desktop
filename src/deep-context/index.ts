/**
 * Deep Context Engine
 *
 * Main entry point for the accessibility-based deep context system.
 * Initializes all sub-modules and exposes a clean API for querying
 * structured activity data.
 *
 * This module runs alongside the existing deepContextManager
 * (screen capture + OCR). It produces ContextEvent objects that
 * will eventually supersede the old pipeline.
 *
 * Usage in main process:
 *   const engine = new DeepContextEngine();
 *   engine.start();
 *   // ...later
 *   const events = engine.getRecentEvents(60);
 *   const commitments = engine.getCommitments();
 *   const summary = engine.getDailySummary();
 */

import { EventEmitter } from 'events';
import { ContextEventPipeline, PipelineEvent } from './pipeline/contextEventPipeline';
import { ContextEventStore } from './store/contextEventStore';
import type {
  ContextEvent,
  ContextEventType,
  Commitment,
  SkillSignal,
  DailySummary,
  DeepContextEngineConfig,
  DEFAULT_ENGINE_CONFIG,
} from './types';

// Re-export for convenience
export { DeepContextEngineConfig, DEFAULT_ENGINE_CONFIG } from './types';
export type { ContextEvent, Commitment, SkillSignal, DailySummary } from './types';

// ============================================================================
// Deep Context Engine
// ============================================================================

export class DeepContextEngine extends EventEmitter {
  private pipeline: ContextEventPipeline;
  private store: ContextEventStore;
  private config: DeepContextEngineConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private running: boolean = false;

  constructor(config?: Partial<DeepContextEngineConfig>) {
    super();

    // Import DEFAULT_ENGINE_CONFIG at runtime to avoid circular dependency issues
    const { DEFAULT_ENGINE_CONFIG: defaults } = require('./types');
    this.config = { ...defaults, ...config };

    // Initialize store with encryption settings
    this.store = new ContextEventStore(this.config.encryptionEnabled);

    // Initialize pipeline
    this.pipeline = new ContextEventPipeline(this.config, this.store);

    // Forward pipeline events
    this.pipeline.on('pipeline', (event: PipelineEvent) => {
      if (event.type === 'event_stored' && event.event) {
        this.emit('event', event.event);
      }
    });
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.running) {
      console.log('[deep-context-engine] Already running');
      return;
    }

    if (!this.config.enabled) {
      console.log('[deep-context-engine] Disabled by config');
      return;
    }

    console.log('[deep-context-engine] Starting deep context engine');
    console.log('[deep-context-engine] Config:', {
      captureInterval: this.config.captureIntervalMs,
      encryption: this.config.encryptionEnabled,
      fileWatcher: this.config.fileWatcherEnabled,
      retention: this.config.retentionDays,
    });

    this.running = true;
    this.pipeline.start();

    // Schedule periodic cleanup (every 6 hours)
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 6 * 60 * 60 * 1000);

    console.log('[deep-context-engine] Engine started');
  }

  stop(): void {
    if (!this.running) return;

    console.log('[deep-context-engine] Stopping deep context engine');
    this.running = false;

    this.pipeline.stop();

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    console.log('[deep-context-engine] Engine stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  updateConfig(config: Partial<DeepContextEngineConfig>): void {
    this.config = { ...this.config, ...config };
    this.pipeline.updateConfig(config);
  }

  // ============================================================================
  // Query API
  // ============================================================================

  /**
   * Get recent context events.
   */
  getRecentEvents(minutes: number = 60, limit: number = 100): ContextEvent[] {
    return this.store.getRecentEvents(minutes, limit);
  }

  /**
   * Get events by type.
   */
  getEventsByType(eventType: ContextEventType, limit: number = 50): ContextEvent[] {
    return this.store.getByEventType(eventType, limit);
  }

  /**
   * Get events for a specific application.
   */
  getEventsByApp(appName: string, limit: number = 50): ContextEvent[] {
    return this.store.getByApplication(appName, limit);
  }

  /**
   * Get all commitments detected in the last 24 hours.
   */
  getCommitments(since?: number): Commitment[] {
    return this.store.getCommitments(since);
  }

  /**
   * Get events that haven't been synced to the backend.
   */
  getUnsyncedEvents(limit: number = 100): ContextEvent[] {
    return this.store.getUnsynced(limit);
  }

  /**
   * Mark events as synced after successful backend upload.
   */
  markEventsSynced(ids: number[]): void {
    this.store.markSynced(ids);
  }

  /**
   * Get total number of stored events.
   */
  getEventCount(): number {
    return this.store.getCount();
  }

  // ============================================================================
  // Daily Summary
  // ============================================================================

  /**
   * Generate a daily summary for a given date.
   * Aggregates context events into achievements, commitments, skills.
   */
  getDailySummary(date?: Date): DailySummary {
    const targetDate = date || new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const events = this.store.getByTimeRange(startOfDay.getTime(), endOfDay.getTime(), 10000);

    // Aggregate top applications
    const appMap = new Map<string, { duration: number; activities: Set<string> }>();
    for (const event of events) {
      const app = event.source.application;
      const existing = appMap.get(app);
      if (existing) {
        existing.duration += 1;
        if (event.semanticPayload.intent) {
          existing.activities.add(event.semanticPayload.intent);
        }
      } else {
        const activities = new Set<string>();
        if (event.semanticPayload.intent) {
          activities.add(event.semanticPayload.intent);
        }
        appMap.set(app, { duration: 1, activities });
      }
    }

    const topApplications = Array.from(appMap.entries())
      .map(([app, data]) => ({
        app,
        duration: data.duration,
        activities: Array.from(data.activities),
      }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    // Collect commitments
    const allCommitments: Commitment[] = [];
    const allSkillSignals: SkillSignal[] = [];
    const achievements: string[] = [];

    for (const event of events) {
      if (event.semanticPayload.commitments) {
        allCommitments.push(...event.semanticPayload.commitments);
      }
      if (event.semanticPayload.skillSignals) {
        allSkillSignals.push(...event.semanticPayload.skillSignals);
      }
      if (event.eventType === 'task_completed') {
        achievements.push(event.semanticPayload.summary);
      }
    }

    // Categorize commitments
    const commitmentsMade = allCommitments.filter((c) => c.status === 'detected');
    const commitmentsFollowedUp = allCommitments.filter((c) => c.status === 'fulfilled');
    const commitmentsMissed = allCommitments.filter((c) => c.status === 'overdue');

    // Count context switches
    const contextSwitchCount = events.filter(
      (e) => e.eventType === 'context_switch'
    ).length;

    // Count opportunities
    const opportunitiesSurfaced = events.filter(
      (e) => e.eventType === 'opportunity_detected'
    ).length;

    // Deduplicate skill signals
    const uniqueSkills = this.deduplicateSkills(allSkillSignals);

    return {
      date: startOfDay.getTime(),
      totalActiveTime: events.length, // Approximate: each event ~= 15s of activity
      topApplications,
      achievements,
      commitmentsMade,
      commitmentsFollowedUp,
      commitmentsMissed,
      skillsExercised: uniqueSkills,
      contextSwitchCount,
      opportunitiesSurfaced,
    };
  }

  // ============================================================================
  // Context for SYNC Agent
  // ============================================================================

  /**
   * Get structured context string for the SYNC AI agent.
   * Summarizes recent activity, pending commitments, and current state.
   */
  getContextForSync(): string {
    const recentEvents = this.getRecentEvents(15, 20);
    const commitments = this.getCommitments(Date.now() - 24 * 60 * 60 * 1000);

    if (recentEvents.length === 0) {
      return '';
    }

    const lines: string[] = ['--- Deep Context ---'];

    // Current activity
    const latest = recentEvents[0];
    if (latest) {
      lines.push(`Current: ${latest.semanticPayload.summary}`);
      if (latest.semanticPayload.intent) {
        lines.push(`Intent: ${latest.semanticPayload.intent}`);
      }
    }

    // Recent context switches
    const switches = recentEvents.filter((e) => e.eventType === 'context_switch');
    if (switches.length > 0) {
      lines.push(`Context switches (last 15 min): ${switches.length}`);
    }

    // Recent entities
    const allEntities = new Set<string>();
    for (const event of recentEvents.slice(0, 10)) {
      for (const entity of event.semanticPayload.entities) {
        allEntities.add(entity);
      }
    }
    if (allEntities.size > 0) {
      lines.push(`Mentioned: ${Array.from(allEntities).slice(0, 10).join(', ')}`);
    }

    // Pending commitments
    const pendingCommitments = commitments.filter(
      (c) => c.status === 'detected' || c.status === 'pending_action'
    );
    if (pendingCommitments.length > 0) {
      lines.push(`Pending commitments (${pendingCommitments.length}):`);
      for (const c of pendingCommitments.slice(0, 5)) {
        const due = c.dueDate ? ` (due: ${new Date(c.dueDate).toLocaleString()})` : '';
        lines.push(`  - ${c.description}${due}`);
      }
    }

    // Recent apps
    const recentApps = [...new Set(recentEvents.map((e) => e.source.application))];
    if (recentApps.length > 0) {
      lines.push(`Recent apps: ${recentApps.slice(0, 5).join(', ')}`);
    }

    lines.push('---');

    return lines.join('\n');
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  private cleanup(): void {
    const deleted = this.store.cleanupOlderThan(this.config.retentionDays);
    if (deleted > 0) {
      console.log(`[deep-context-engine] Cleaned up ${deleted} old events`);
    }
  }

  // ============================================================================
  // Stats
  // ============================================================================

  getStats(): {
    isRunning: boolean;
    totalEvents: number;
    pipeline: ReturnType<ContextEventPipeline['getStats']>;
  } {
    return {
      isRunning: this.running,
      totalEvents: this.store.getCount(),
      pipeline: this.pipeline.getStats(),
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private deduplicateSkills(signals: SkillSignal[]): SkillSignal[] {
    const seen = new Map<string, SkillSignal>();

    for (const signal of signals) {
      const key = signal.skillPath.join('/');
      const existing = seen.get(key);

      if (!existing) {
        seen.set(key, signal);
      } else {
        // Keep the higher proficiency
        const levels: SkillSignal['proficiencyIndicator'][] = [
          'beginner', 'intermediate', 'advanced', 'expert',
        ];
        const existingLevel = levels.indexOf(existing.proficiencyIndicator);
        const newLevel = levels.indexOf(signal.proficiencyIndicator);
        if (newLevel > existingLevel) {
          seen.set(key, signal);
        }
      }
    }

    return Array.from(seen.values());
  }
}
