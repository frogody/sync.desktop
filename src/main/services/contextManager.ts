/**
 * Context Manager Service
 *
 * Manages rolling context windows for SYNC integration.
 * Maintains detailed activity for last 10 minutes and provides
 * summarized context for AI conversations.
 */

import { ActivityTracker, ActivityEvent } from './activityTracker';
import { ActivityLog } from '../../shared/types';
import { CONTEXT_WINDOW_MINUTES } from '../../shared/constants';
import { getRecentActivity, getActivityByDateRange } from '../db/queries';

// ============================================================================
// Types
// ============================================================================

export interface ContextSnapshot {
  timestamp: number;
  currentApp: string | null;
  currentTitle: string | null;
  isIdle: boolean;
  idleDuration: number;
  recentApps: AppUsage[];
  totalActiveMinutes: number;
  focusScore: number;
  topActivities: string[];
  workPatterns: WorkPattern[];
}

export interface AppUsage {
  app: string;
  minutes: number;
  percentage: number;
  windowTitles: string[];
}

export interface WorkPattern {
  type: 'deep_work' | 'meetings' | 'communication' | 'browsing' | 'development' | 'creative' | 'other';
  minutes: number;
  percentage: number;
}

// App categorization for work patterns
const APP_CATEGORIES: Record<string, WorkPattern['type']> = {
  // Development
  'visual studio code': 'development',
  'vs code': 'development',
  'code': 'development',
  'xcode': 'development',
  'android studio': 'development',
  'intellij': 'development',
  'webstorm': 'development',
  'pycharm': 'development',
  'sublime text': 'development',
  'atom': 'development',
  'vim': 'development',
  'neovim': 'development',
  'terminal': 'development',
  'iterm': 'development',
  'warp': 'development',
  'github desktop': 'development',

  // Communication
  'slack': 'communication',
  'discord': 'communication',
  'microsoft teams': 'communication',
  'messages': 'communication',
  'whatsapp': 'communication',
  'telegram': 'communication',

  // Meetings
  'zoom': 'meetings',
  'google meet': 'meetings',
  'facetime': 'meetings',
  'webex': 'meetings',
  'skype': 'meetings',

  // Creative
  'figma': 'creative',
  'sketch': 'creative',
  'adobe photoshop': 'creative',
  'adobe illustrator': 'creative',
  'canva': 'creative',
  'blender': 'creative',
  'affinity designer': 'creative',

  // Deep work (productivity apps)
  'notion': 'deep_work',
  'obsidian': 'deep_work',
  'bear': 'deep_work',
  'ulysses': 'deep_work',
  'microsoft word': 'deep_work',
  'google docs': 'deep_work',
  'pages': 'deep_work',
  'numbers': 'deep_work',
  'microsoft excel': 'deep_work',

  // Browsing
  'safari': 'browsing',
  'google chrome': 'browsing',
  'chrome': 'browsing',
  'firefox': 'browsing',
  'brave': 'browsing',
  'arc': 'browsing',
  'edge': 'browsing',
  'opera': 'browsing',
};

// ============================================================================
// Context Manager Class
// ============================================================================

export class ContextManager {
  private activityTracker: ActivityTracker;
  private lastSnapshot: ContextSnapshot | null = null;
  private snapshotInterval: NodeJS.Timeout | null = null;

  constructor(activityTracker: ActivityTracker) {
    this.activityTracker = activityTracker;

    // Listen for activity events
    this.activityTracker.on('activity', (event: ActivityEvent) => {
      this.handleActivityEvent(event);
    });
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(snapshotIntervalMs: number = 60000): void {
    console.log('[context] Starting context manager');

    // Take initial snapshot
    this.takeSnapshot();

    // Schedule periodic snapshots
    this.snapshotInterval = setInterval(() => {
      this.takeSnapshot();
    }, snapshotIntervalMs);
  }

  stop(): void {
    console.log('[context] Stopping context manager');

    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private handleActivityEvent(event: ActivityEvent): void {
    // Log significant events
    if (event.type === 'idle_start') {
      console.log('[context] User went idle');
    } else if (event.type === 'idle_end') {
      console.log('[context] User returned from idle');
    }

    // Take a new snapshot on significant events
    if (event.type === 'window_change' || event.type === 'idle_start' || event.type === 'idle_end') {
      this.takeSnapshot();
    }
  }

  // ============================================================================
  // Snapshot Generation
  // ============================================================================

  private takeSnapshot(): void {
    const activities = getRecentActivity(CONTEXT_WINDOW_MINUTES);
    this.lastSnapshot = this.generateSnapshot(activities);
  }

  private generateSnapshot(activities: ActivityLog[]): ContextSnapshot {
    const detailedContext = this.activityTracker.getDetailedContext(CONTEXT_WINDOW_MINUTES);

    // Calculate app usage with more details
    const appUsage = this.calculateAppUsage(activities);

    // Calculate work patterns
    const workPatterns = this.calculateWorkPatterns(activities);

    // Calculate focus score (0-1)
    const focusScore = this.calculateFocusScore(activities, workPatterns);

    // Get top activities (unique window titles)
    const topActivities = this.getTopActivities(activities);

    return {
      timestamp: Date.now(),
      currentApp: detailedContext.currentApp,
      currentTitle: detailedContext.currentTitle,
      isIdle: detailedContext.isIdle,
      idleDuration: detailedContext.idleDuration,
      recentApps: appUsage,
      totalActiveMinutes: detailedContext.totalActiveMinutes,
      focusScore,
      topActivities,
      workPatterns,
    };
  }

  private calculateAppUsage(activities: ActivityLog[]): AppUsage[] {
    const appMap = new Map<string, { seconds: number; titles: Set<string> }>();
    let totalSeconds = 0;

    for (const activity of activities) {
      const seconds = activity.durationSeconds || 0;
      totalSeconds += seconds;

      const existing = appMap.get(activity.appName);
      if (existing) {
        existing.seconds += seconds;
        if (activity.windowTitle) {
          existing.titles.add(activity.windowTitle);
        }
      } else {
        const titles = new Set<string>();
        if (activity.windowTitle) {
          titles.add(activity.windowTitle);
        }
        appMap.set(activity.appName, { seconds, titles });
      }
    }

    // Convert to array and calculate percentages
    const appUsage: AppUsage[] = [];
    for (const [app, data] of appMap) {
      const minutes = Math.round(data.seconds / 60);
      if (minutes > 0) {
        appUsage.push({
          app,
          minutes,
          percentage: totalSeconds > 0 ? Math.round((data.seconds / totalSeconds) * 100) : 0,
          windowTitles: Array.from(data.titles).slice(0, 5), // Limit to 5 titles
        });
      }
    }

    // Sort by time spent
    return appUsage.sort((a, b) => b.minutes - a.minutes).slice(0, 10);
  }

  private calculateWorkPatterns(activities: ActivityLog[]): WorkPattern[] {
    const patternMap = new Map<WorkPattern['type'], number>();

    for (const activity of activities) {
      const seconds = activity.durationSeconds || 0;
      const category = this.categorizeApp(activity.appName);

      patternMap.set(category, (patternMap.get(category) || 0) + seconds);
    }

    // Calculate total
    let totalSeconds = 0;
    for (const seconds of patternMap.values()) {
      totalSeconds += seconds;
    }

    // Convert to array with percentages
    const patterns: WorkPattern[] = [];
    for (const [type, seconds] of patternMap) {
      const minutes = Math.round(seconds / 60);
      if (minutes > 0) {
        patterns.push({
          type,
          minutes,
          percentage: totalSeconds > 0 ? Math.round((seconds / totalSeconds) * 100) : 0,
        });
      }
    }

    return patterns.sort((a, b) => b.minutes - a.minutes);
  }

  private categorizeApp(appName: string): WorkPattern['type'] {
    const lowerName = appName.toLowerCase();

    for (const [pattern, category] of Object.entries(APP_CATEGORIES)) {
      if (lowerName.includes(pattern)) {
        return category;
      }
    }

    return 'other';
  }

  private calculateFocusScore(activities: ActivityLog[], patterns: WorkPattern[]): number {
    if (activities.length === 0) return 0;

    // Factors that increase focus score:
    // 1. Longer sessions per app (less context switching)
    // 2. More time in deep_work or development categories
    // 3. Less time in communication/browsing

    // Calculate average session duration
    const avgSessionSeconds =
      activities.reduce((sum, a) => sum + (a.durationSeconds || 0), 0) / activities.length;
    const sessionScore = Math.min(avgSessionSeconds / 300, 1); // Max at 5 min avg

    // Calculate deep work ratio
    const deepWorkMinutes = patterns
      .filter((p) => p.type === 'deep_work' || p.type === 'development' || p.type === 'creative')
      .reduce((sum, p) => sum + p.minutes, 0);
    const totalMinutes = patterns.reduce((sum, p) => sum + p.minutes, 0);
    const deepWorkRatio = totalMinutes > 0 ? deepWorkMinutes / totalMinutes : 0;

    // Calculate context switch penalty
    const switchPenalty = Math.max(0, 1 - (activities.length / 30)); // Penalty if > 30 switches in 10 min

    // Combine factors
    const focusScore = (sessionScore * 0.3) + (deepWorkRatio * 0.5) + (switchPenalty * 0.2);

    return Math.round(focusScore * 100) / 100;
  }

  private getTopActivities(activities: ActivityLog[]): string[] {
    // Get unique, meaningful window titles
    const titleCounts = new Map<string, number>();

    for (const activity of activities) {
      if (activity.windowTitle && activity.windowTitle.length > 5) {
        // Clean up title for readability
        let title = activity.windowTitle;
        if (title.length > 50) {
          title = title.substring(0, 50) + '...';
        }

        const key = `${activity.appName}: ${title}`;
        titleCounts.set(key, (titleCounts.get(key) || 0) + (activity.durationSeconds || 0));
      }
    }

    // Sort by time and return top 5
    return Array.from(titleCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([title]) => title);
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get current context snapshot
   */
  getCurrentSnapshot(): ContextSnapshot | null {
    return this.lastSnapshot;
  }

  /**
   * Get fresh context (regenerates snapshot)
   */
  getFreshContext(): ContextSnapshot {
    this.takeSnapshot();
    return this.lastSnapshot!;
  }

  /**
   * Get context formatted for SYNC AI
   */
  getContextForSync(): string {
    const snapshot = this.lastSnapshot || this.getFreshContext();

    const lines: string[] = [];

    // Current state
    if (snapshot.isIdle) {
      const idleMinutes = Math.round(snapshot.idleDuration / 60000);
      lines.push(`User has been idle for ${idleMinutes} minutes.`);
    } else if (snapshot.currentApp) {
      lines.push(`Currently using ${snapshot.currentApp}.`);
      if (snapshot.currentTitle) {
        lines.push(`Working on: ${snapshot.currentTitle.substring(0, 60)}`);
      }
    }

    // Focus score
    lines.push(`Focus score: ${Math.round(snapshot.focusScore * 100)}%`);

    // Recent apps
    if (snapshot.recentApps.length > 0) {
      const appSummary = snapshot.recentApps
        .slice(0, 5)
        .map((a) => `${a.app} (${a.minutes}min, ${a.percentage}%)`)
        .join(', ');
      lines.push(`Recent apps: ${appSummary}`);
    }

    // Work patterns
    if (snapshot.workPatterns.length > 0) {
      const patternSummary = snapshot.workPatterns
        .slice(0, 3)
        .map((p) => `${p.type}: ${p.minutes}min`)
        .join(', ');
      lines.push(`Work patterns: ${patternSummary}`);
    }

    // Top activities
    if (snapshot.topActivities.length > 0) {
      lines.push(`Top activities: ${snapshot.topActivities.slice(0, 3).join('; ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Get context for a specific time range
   */
  getContextForRange(start: Date, end: Date): ContextSnapshot {
    const activities = getActivityByDateRange(start, end);
    return this.generateSnapshot(activities);
  }
}
