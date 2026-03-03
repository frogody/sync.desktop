/**
 * SignatureComputer — Stage 5: Behavioral Signatures
 *
 * Computes long-term behavioral patterns from accumulated semantic data.
 * Runs on a 6-hour scheduler cycle, analyzing activity/thread/entity data
 * over a configurable window (default 30 days) to produce stable metrics.
 *
 * Categories: rhythm, workflow, quality, collaboration, tool, stress
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  BehavioralSignature,
  SignatureCategory,
  SignatureTrend,
  SemanticActivity,
  ActivityType,
} from './types';
import {
  getActivitiesByTimeRange,
  getActivityDistribution,
  getActiveThreads,
  getRecentEntities,
  upsertSignature,
} from '../../db/queries';

// ============================================================================
// SignatureComputer Class
// ============================================================================

export class SignatureComputer {

  /**
   * Compute all signature categories for a given time window.
   * Called by the 6-hour scheduler cycle.
   */
  computeAll(windowDays: number = 30): void {
    console.log(`[signature] Computing all signatures for ${windowDays}-day window`);

    const now = Date.now();
    const windowStart = now - windowDays * 24 * 60 * 60 * 1000;
    const activities = getActivitiesByTimeRange(windowStart, now);

    if (activities.length === 0) {
      console.log('[signature] No activities in window, skipping computation');
      return;
    }

    // Previous window for trend comparison
    const prevWindowStart = windowStart - windowDays * 24 * 60 * 60 * 1000;
    const prevActivities = getActivitiesByTimeRange(prevWindowStart, windowStart);

    try {
      this.computeRhythmSignatures(windowDays, activities, prevActivities);
    } catch (err) {
      console.error('[signature] Rhythm computation failed:', err);
    }

    try {
      this.computeWorkflowSignatures(windowDays, activities, prevActivities);
    } catch (err) {
      console.error('[signature] Workflow computation failed:', err);
    }

    try {
      this.computeQualitySignatures(windowDays, activities, prevActivities);
    } catch (err) {
      console.error('[signature] Quality computation failed:', err);
    }

    try {
      this.computeCollaborationSignatures(windowDays, activities, prevActivities);
    } catch (err) {
      console.error('[signature] Collaboration computation failed:', err);
    }

    try {
      this.computeToolSignatures(windowDays);
    } catch (err) {
      console.error('[signature] Tool computation failed:', err);
    }

    try {
      this.computeStressSignatures(windowDays, activities, prevActivities);
    } catch (err) {
      console.error('[signature] Stress computation failed:', err);
    }

    console.log('[signature] All signatures computed');
  }

  // ============================================================================
  // Category: Rhythm
  // ============================================================================

  private computeRhythmSignatures(
    windowDays: number,
    activities: SemanticActivity[],
    prevActivities: SemanticActivity[]
  ): void {
    // Group activities by hour-of-day
    const hourCounts = new Array(24).fill(0);
    for (const a of activities) {
      const hour = new Date(a.createdAt).getHours();
      hourCounts[hour]++;
    }

    // Peak hours: top 3 by activity count
    const peakHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(h => h.hour);

    this.upsert('rhythm', 'peak_hours', peakHours, windowDays, activities.length, 0.8);

    // Deep work windows: contiguous blocks of BUILDING/INVESTIGATING lasting 90+ min
    const deepWorkWindows = this.findDeepWorkWindows(activities);
    this.upsert('rhythm', 'deep_work_windows', deepWorkWindows, windowDays, activities.length, 0.7);

    // Average start/end times
    const dayMap = new Map<string, { first: number; last: number }>();
    for (const a of activities) {
      const date = new Date(a.createdAt).toDateString();
      const hour = new Date(a.createdAt).getHours() + new Date(a.createdAt).getMinutes() / 60;
      const existing = dayMap.get(date);
      if (!existing) {
        dayMap.set(date, { first: hour, last: hour });
      } else {
        if (hour < existing.first) existing.first = hour;
        if (hour > existing.last) existing.last = hour;
      }
    }

    if (dayMap.size > 0) {
      const days = Array.from(dayMap.values());
      const avgStart = days.reduce((s, d) => s + d.first, 0) / days.length;
      const avgEnd = days.reduce((s, d) => s + d.last, 0) / days.length;
      this.upsert(
        'rhythm', 'start_end_times',
        { avgStart: Math.round(avgStart * 100) / 100, avgEnd: Math.round(avgEnd * 100) / 100 },
        windowDays, dayMap.size, 0.75
      );
    }

    // Break patterns: gaps > 5 min between activities
    const sorted = [...activities].sort((a, b) => a.createdAt - b.createdAt);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const gapMs = sorted[i].createdAt - sorted[i - 1].createdAt;
      const gapMin = gapMs / 60000;
      if (gapMin > 5 && gapMin < 480) { // 5 min to 8 hours (ignore overnight)
        gaps.push(gapMin);
      }
    }

    if (gaps.length > 0) {
      const avgInterval = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      this.upsert(
        'rhythm', 'break_patterns',
        { avgIntervalMin: Math.round(avgInterval * 10) / 10, breakCount: gaps.length },
        windowDays, gaps.length, 0.7
      );
    }
  }

  // ============================================================================
  // Category: Workflow
  // ============================================================================

  private computeWorkflowSignatures(
    windowDays: number,
    activities: SemanticActivity[],
    prevActivities: SemanticActivity[]
  ): void {
    const threads = getActiveThreads();
    const totalHours = this.estimateActiveHours(activities);

    // Context switch rate: thread switches per hour
    // Approximate by counting distinct threadId changes in activity sequence
    // Since activities don't directly carry threadId, we estimate from activity type transitions
    const typeTransitions = this.countTypeTransitions(activities);
    const switchRate = totalHours > 0 ? typeTransitions / totalHours : 0;
    const prevSwitchRate = this.computePrevSwitchRate(prevActivities);
    const switchTrend = this.computeTrend(switchRate, prevSwitchRate);

    this.upsert('workflow', 'context_switch_rate', Math.round(switchRate * 100) / 100, windowDays, activities.length, 0.6, switchTrend);

    // Average thread duration (minutes) — from active threads
    if (threads.length > 0) {
      const now = Date.now();
      const durations = threads.map(t => (now - t.startedAt) / 60000);
      const avgDuration = durations.reduce((s, d) => s + d, 0) / durations.length;
      this.upsert('workflow', 'avg_thread_duration', Math.round(avgDuration), windowDays, threads.length, 0.65);
    }

    // Multitasking index: fraction of hours with 3+ active activity types
    const multitaskingIndex = this.computeMultitaskingIndex(activities);
    this.upsert('workflow', 'multitasking_index', Math.round(multitaskingIndex * 100) / 100, windowDays, activities.length, 0.6);

    // Flow state frequency: contiguous BUILDING/INVESTIGATING blocks > 90 min per day
    const deepWorkWindows = this.findDeepWorkWindows(activities);
    const activeDays = this.countActiveDays(activities);
    const flowFrequency = activeDays > 0 ? deepWorkWindows.length / activeDays : 0;
    this.upsert('workflow', 'flow_state_frequency', Math.round(flowFrequency * 100) / 100, windowDays, activities.length, 0.65);
  }

  // ============================================================================
  // Category: Quality
  // ============================================================================

  private computeQualitySignatures(
    windowDays: number,
    activities: SemanticActivity[],
    prevActivities: SemanticActivity[]
  ): void {
    const distribution = getActivityDistribution(windowDays);
    const total = distribution.reduce((s, d) => s + d.count, 0);

    if (total === 0) return;

    const buildCount = distribution.find(d => d.type === 'BUILDING')?.count || 0;
    const investigateCount = distribution.find(d => d.type === 'INVESTIGATING')?.count || 0;
    const reviewCount = activities.filter(a => a.activitySubtype === 'reviewing').length;

    // Deep work ratio: (BUILDING + INVESTIGATING) / total
    const deepWorkRatio = (buildCount + investigateCount) / total;
    const prevDeepRatio = this.computePrevDeepWorkRatio(prevActivities);
    const deepTrend = this.computeTrend(deepWorkRatio, prevDeepRatio);

    this.upsert('quality', 'deep_work_ratio', Math.round(deepWorkRatio * 1000) / 1000, windowDays, total, 0.8, deepTrend);

    // Investigation to build ratio
    const invToBuildRatio = buildCount > 0 ? investigateCount / buildCount : 0;
    this.upsert('quality', 'investigation_to_build_ratio', Math.round(invToBuildRatio * 100) / 100, windowDays, total, 0.7);

    // Review frequency per day
    const activeDays = this.countActiveDays(activities);
    const reviewFreq = activeDays > 0 ? reviewCount / activeDays : 0;
    this.upsert('quality', 'review_frequency', Math.round(reviewFreq * 100) / 100, windowDays, reviewCount, 0.65);
  }

  // ============================================================================
  // Category: Collaboration
  // ============================================================================

  private computeCollaborationSignatures(
    windowDays: number,
    activities: SemanticActivity[],
    prevActivities: SemanticActivity[]
  ): void {
    const distribution = getActivityDistribution(windowDays);
    const total = distribution.reduce((s, d) => s + d.count, 0);

    if (total === 0) return;

    const commCount = distribution.find(d => d.type === 'COMMUNICATING')?.count || 0;

    // Communication ratio
    const commRatio = commCount / total;
    this.upsert('collaboration', 'communication_ratio', Math.round(commRatio * 1000) / 1000, windowDays, total, 0.75);

    // Meeting load (hours/day based on 'meeting' subtype)
    const meetingActivities = activities.filter(a => a.activitySubtype === 'meeting');
    const activeDays = this.countActiveDays(activities);
    const meetingDurationMs = meetingActivities.reduce((s, a) => s + (a.durationMs || 0), 0);
    const meetingHoursPerDay = activeDays > 0 ? (meetingDurationMs / 3600000) / activeDays : 0;
    this.upsert('collaboration', 'meeting_load', Math.round(meetingHoursPerDay * 100) / 100, windowDays, meetingActivities.length, 0.7);

    // Async/sync ratio: (messaging + emailing) / meeting
    const asyncCount = activities.filter(a =>
      a.activitySubtype === 'messaging' || a.activitySubtype === 'emailing'
    ).length;
    const meetingCount = meetingActivities.length;
    const asyncSyncRatio = meetingCount > 0 ? asyncCount / meetingCount : asyncCount > 0 ? Infinity : 0;
    const ratioValue = asyncSyncRatio === Infinity ? -1 : Math.round(asyncSyncRatio * 100) / 100; // -1 = no meetings
    this.upsert('collaboration', 'async_sync_ratio', ratioValue, windowDays, asyncCount + meetingCount, 0.6);
  }

  // ============================================================================
  // Category: Tool
  // ============================================================================

  private computeToolSignatures(windowDays: number): void {
    const entities = getRecentEntities(200);
    const toolEntities = entities.filter(e => e.type === 'tool');

    if (toolEntities.length === 0) return;

    // Primary tools: top 5 most-used
    const primaryTools = toolEntities
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
      .slice(0, 5)
      .map(e => e.name);

    this.upsert('tool', 'primary_tools', primaryTools, windowDays, toolEntities.length, 0.8);

    // Tool diversity: unique tools
    this.upsert('tool', 'tool_diversity', toolEntities.length, windowDays, toolEntities.length, 0.75);
  }

  // ============================================================================
  // Category: Stress
  // ============================================================================

  private computeStressSignatures(
    windowDays: number,
    activities: SemanticActivity[],
    prevActivities: SemanticActivity[]
  ): void {
    if (activities.length === 0) return;

    // After-hours ratio: activities after 18:00
    const afterHoursCount = activities.filter(a => new Date(a.createdAt).getHours() >= 18).length;
    const afterHoursRatio = afterHoursCount / activities.length;
    const prevAfterHours = this.computePrevAfterHoursRatio(prevActivities);
    const afterHoursTrend = this.computeTrend(afterHoursRatio, prevAfterHours);

    this.upsert('stress', 'after_hours_ratio', Math.round(afterHoursRatio * 1000) / 1000, windowDays, activities.length, 0.8, afterHoursTrend);

    // Weekend activity ratio
    const weekendCount = activities.filter(a => {
      const day = new Date(a.createdAt).getDay();
      return day === 0 || day === 6;
    }).length;
    const weekendRatio = weekendCount / activities.length;
    this.upsert('stress', 'weekend_activity', Math.round(weekendRatio * 1000) / 1000, windowDays, activities.length, 0.8);

    // Interrupt frequency: CONTEXT_SWITCHING activities per hour
    const switchCount = activities.filter(a => a.activityType === 'CONTEXT_SWITCHING').length;
    const totalHours = this.estimateActiveHours(activities);
    const interruptFreq = totalHours > 0 ? switchCount / totalHours : 0;
    this.upsert('stress', 'interrupt_frequency', Math.round(interruptFreq * 100) / 100, windowDays, switchCount, 0.65);
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private upsert(
    category: SignatureCategory,
    metricName: string,
    value: unknown,
    windowDays: number,
    sampleSize: number,
    confidence: number,
    trend?: SignatureTrend
  ): void {
    const now = Date.now();
    upsertSignature({
      signatureId: uuidv4(),
      category,
      metricName,
      currentValue: value,
      trend: trend || 'stable',
      confidence,
      sampleSize,
      windowDays,
      computedAt: now,
      privacyLevel: 'sync_allowed',
      synced: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Compute trend by comparing current value to previous window.
   * >10% increase = improving, >10% decrease = declining, else stable.
   */
  private computeTrend(current: number, previous: number | null): SignatureTrend {
    if (previous === null || previous === 0) return 'stable';
    const ratio = current / previous;
    if (ratio > 1.1) return 'improving';
    if (ratio < 0.9) return 'declining';
    return 'stable';
  }

  private findDeepWorkWindows(activities: SemanticActivity[]): { startHour: number; endHour: number }[] {
    const deepTypes: ActivityType[] = ['BUILDING', 'INVESTIGATING'];
    const sorted = activities
      .filter(a => deepTypes.includes(a.activityType))
      .sort((a, b) => a.createdAt - b.createdAt);

    if (sorted.length === 0) return [];

    const windows: { startHour: number; endHour: number }[] = [];
    let blockStart = sorted[0].createdAt;
    let blockEnd = sorted[0].createdAt;

    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].createdAt - blockEnd;
      // Allow up to 10-minute gaps within a deep work block
      if (gap <= 10 * 60 * 1000) {
        blockEnd = sorted[i].createdAt;
      } else {
        // Block ended — check if it lasted 90+ minutes
        const durationMin = (blockEnd - blockStart) / 60000;
        if (durationMin >= 90) {
          windows.push({
            startHour: new Date(blockStart).getHours(),
            endHour: new Date(blockEnd).getHours(),
          });
        }
        blockStart = sorted[i].createdAt;
        blockEnd = sorted[i].createdAt;
      }
    }

    // Check last block
    const lastDuration = (blockEnd - blockStart) / 60000;
    if (lastDuration >= 90) {
      windows.push({
        startHour: new Date(blockStart).getHours(),
        endHour: new Date(blockEnd).getHours(),
      });
    }

    return windows;
  }

  private estimateActiveHours(activities: SemanticActivity[]): number {
    if (activities.length === 0) return 0;
    const sorted = [...activities].sort((a, b) => a.createdAt - b.createdAt);
    const first = sorted[0].createdAt;
    const last = sorted[sorted.length - 1].createdAt;
    // Rough estimate: span in hours, but cap based on active days
    const spanHours = (last - first) / 3600000;
    const activeDays = this.countActiveDays(activities);
    // Assume ~8 hours of active time per day max
    return Math.min(spanHours, activeDays * 8);
  }

  private countActiveDays(activities: SemanticActivity[]): number {
    const days = new Set(activities.map(a => new Date(a.createdAt).toDateString()));
    return days.size;
  }

  private countTypeTransitions(activities: SemanticActivity[]): number {
    const sorted = [...activities].sort((a, b) => a.createdAt - b.createdAt);
    let transitions = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].activityType !== sorted[i - 1].activityType) {
        transitions++;
      }
    }
    return transitions;
  }

  private computeMultitaskingIndex(activities: SemanticActivity[]): number {
    // Group by hour-slot, count how many have 3+ distinct activity types
    const hourSlots = new Map<string, Set<string>>();
    for (const a of activities) {
      const d = new Date(a.createdAt);
      const key = `${d.toDateString()}-${d.getHours()}`;
      if (!hourSlots.has(key)) hourSlots.set(key, new Set());
      hourSlots.get(key)!.add(a.activityType);
    }

    if (hourSlots.size === 0) return 0;
    const multitaskHours = Array.from(hourSlots.values()).filter(s => s.size >= 3).length;
    return multitaskHours / hourSlots.size;
  }

  private computePrevSwitchRate(prevActivities: SemanticActivity[]): number | null {
    if (prevActivities.length === 0) return null;
    const transitions = this.countTypeTransitions(prevActivities);
    const hours = this.estimateActiveHours(prevActivities);
    return hours > 0 ? transitions / hours : null;
  }

  private computePrevDeepWorkRatio(prevActivities: SemanticActivity[]): number | null {
    if (prevActivities.length === 0) return null;
    const build = prevActivities.filter(a => a.activityType === 'BUILDING').length;
    const investigate = prevActivities.filter(a => a.activityType === 'INVESTIGATING').length;
    return (build + investigate) / prevActivities.length;
  }

  private computePrevAfterHoursRatio(prevActivities: SemanticActivity[]): number | null {
    if (prevActivities.length === 0) return null;
    const after = prevActivities.filter(a => new Date(a.createdAt).getHours() >= 18).length;
    return after / prevActivities.length;
  }
}
