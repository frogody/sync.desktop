/**
 * Summary Service
 *
 * Aggregates activity data into hourly summaries.
 * Provides insights on productivity patterns and app usage.
 */

import { ActivityLog, HourlySummary } from '../../shared/types';
import {
  getActivityByDateRange,
  insertHourlySummary,
  getHourlySummaryByRange,
  getUnsyncedHourlySummaries,
  markHourlySummaryAsSynced,
} from '../db/queries';

// ============================================================================
// Types
// ============================================================================

export interface AppBreakdown {
  appName: string;
  minutes: number;
  percentage: number;
  category: string;
}

export interface HourlySummaryData {
  hourStart: Date;
  hourEnd: Date;
  appBreakdown: AppBreakdown[];
  totalMinutes: number;
  focusScore: number;
  topApp: string;
  topCategory: string;
  contextSwitches: number;
}

// App categories for classification
const APP_CATEGORIES: Record<string, string> = {
  // Development
  'visual studio code': 'Development',
  'vs code': 'Development',
  'code': 'Development',
  'xcode': 'Development',
  'android studio': 'Development',
  'intellij': 'Development',
  'webstorm': 'Development',
  'pycharm': 'Development',
  'terminal': 'Development',
  'iterm': 'Development',
  'warp': 'Development',

  // Communication
  'slack': 'Communication',
  'discord': 'Communication',
  'microsoft teams': 'Communication',
  'messages': 'Communication',
  'mail': 'Communication',
  'outlook': 'Communication',
  'gmail': 'Communication',

  // Meetings
  'zoom': 'Meetings',
  'google meet': 'Meetings',
  'facetime': 'Meetings',
  'webex': 'Meetings',

  // Productivity
  'notion': 'Productivity',
  'obsidian': 'Productivity',
  'microsoft word': 'Productivity',
  'google docs': 'Productivity',
  'pages': 'Productivity',
  'numbers': 'Productivity',
  'microsoft excel': 'Productivity',

  // Design
  'figma': 'Design',
  'sketch': 'Design',
  'adobe photoshop': 'Design',
  'adobe illustrator': 'Design',
  'canva': 'Design',

  // Browsing
  'safari': 'Browsing',
  'google chrome': 'Browsing',
  'chrome': 'Browsing',
  'firefox': 'Browsing',
  'brave': 'Browsing',
  'arc': 'Browsing',
  'edge': 'Browsing',

  // Entertainment
  'spotify': 'Entertainment',
  'music': 'Entertainment',
  'apple music': 'Entertainment',
  'youtube': 'Entertainment',
  'netflix': 'Entertainment',

  // System
  'finder': 'System',
  'system preferences': 'System',
  'settings': 'System',
  'activity monitor': 'System',
};

// ============================================================================
// Summary Service Class
// ============================================================================

export class SummaryService {
  private lastSummaryHour: Date | null = null;

  // ============================================================================
  // Summary Generation
  // ============================================================================

  /**
   * Generate summary for a specific hour
   */
  generateHourlySummary(hourStart: Date): HourlySummaryData | null {
    // Calculate hour boundaries
    const start = new Date(hourStart);
    start.setMinutes(0, 0, 0);

    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    // Get activities for this hour
    const activities = getActivityByDateRange(start, end);

    if (activities.length === 0) {
      return null;
    }

    return this.computeSummary(activities, start, end);
  }

  /**
   * Generate summary for the last completed hour
   */
  generateLastHourSummary(): HourlySummaryData | null {
    const now = new Date();
    const lastHour = new Date(now);
    lastHour.setHours(lastHour.getHours() - 1);
    lastHour.setMinutes(0, 0, 0);

    return this.generateHourlySummary(lastHour);
  }

  /**
   * Generate and save summary for the last completed hour
   */
  async saveLastHourSummary(): Promise<number | null> {
    const summary = this.generateLastHourSummary();

    if (!summary) {
      console.log('[summary] No activity in the last hour');
      return null;
    }

    // Don't save duplicate summaries
    if (this.lastSummaryHour && this.lastSummaryHour.getTime() === summary.hourStart.getTime()) {
      console.log('[summary] Summary already generated for this hour');
      return null;
    }

    try {
      const id = insertHourlySummary({
        hourStart: summary.hourStart.getTime(),
        appBreakdown: summary.appBreakdown,
        totalMinutes: summary.totalMinutes,
        focusScore: summary.focusScore,
        synced: false,
      });

      this.lastSummaryHour = summary.hourStart;
      console.log('[summary] Saved hourly summary:', summary.hourStart.toISOString());

      return id;
    } catch (error) {
      console.error('[summary] Failed to save hourly summary:', error);
      return null;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private computeSummary(
    activities: ActivityLog[],
    hourStart: Date,
    hourEnd: Date
  ): HourlySummaryData {
    // Calculate app breakdown
    const appMap = new Map<string, number>();
    let totalSeconds = 0;

    for (const activity of activities) {
      const seconds = activity.durationSeconds || 0;
      totalSeconds += seconds;
      appMap.set(activity.appName, (appMap.get(activity.appName) || 0) + seconds);
    }

    // Convert to breakdown array
    const appBreakdown: AppBreakdown[] = [];
    for (const [appName, seconds] of appMap) {
      const minutes = Math.round(seconds / 60);
      if (minutes > 0) {
        appBreakdown.push({
          appName,
          minutes,
          percentage: totalSeconds > 0 ? Math.round((seconds / totalSeconds) * 100) : 0,
          category: this.categorizeApp(appName),
        });
      }
    }

    // Sort by time
    appBreakdown.sort((a, b) => b.minutes - a.minutes);

    // Calculate category breakdown
    const categoryMap = new Map<string, number>();
    for (const app of appBreakdown) {
      categoryMap.set(app.category, (categoryMap.get(app.category) || 0) + app.minutes);
    }

    // Find top category
    let topCategory = 'Other';
    let maxCategoryMinutes = 0;
    for (const [category, minutes] of categoryMap) {
      if (minutes > maxCategoryMinutes) {
        maxCategoryMinutes = minutes;
        topCategory = category;
      }
    }

    // Calculate focus score
    const focusScore = this.calculateFocusScore(activities, appBreakdown, categoryMap);

    // Count context switches (unique app transitions)
    const contextSwitches = this.countContextSwitches(activities);

    return {
      hourStart,
      hourEnd,
      appBreakdown,
      totalMinutes: Math.round(totalSeconds / 60),
      focusScore,
      topApp: appBreakdown[0]?.appName || 'None',
      topCategory,
      contextSwitches,
    };
  }

  private categorizeApp(appName: string): string {
    const lowerName = appName.toLowerCase();

    for (const [pattern, category] of Object.entries(APP_CATEGORIES)) {
      if (lowerName.includes(pattern)) {
        return category;
      }
    }

    return 'Other';
  }

  private calculateFocusScore(
    activities: ActivityLog[],
    appBreakdown: AppBreakdown[],
    categoryMap: Map<string, number>
  ): number {
    if (activities.length === 0) return 0;

    // Factor 1: Session length (longer = more focused)
    const avgSessionSeconds =
      activities.reduce((sum, a) => sum + (a.durationSeconds || 0), 0) / activities.length;
    const sessionScore = Math.min(avgSessionSeconds / 300, 1); // Max at 5 min avg

    // Factor 2: Category concentration (fewer categories = more focused)
    const categoryCount = categoryMap.size;
    const concentrationScore = Math.max(0, 1 - (categoryCount - 1) / 5); // Penalty for > 1 category

    // Factor 3: Deep work ratio
    const productiveCategories = ['Development', 'Productivity', 'Design'];
    const productiveMinutes = Array.from(categoryMap.entries())
      .filter(([cat]) => productiveCategories.includes(cat))
      .reduce((sum, [, mins]) => sum + mins, 0);
    const totalMinutes = Array.from(categoryMap.values()).reduce((sum, m) => sum + m, 0);
    const deepWorkRatio = totalMinutes > 0 ? productiveMinutes / totalMinutes : 0;

    // Factor 4: Context switch penalty
    const switchRate = activities.length / 60; // Switches per minute
    const switchPenalty = Math.max(0, 1 - switchRate);

    // Combine factors with weights
    const focusScore =
      sessionScore * 0.25 +
      concentrationScore * 0.2 +
      deepWorkRatio * 0.35 +
      switchPenalty * 0.2;

    return Math.round(focusScore * 100) / 100;
  }

  private countContextSwitches(activities: ActivityLog[]): number {
    if (activities.length <= 1) return 0;

    // Sort by timestamp
    const sorted = [...activities].sort((a, b) => a.timestamp - b.timestamp);

    let switches = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].appName !== sorted[i - 1].appName) {
        switches++;
      }
    }

    return switches;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get summaries for a date range
   */
  getSummariesForRange(start: Date, end: Date): HourlySummary[] {
    return getHourlySummaryByRange(start, end);
  }

  /**
   * Get today's summaries
   */
  getTodaySummaries(): HourlySummary[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return getHourlySummaryByRange(today, tomorrow);
  }

  /**
   * Get unsynced summaries for cloud sync
   */
  getUnsyncedSummaries(): HourlySummary[] {
    return getUnsyncedHourlySummaries();
  }

  /**
   * Mark summary as synced
   */
  markAsSynced(id: number): void {
    markHourlySummaryAsSynced(id);
  }

  /**
   * Get productivity stats for today
   */
  getTodayStats(): {
    totalMinutes: number;
    avgFocusScore: number;
    topApps: AppBreakdown[];
    topCategories: { category: string; minutes: number }[];
  } {
    const summaries = this.getTodaySummaries();

    if (summaries.length === 0) {
      return {
        totalMinutes: 0,
        avgFocusScore: 0,
        topApps: [],
        topCategories: [],
      };
    }

    // Aggregate totals
    let totalMinutes = 0;
    let totalFocusScore = 0;
    const appMap = new Map<string, { minutes: number; category: string }>();
    const categoryMap = new Map<string, number>();

    for (const summary of summaries) {
      totalMinutes += summary.totalMinutes;
      totalFocusScore += summary.focusScore;

      const breakdown = summary.appBreakdown as AppBreakdown[];
      for (const app of breakdown) {
        const existing = appMap.get(app.appName);
        if (existing) {
          existing.minutes += app.minutes;
        } else {
          appMap.set(app.appName, { minutes: app.minutes, category: app.category });
        }

        categoryMap.set(app.category, (categoryMap.get(app.category) || 0) + app.minutes);
      }
    }

    // Convert to arrays
    const topApps: AppBreakdown[] = Array.from(appMap.entries())
      .map(([appName, data]) => ({
        appName,
        minutes: data.minutes,
        percentage: totalMinutes > 0 ? Math.round((data.minutes / totalMinutes) * 100) : 0,
        category: data.category,
      }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 10);

    const topCategories = Array.from(categoryMap.entries())
      .map(([category, minutes]) => ({ category, minutes }))
      .sort((a, b) => b.minutes - a.minutes);

    return {
      totalMinutes,
      avgFocusScore:
        summaries.length > 0 ? Math.round((totalFocusScore / summaries.length) * 100) / 100 : 0,
      topApps,
      topCategories,
    };
  }
}
