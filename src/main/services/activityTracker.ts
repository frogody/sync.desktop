/**
 * Activity Tracker Service
 *
 * Monitors active window and tracks user activity with duration tracking.
 * Uses the `active-win` package for cross-platform window detection.
 *
 * Features:
 * - Window change detection
 * - Duration tracking per activity
 * - Idle detection (no window = idle)
 * - Event emission for UI updates
 */

// get-windows is ESM-only — use dynamic import to load it from CJS context
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importESM = new Function('modulePath', 'return import(modulePath)') as (m: string) => Promise<any>;

let _activeWindow: ((options?: any) => Promise<any>) | null = null;

async function loadActiveWindow(): Promise<(options?: any) => Promise<any>> {
  if (!_activeWindow) {
    const mod = await importESM('get-windows');
    _activeWindow = mod.activeWindow;
  }
  return _activeWindow!;
}

// Local type matching get-windows Result shape
interface ActiveWinResult {
  title: string;
  owner: { name: string; processId: number; path?: string; bundleId?: string };
  platform: string;
  url?: string;
}
import { EventEmitter } from 'events';
import { systemPreferences } from 'electron';
import { ActivityLog } from '../../shared/types';
import {
  ACTIVITY_POLL_INTERVAL_MS,
  CONTEXT_WINDOW_MINUTES,
  SENSITIVE_APP_PATTERNS,
  BROWSER_APPS,
} from '../../shared/constants';
import {
  insertActivityLog,
  updateActivityDuration,
  getRecentActivity,
  getActivityByDateRange,
} from '../db/queries';

// ============================================================================
// Types
// ============================================================================

export interface ActivityEvent {
  type: 'window_change' | 'idle_start' | 'idle_end' | 'tracking_start' | 'tracking_stop';
  activity?: ActivityLog;
  previousActivity?: ActivityLog;
  idleDuration?: number;
}

// Helper to safely get optional properties from window result
function getWindowUrl(window: ActiveWinResult): string | undefined {
  return (window as any).url;
}

function getOwnerBundleId(window: ActiveWinResult): string | undefined {
  return (window.owner as any).bundleId;
}

// ============================================================================
// Activity Tracker Class
// ============================================================================

export class ActivityTracker extends EventEmitter {
  private interval: NodeJS.Timeout | null = null;
  private lastWindow: string | null = null;
  private lastWindowStart: number = 0;
  private lastActivityId: number | null = null;
  private isRunning: boolean = false;
  private isIdle: boolean = false;
  private idleStartTime: number = 0;
  private pollInterval: number = ACTIVITY_POLL_INTERVAL_MS;

  // Track current activity for quick access
  private currentActivity: Partial<ActivityLog> | null = null;
  private permissionWarningLogged: boolean = false;

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(pollInterval: number = ACTIVITY_POLL_INTERVAL_MS): void {
    if (this.isRunning) {
      console.log('[activity] Tracker already running');
      return;
    }

    console.log('[activity] Starting activity tracker with', pollInterval, 'ms interval');
    this.isRunning = true;
    this.pollInterval = pollInterval;
    this.lastWindowStart = Date.now();

    // Emit start event
    this.emit('activity', {
      type: 'tracking_start',
    } as ActivityEvent);

    // Initial poll
    this.poll();

    // Set up polling interval
    this.interval = setInterval(() => {
      this.poll();
    }, pollInterval);
  }

  stop(): void {
    if (!this.isRunning) return;

    console.log('[activity] Stopping activity tracker');

    // Save final duration for current window
    if (this.lastActivityId && this.lastWindow) {
      this.updateCurrentDuration();
    }

    this.isRunning = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Emit stop event
    this.emit('activity', {
      type: 'tracking_stop',
    } as ActivityEvent);

    // Reset state
    this.lastWindow = null;
    this.lastActivityId = null;
    this.currentActivity = null;
    this.isIdle = false;
  }

  // ============================================================================
  // Polling
  // ============================================================================

  private async poll(): Promise<void> {
    // Check accessibility permission BEFORE calling get-windows to avoid
    // triggering the macOS permission dialog every 5 seconds.
    if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
      if (!this.permissionWarningLogged) {
        console.warn('[activity] Accessibility permission not granted — skipping window polling');
        this.permissionWarningLogged = true;
      }
      return;
    }
    this.permissionWarningLogged = false;

    try {
      const getActiveWindow = await loadActiveWindow();
      const window = await getActiveWindow();

      // Handle idle state (no active window)
      if (!window) {
        if (!this.isIdle) {
          this.handleIdleStart();
        }
        return;
      }

      // End idle if we were idle
      if (this.isIdle) {
        this.handleIdleEnd();
      }

      const windowKey = this.getWindowKey(window);

      // Check if window changed
      if (windowKey !== this.lastWindow) {
        await this.handleWindowChange(window, windowKey);
      } else {
        // Same window - periodically update duration (every 30 seconds)
        const elapsed = Date.now() - this.lastWindowStart;
        if (elapsed > 30000 && this.lastActivityId) {
          this.updateCurrentDuration();
        }
      }
    } catch (error) {
      // active-win can fail if accessibility permissions not granted
      console.error('[activity] Failed to get active window:', error);
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async handleWindowChange(
    window: ActiveWinResult,
    windowKey: string
  ): Promise<void> {
    const previousActivity = this.currentActivity;

    // Update duration for previous window
    if (this.lastActivityId) {
      this.updateCurrentDuration();
    }

    // Log new window
    const newActivityId = await this.logActivity(window);

    // Update tracking state
    this.lastWindow = windowKey;
    this.lastWindowStart = Date.now();
    this.lastActivityId = newActivityId;

    // Emit window change event
    if (newActivityId) {
      this.emit('activity', {
        type: 'window_change',
        activity: this.currentActivity as ActivityLog,
        previousActivity: previousActivity as ActivityLog,
      } as ActivityEvent);
    }
  }

  private handleIdleStart(): void {
    console.log('[activity] User went idle');
    this.isIdle = true;
    this.idleStartTime = Date.now();

    // Update duration for current window before idle
    if (this.lastActivityId) {
      this.updateCurrentDuration();
    }

    this.emit('activity', {
      type: 'idle_start',
      activity: this.currentActivity as ActivityLog,
    } as ActivityEvent);
  }

  private handleIdleEnd(): void {
    const idleDuration = Date.now() - this.idleStartTime;
    console.log('[activity] User returned after', Math.round(idleDuration / 1000), 'seconds');

    this.isIdle = false;

    this.emit('activity', {
      type: 'idle_end',
      idleDuration,
    } as ActivityEvent);

    // Reset window start time to now
    this.lastWindowStart = Date.now();
  }

  // ============================================================================
  // Activity Logging
  // ============================================================================

  private async logActivity(window: ActiveWinResult): Promise<number | null> {
    const appName = window.owner.name;

    // Skip sensitive apps
    if (this.isSensitiveApp(appName)) {
      console.log('[activity] Skipping sensitive app:', appName);
      this.currentActivity = null;
      return null;
    }

    // Get URL for browsers
    let url: string | undefined;
    const windowUrl = getWindowUrl(window);
    if (this.isBrowser(appName) && windowUrl) {
      // Only store domain for privacy
      try {
        const parsed = new URL(windowUrl);
        url = parsed.hostname;
      } catch {
        // Invalid URL, skip
      }
    }

    // Anonymize title if needed
    const windowTitle = this.sanitizeTitle(window.title, appName);
    const bundleId = getOwnerBundleId(window);

    const activity: Omit<ActivityLog, 'id' | 'createdAt'> = {
      timestamp: Date.now(),
      appName,
      windowTitle,
      url,
      bundleId,
      durationSeconds: 0,
      synced: false,
    };

    try {
      const id = insertActivityLog(activity);
      this.currentActivity = { ...activity, id };
      console.log('[activity] Logged:', appName, '-', windowTitle.substring(0, 40));
      return id;
    } catch (error) {
      console.error('[activity] Failed to save activity:', error);
      return null;
    }
  }

  private updateCurrentDuration(): void {
    if (!this.lastActivityId) return;

    const durationMs = Date.now() - this.lastWindowStart;
    const durationSeconds = Math.round(durationMs / 1000);

    try {
      updateActivityDuration(this.lastActivityId, durationSeconds);
      if (this.currentActivity) {
        this.currentActivity.durationSeconds = durationSeconds;
      }
    } catch (error) {
      console.error('[activity] Failed to update duration:', error);
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private getWindowKey(window: ActiveWinResult): string {
    const bundleId = getOwnerBundleId(window);
    return `${bundleId || window.owner.name}::${window.title}`;
  }

  private isSensitiveApp(appName: string): boolean {
    const lowerName = appName.toLowerCase();
    return SENSITIVE_APP_PATTERNS.some((pattern) =>
      lowerName.includes(pattern)
    );
  }

  private isBrowser(appName: string): boolean {
    return BROWSER_APPS.some(
      (browser) => appName.toLowerCase() === browser.toLowerCase()
    );
  }

  private sanitizeTitle(title: string, _appName: string): string {
    let sanitized = title;

    // Remove email addresses
    sanitized = sanitized.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[email]');

    // Remove potential phone numbers
    sanitized = sanitized.replace(/\+?[\d\s()-]{10,}/g, '[phone]');

    // Remove potential credit card numbers
    sanitized = sanitized.replace(/\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/g, '[card]');

    // Truncate very long titles
    if (sanitized.length > 200) {
      sanitized = sanitized.substring(0, 200) + '...';
    }

    return sanitized;
  }

  // ============================================================================
  // Public Getters
  // ============================================================================

  /**
   * Get recent activity logs within the specified time window
   */
  getRecentContext(minutes: number = CONTEXT_WINDOW_MINUTES): ActivityLog[] {
    return getRecentActivity(minutes);
  }

  /**
   * Get activity for a specific date range
   */
  getActivityForDateRange(start: Date, end: Date): ActivityLog[] {
    return getActivityByDateRange(start, end);
  }

  /**
   * Get the current active window info
   */
  getCurrentActivity(): Partial<ActivityLog> | null {
    return this.currentActivity;
  }

  /**
   * Dynamically change the polling interval (e.g. for context boost).
   * Restarts the internal timer with the new interval.
   */
  setPollInterval(ms: number): void {
    if (!this.isRunning) return;

    const clamped = Math.max(500, Math.min(ms, 60000));
    if (clamped === this.pollInterval) return;

    console.log(`[activity] Changing poll interval: ${this.pollInterval}ms → ${clamped}ms`);
    this.pollInterval = clamped;

    // Restart the timer with the new interval
    if (this.interval) {
      clearInterval(this.interval);
    }
    this.interval = setInterval(() => {
      this.poll();
    }, clamped);
  }

  /**
   * Check if tracking is active
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Check if user is idle
   */
  isUserIdle(): boolean {
    return this.isIdle;
  }

  /**
   * Get how long user has been idle (in ms)
   */
  getIdleDuration(): number {
    if (!this.isIdle) return 0;
    return Date.now() - this.idleStartTime;
  }

  /**
   * Get a human-readable summary of recent activity
   */
  getContextSummary(minutes: number = CONTEXT_WINDOW_MINUTES): string {
    const activities = this.getRecentContext(minutes);

    if (activities.length === 0) {
      return 'No recent activity tracked.';
    }

    // Group by app and sum durations
    const appMinutes: Record<string, number> = {};
    for (const activity of activities) {
      const mins = Math.round((activity.durationSeconds || 0) / 60);
      appMinutes[activity.appName] = (appMinutes[activity.appName] || 0) + mins;
    }

    // Sort by time spent, filter out zero
    const sorted = Object.entries(appMinutes)
      .filter(([, mins]) => mins > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    // Get current app
    const currentApp = this.currentActivity?.appName || activities[0]?.appName || 'Unknown';

    if (sorted.length === 0) {
      return `Currently in ${currentApp}. No significant activity in the last ${minutes} minutes.`;
    }

    const parts = sorted.map(([app, mins]) => `${app} (${mins}min)`);
    return `Currently in ${currentApp}. Recent: ${parts.join(', ')}`;
  }

  /**
   * Get detailed context with structured data for SYNC
   */
  getDetailedContext(minutes: number = CONTEXT_WINDOW_MINUTES): {
    currentApp: string | null;
    currentTitle: string | null;
    isIdle: boolean;
    idleDuration: number;
    recentApps: { app: string; minutes: number }[];
    totalActiveMinutes: number;
  } {
    const activities = this.getRecentContext(minutes);

    // Group by app
    const appSeconds: Record<string, number> = {};
    let totalSeconds = 0;

    for (const activity of activities) {
      const secs = activity.durationSeconds || 0;
      appSeconds[activity.appName] = (appSeconds[activity.appName] || 0) + secs;
      totalSeconds += secs;
    }

    // Sort and convert to minutes
    const recentApps = Object.entries(appSeconds)
      .map(([app, secs]) => ({ app, minutes: Math.round(secs / 60) }))
      .filter((a) => a.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 10);

    return {
      currentApp: this.currentActivity?.appName || null,
      currentTitle: this.currentActivity?.windowTitle || null,
      isIdle: this.isIdle,
      idleDuration: this.getIdleDuration(),
      recentApps,
      totalActiveMinutes: Math.round(totalSeconds / 60),
    };
  }
}
