/**
 * Journal Service
 *
 * Generates daily journals from hourly summaries.
 * Provides AI-friendly summaries of the user's workday.
 */

import { HourlySummary, DailyJournal } from '../../shared/types';
import { SummaryService, AppBreakdown } from './summaryService';
import {
  getHourlySummaryByRange,
  insertDailyJournal,
  getDailyJournalByDate,
  getUnsyncedDailyJournals,
  markDailyJournalAsSynced,
} from '../db/queries';

// ============================================================================
// Types
// ============================================================================

export interface DayHighlight {
  type: 'achievement' | 'focus_session' | 'productive_streak' | 'meeting_heavy' | 'communication_heavy';
  description: string;
  timeRange?: string;
  durationMinutes?: number;
}

export interface FocusArea {
  category: string;
  minutes: number;
  percentage: number;
  apps: string[];
}

export interface DailyJournalData {
  date: Date;
  overview: string;
  highlights: DayHighlight[];
  focusAreas: FocusArea[];
  totalActiveMinutes: number;
  avgFocusScore: number;
  peakProductivityHour: string;
  mostUsedApp: string;
  contextSwitches: number;
}

// ============================================================================
// Journal Service Class
// ============================================================================

export class JournalService {
  private summaryService: SummaryService;

  constructor(summaryService: SummaryService) {
    this.summaryService = summaryService;
  }

  // ============================================================================
  // Journal Generation
  // ============================================================================

  /**
   * Generate journal for a specific date
   */
  generateDailyJournal(date: Date): DailyJournalData | null {
    // Get date boundaries
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Get hourly summaries for the day
    const summaries = getHourlySummaryByRange(dayStart, dayEnd);

    if (summaries.length === 0) {
      return null;
    }

    return this.computeJournal(summaries, dayStart);
  }

  /**
   * Generate journal for yesterday
   */
  generateYesterdayJournal(): DailyJournalData | null {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return this.generateDailyJournal(yesterday);
  }

  /**
   * Generate and save journal for yesterday
   */
  async saveYesterdayJournal(): Promise<number | null> {
    const journal = this.generateYesterdayJournal();

    if (!journal) {
      console.log('[journal] No activity yesterday');
      return null;
    }

    // Check if journal already exists
    const existing = getDailyJournalByDate(journal.date);
    if (existing) {
      console.log('[journal] Journal already exists for', journal.date.toDateString());
      return existing.id;
    }

    try {
      const id = insertDailyJournal({
        journalDate: journal.date.getTime(),
        overview: journal.overview,
        highlights: journal.highlights,
        focusAreas: journal.focusAreas,
        synced: false,
      });

      console.log('[journal] Saved daily journal for:', journal.date.toDateString());
      return id;
    } catch (error) {
      console.error('[journal] Failed to save daily journal:', error);
      return null;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private computeJournal(summaries: HourlySummary[], date: Date): DailyJournalData {
    // Aggregate data
    let totalMinutes = 0;
    let totalFocusScore = 0;
    let totalSwitches = 0;
    const appMinutes = new Map<string, { minutes: number; category: string }>();
    const categoryMinutes = new Map<string, { minutes: number; apps: Set<string> }>();
    const hourlyData: { hour: number; minutes: number; focusScore: number }[] = [];

    for (const summary of summaries) {
      totalMinutes += summary.totalMinutes;
      totalFocusScore += summary.focusScore;

      // Track hourly data
      const hour = new Date(summary.hourStart).getHours();
      hourlyData.push({
        hour,
        minutes: summary.totalMinutes,
        focusScore: summary.focusScore,
      });

      // Aggregate app usage
      const breakdown = summary.appBreakdown as AppBreakdown[];
      for (const app of breakdown) {
        // App tracking
        const existing = appMinutes.get(app.appName);
        if (existing) {
          existing.minutes += app.minutes;
        } else {
          appMinutes.set(app.appName, { minutes: app.minutes, category: app.category });
        }

        // Category tracking
        const catExisting = categoryMinutes.get(app.category);
        if (catExisting) {
          catExisting.minutes += app.minutes;
          catExisting.apps.add(app.appName);
        } else {
          categoryMinutes.set(app.category, {
            minutes: app.minutes,
            apps: new Set([app.appName]),
          });
        }
      }
    }

    // Calculate averages
    const avgFocusScore =
      summaries.length > 0 ? Math.round((totalFocusScore / summaries.length) * 100) / 100 : 0;

    // Find peak productivity hour
    const peakHour = hourlyData.reduce(
      (best, current) =>
        current.focusScore > best.focusScore ? current : best,
      { hour: 0, minutes: 0, focusScore: 0 }
    );
    const peakProductivityHour = this.formatHour(peakHour.hour);

    // Find most used app
    let mostUsedApp = 'None';
    let maxAppMinutes = 0;
    for (const [app, data] of appMinutes) {
      if (data.minutes > maxAppMinutes) {
        maxAppMinutes = data.minutes;
        mostUsedApp = app;
      }
    }

    // Generate focus areas
    const focusAreas = this.generateFocusAreas(categoryMinutes, totalMinutes);

    // Generate highlights
    const highlights = this.generateHighlights(hourlyData, categoryMinutes, totalMinutes, avgFocusScore);

    // Generate overview
    const overview = this.generateOverview(
      date,
      totalMinutes,
      avgFocusScore,
      mostUsedApp,
      focusAreas[0]?.category || 'various activities',
      highlights
    );

    return {
      date,
      overview,
      highlights,
      focusAreas,
      totalActiveMinutes: totalMinutes,
      avgFocusScore,
      peakProductivityHour,
      mostUsedApp,
      contextSwitches: totalSwitches,
    };
  }

  private generateFocusAreas(
    categoryMinutes: Map<string, { minutes: number; apps: Set<string> }>,
    totalMinutes: number
  ): FocusArea[] {
    const areas: FocusArea[] = [];

    for (const [category, data] of categoryMinutes) {
      areas.push({
        category,
        minutes: data.minutes,
        percentage: totalMinutes > 0 ? Math.round((data.minutes / totalMinutes) * 100) : 0,
        apps: Array.from(data.apps).slice(0, 5),
      });
    }

    return areas.sort((a, b) => b.minutes - a.minutes);
  }

  private generateHighlights(
    hourlyData: { hour: number; minutes: number; focusScore: number }[],
    categoryMinutes: Map<string, { minutes: number; apps: Set<string> }>,
    totalMinutes: number,
    avgFocusScore: number
  ): DayHighlight[] {
    const highlights: DayHighlight[] = [];

    // Check for high focus sessions
    const highFocusHours = hourlyData.filter((h) => h.focusScore > 0.7);
    if (highFocusHours.length >= 2) {
      const streak = this.findLongestStreak(highFocusHours.map((h) => h.hour));
      if (streak.length >= 2) {
        highlights.push({
          type: 'productive_streak',
          description: `${streak.length}-hour productive streak`,
          timeRange: `${this.formatHour(streak[0])} - ${this.formatHour(streak[streak.length - 1] + 1)}`,
          durationMinutes: streak.length * 60,
        });
      }
    }

    // Check for deep work achievement
    const devMinutes = categoryMinutes.get('Development')?.minutes || 0;
    const productivityMinutes = categoryMinutes.get('Productivity')?.minutes || 0;
    const deepWorkMinutes = devMinutes + productivityMinutes;
    if (deepWorkMinutes >= 120) {
      highlights.push({
        type: 'achievement',
        description: `${Math.round(deepWorkMinutes / 60)} hours of deep work`,
        durationMinutes: deepWorkMinutes,
      });
    }

    // Check for meeting-heavy day
    const meetingMinutes = categoryMinutes.get('Meetings')?.minutes || 0;
    if (meetingMinutes >= 120 && meetingMinutes / totalMinutes > 0.3) {
      highlights.push({
        type: 'meeting_heavy',
        description: `${Math.round(meetingMinutes / 60)} hours in meetings`,
        durationMinutes: meetingMinutes,
      });
    }

    // Check for communication-heavy day
    const commMinutes = categoryMinutes.get('Communication')?.minutes || 0;
    if (commMinutes >= 60 && commMinutes / totalMinutes > 0.2) {
      highlights.push({
        type: 'communication_heavy',
        description: `${Math.round(commMinutes / 60)} hours in communication apps`,
        durationMinutes: commMinutes,
      });
    }

    // Check for focus session achievement
    if (avgFocusScore >= 0.6) {
      highlights.push({
        type: 'focus_session',
        description: `High focus day (${Math.round(avgFocusScore * 100)}% score)`,
      });
    }

    return highlights.slice(0, 5); // Max 5 highlights
  }

  private generateOverview(
    date: Date,
    totalMinutes: number,
    avgFocusScore: number,
    mostUsedApp: string,
    topCategory: string,
    highlights: DayHighlight[]
  ): string {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const hours = Math.round(totalMinutes / 60 * 10) / 10;
    const focusPercent = Math.round(avgFocusScore * 100);

    let overview = `On ${dayName}, you were active for ${hours} hours with a ${focusPercent}% focus score. `;
    overview += `Most time was spent in ${mostUsedApp}, primarily doing ${topCategory.toLowerCase()}. `;

    // Add highlight mentions
    if (highlights.length > 0) {
      const highlightTexts = highlights
        .slice(0, 2)
        .map((h) => h.description.toLowerCase());
      overview += `Notable: ${highlightTexts.join(', ')}.`;
    }

    return overview;
  }

  private findLongestStreak(hours: number[]): number[] {
    if (hours.length === 0) return [];

    const sorted = [...hours].sort((a, b) => a - b);
    let longest: number[] = [sorted[0]];
    let current: number[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1] + 1) {
        current.push(sorted[i]);
      } else {
        if (current.length > longest.length) {
          longest = [...current];
        }
        current = [sorted[i]];
      }
    }

    if (current.length > longest.length) {
      longest = current;
    }

    return longest;
  }

  private formatHour(hour: number): string {
    if (hour === 0) return '12am';
    if (hour === 12) return '12pm';
    if (hour < 12) return `${hour}am`;
    return `${hour - 12}pm`;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get journal for a specific date
   */
  getJournal(date: Date): DailyJournal | null {
    return getDailyJournalByDate(date);
  }

  /**
   * Get today's journal (or generate it)
   */
  getTodayJournal(): DailyJournalData | null {
    return this.generateDailyJournal(new Date());
  }

  /**
   * Get unsynced journals for cloud sync
   */
  getUnsyncedJournals(): DailyJournal[] {
    return getUnsyncedDailyJournals();
  }

  /**
   * Mark journal as synced
   */
  markAsSynced(id: number): void {
    markDailyJournalAsSynced(id);
  }

  /**
   * Get journal summary for SYNC AI
   */
  getJournalForSync(date: Date): string {
    const journal = this.generateDailyJournal(date);

    if (!journal) {
      return 'No activity data available for this day.';
    }

    const lines: string[] = [];

    lines.push(journal.overview);
    lines.push('');

    // Focus areas
    if (journal.focusAreas.length > 0) {
      const areasSummary = journal.focusAreas
        .slice(0, 3)
        .map((a) => `${a.category} (${a.percentage}%)`)
        .join(', ');
      lines.push(`Focus areas: ${areasSummary}`);
    }

    // Highlights
    if (journal.highlights.length > 0) {
      lines.push('Highlights:');
      for (const h of journal.highlights.slice(0, 3)) {
        lines.push(`- ${h.description}`);
      }
    }

    // Stats
    lines.push('');
    lines.push(`Peak productivity: ${journal.peakProductivityHour}`);
    lines.push(`Most used app: ${journal.mostUsedApp}`);

    return lines.join('\n');
  }

  /**
   * Get weekly summary
   */
  getWeeklySummary(): {
    totalHours: number;
    avgFocusScore: number;
    topApps: { app: string; hours: number }[];
    topCategories: { category: string; hours: number }[];
    dailyStats: { date: Date; hours: number; focusScore: number }[];
  } {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const summaries = getHourlySummaryByRange(weekAgo, today);

    if (summaries.length === 0) {
      return {
        totalHours: 0,
        avgFocusScore: 0,
        topApps: [],
        topCategories: [],
        dailyStats: [],
      };
    }

    // Group by day
    const dailyMap = new Map<string, { minutes: number; focusScores: number[]; date: Date }>();
    const appMinutes = new Map<string, number>();
    const categoryMinutes = new Map<string, number>();
    let totalFocusScore = 0;

    for (const summary of summaries) {
      const date = new Date(summary.hourStart);
      const dateKey = date.toDateString();

      // Daily aggregation
      const existing = dailyMap.get(dateKey);
      if (existing) {
        existing.minutes += summary.totalMinutes;
        existing.focusScores.push(summary.focusScore);
      } else {
        dailyMap.set(dateKey, {
          minutes: summary.totalMinutes,
          focusScores: [summary.focusScore],
          date: new Date(date.setHours(0, 0, 0, 0)),
        });
      }

      totalFocusScore += summary.focusScore;

      // App/category aggregation
      const breakdown = summary.appBreakdown as AppBreakdown[];
      for (const app of breakdown) {
        appMinutes.set(app.appName, (appMinutes.get(app.appName) || 0) + app.minutes);
        categoryMinutes.set(app.category, (categoryMinutes.get(app.category) || 0) + app.minutes);
      }
    }

    // Convert to results
    const totalMinutes = Array.from(dailyMap.values()).reduce((sum, d) => sum + d.minutes, 0);

    const dailyStats = Array.from(dailyMap.values())
      .map((d) => ({
        date: d.date,
        hours: Math.round((d.minutes / 60) * 10) / 10,
        focusScore:
          d.focusScores.length > 0
            ? Math.round(
                (d.focusScores.reduce((sum, s) => sum + s, 0) / d.focusScores.length) * 100
              ) / 100
            : 0,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const topApps = Array.from(appMinutes.entries())
      .map(([app, mins]) => ({ app, hours: Math.round((mins / 60) * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);

    const topCategories = Array.from(categoryMinutes.entries())
      .map(([category, mins]) => ({ category, hours: Math.round((mins / 60) * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours);

    return {
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      avgFocusScore:
        summaries.length > 0 ? Math.round((totalFocusScore / summaries.length) * 100) / 100 : 0,
      topApps,
      topCategories,
      dailyStats,
    };
  }
}
