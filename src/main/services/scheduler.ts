/**
 * Scheduler Service
 *
 * Manages scheduled tasks for:
 * - Hourly summary generation (at the top of each hour)
 * - Daily journal generation (at midnight)
 * - Periodic data cleanup
 * - Cloud sync
 */

import { SummaryService } from './summaryService';
import { JournalService } from './journalService';
import { DeepContextManager } from './deepContextManager';
import { cleanupOldData } from '../db/queries';
import { DEFAULT_SETTINGS } from '../../shared/types';

// ============================================================================
// Types
// ============================================================================

interface ScheduledTask {
  name: string;
  interval: NodeJS.Timeout | null;
  lastRun: Date | null;
  isRunning: boolean;
}

// ============================================================================
// Scheduler Class
// ============================================================================

export class Scheduler {
  private summaryService: SummaryService;
  private journalService: JournalService;
  private deepContextManager: DeepContextManager | null = null;
  private tasks: Map<string, ScheduledTask> = new Map();
  private isRunning: boolean = false;

  // Callbacks for cloud sync (will be set by CloudSyncService)
  private onSyncRequest: (() => Promise<void>) | null = null;

  constructor(summaryService: SummaryService, journalService: JournalService, deepContextManager?: DeepContextManager) {
    this.summaryService = summaryService;
    this.journalService = journalService;
    this.deepContextManager = deepContextManager || null;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.isRunning) {
      console.log('[scheduler] Already running');
      return;
    }

    console.log('[scheduler] Starting scheduler');
    this.isRunning = true;

    // Schedule hourly summary generation
    this.scheduleHourlySummary();

    // Schedule daily journal generation
    this.scheduleDailyJournal();

    // Schedule periodic cleanup
    this.scheduleCleanup();

    // Schedule cloud sync
    this.scheduleSync();

    console.log('[scheduler] All tasks scheduled');
  }

  stop(): void {
    if (!this.isRunning) return;

    console.log('[scheduler] Stopping scheduler');
    this.isRunning = false;

    // Clear all intervals
    for (const [name, task] of this.tasks) {
      if (task.interval) {
        clearInterval(task.interval);
        task.interval = null;
        console.log(`[scheduler] Stopped task: ${name}`);
      }
    }

    this.tasks.clear();
  }

  // ============================================================================
  // Task Scheduling
  // ============================================================================

  private scheduleHourlySummary(): void {
    // Calculate time until next hour
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    const msUntilNextHour = nextHour.getTime() - now.getTime();

    console.log(`[scheduler] Hourly summary will start in ${Math.round(msUntilNextHour / 1000 / 60)} minutes`);

    // Initial delay to align with hour boundary
    setTimeout(() => {
      // Run immediately at hour boundary
      this.runHourlySummary();

      // Then run every hour
      const interval = setInterval(() => {
        this.runHourlySummary();
      }, 60 * 60 * 1000); // Every hour

      this.tasks.set('hourly-summary', {
        name: 'hourly-summary',
        interval,
        lastRun: null,
        isRunning: false,
      });
    }, msUntilNextHour);

    // Register task
    this.tasks.set('hourly-summary', {
      name: 'hourly-summary',
      interval: null, // Will be set after initial delay
      lastRun: null,
      isRunning: false,
    });
  }

  private scheduleDailyJournal(): void {
    // Calculate time until midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 5, 0, 0); // 12:05 AM to ensure day is complete
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    console.log(`[scheduler] Daily journal will start in ${Math.round(msUntilMidnight / 1000 / 60 / 60)} hours`);

    // Initial delay to align with midnight
    setTimeout(() => {
      // Run immediately at midnight
      this.runDailyJournal();

      // Then run every day
      const interval = setInterval(() => {
        this.runDailyJournal();
      }, 24 * 60 * 60 * 1000); // Every 24 hours

      this.tasks.set('daily-journal', {
        name: 'daily-journal',
        interval,
        lastRun: null,
        isRunning: false,
      });
    }, msUntilMidnight);

    // Register task
    this.tasks.set('daily-journal', {
      name: 'daily-journal',
      interval: null,
      lastRun: null,
      isRunning: false,
    });
  }

  private scheduleCleanup(): void {
    // Run cleanup once a day at 3 AM
    const now = new Date();
    const nextCleanup = new Date(now);
    nextCleanup.setHours(3, 0, 0, 0);
    if (nextCleanup.getTime() <= now.getTime()) {
      nextCleanup.setDate(nextCleanup.getDate() + 1);
    }
    const msUntilCleanup = nextCleanup.getTime() - now.getTime();

    setTimeout(() => {
      this.runCleanup();

      const interval = setInterval(() => {
        this.runCleanup();
      }, 24 * 60 * 60 * 1000); // Every 24 hours

      this.tasks.set('cleanup', {
        name: 'cleanup',
        interval,
        lastRun: null,
        isRunning: false,
      });
    }, msUntilCleanup);

    this.tasks.set('cleanup', {
      name: 'cleanup',
      interval: null,
      lastRun: null,
      isRunning: false,
    });
  }

  private scheduleSync(): void {
    // Run sync every 5 minutes
    const syncIntervalMs = (DEFAULT_SETTINGS.syncIntervalMinutes || 5) * 60 * 1000;

    const interval = setInterval(() => {
      this.runSync();
    }, syncIntervalMs);

    this.tasks.set('cloud-sync', {
      name: 'cloud-sync',
      interval,
      lastRun: null,
      isRunning: false,
    });

    // Also run initial sync after 30 seconds
    setTimeout(() => {
      this.runSync();
    }, 30000);
  }

  // ============================================================================
  // Task Execution
  // ============================================================================

  private async runHourlySummary(): Promise<void> {
    const task = this.tasks.get('hourly-summary');
    if (task?.isRunning) {
      console.log('[scheduler] Hourly summary already running, skipping');
      return;
    }

    if (task) task.isRunning = true;

    try {
      console.log('[scheduler] Running hourly summary generation');

      // Get deep context data if available
      let deepContextData;
      if (this.deepContextManager?.isRunning()) {
        try {
          const contextResult = this.deepContextManager.getLastHourDeepContext();
          deepContextData = contextResult || undefined; // Convert null to undefined
          if (deepContextData) {
            console.log('[scheduler] Including deep context:', {
              hasOcr: !!deepContextData.ocrText,
              category: deepContextData.semanticCategory,
              commitments: deepContextData.commitments?.length || 0,
            });
          }
        } catch (error) {
          console.error('[scheduler] Failed to get deep context:', error);
        }
      }

      await this.summaryService.saveLastHourSummary(deepContextData);
      if (task) task.lastRun = new Date();
      console.log('[scheduler] Hourly summary completed');
    } catch (error) {
      console.error('[scheduler] Hourly summary failed:', error);
    } finally {
      if (task) task.isRunning = false;
    }
  }

  private async runDailyJournal(): Promise<void> {
    const task = this.tasks.get('daily-journal');
    if (task?.isRunning) {
      console.log('[scheduler] Daily journal already running, skipping');
      return;
    }

    if (task) task.isRunning = true;

    try {
      console.log('[scheduler] Running daily journal generation');
      await this.journalService.saveYesterdayJournal();
      if (task) task.lastRun = new Date();
      console.log('[scheduler] Daily journal completed');
    } catch (error) {
      console.error('[scheduler] Daily journal failed:', error);
    } finally {
      if (task) task.isRunning = false;
    }
  }

  private runCleanup(): void {
    const task = this.tasks.get('cleanup');
    if (task?.isRunning) return;

    if (task) task.isRunning = true;

    try {
      console.log('[scheduler] Running data cleanup');
      cleanupOldData(DEFAULT_SETTINGS.dataRetentionDays);
      if (task) task.lastRun = new Date();
      console.log('[scheduler] Cleanup completed');
    } catch (error) {
      console.error('[scheduler] Cleanup failed:', error);
    } finally {
      if (task) task.isRunning = false;
    }
  }

  private async runSync(): Promise<void> {
    const task = this.tasks.get('cloud-sync');
    if (task?.isRunning) {
      console.log('[scheduler] Sync already running, skipping');
      return;
    }

    if (!this.onSyncRequest) {
      // Sync callback not yet registered
      return;
    }

    if (task) task.isRunning = true;

    try {
      console.log('[scheduler] Running cloud sync');
      await this.onSyncRequest();
      if (task) task.lastRun = new Date();
      console.log('[scheduler] Cloud sync completed');
    } catch (error) {
      console.error('[scheduler] Cloud sync failed:', error);
    } finally {
      if (task) task.isRunning = false;
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Register callback for cloud sync
   */
  setSyncCallback(callback: () => Promise<void>): void {
    this.onSyncRequest = callback;
  }

  /**
   * Manually trigger hourly summary (for testing)
   */
  async triggerHourlySummary(): Promise<void> {
    await this.runHourlySummary();
  }

  /**
   * Manually trigger daily journal (for testing)
   */
  async triggerDailyJournal(): Promise<void> {
    await this.runDailyJournal();
  }

  /**
   * Manually trigger sync
   */
  async triggerSync(): Promise<void> {
    await this.runSync();
  }

  /**
   * Manually trigger cleanup
   */
  triggerCleanup(): void {
    this.runCleanup();
  }

  /**
   * Get status of all tasks
   */
  getStatus(): Record<string, { lastRun: Date | null; isRunning: boolean }> {
    const status: Record<string, { lastRun: Date | null; isRunning: boolean }> = {};

    for (const [name, task] of this.tasks) {
      status[name] = {
        lastRun: task.lastRun,
        isRunning: task.isRunning,
      };
    }

    return status;
  }
}
