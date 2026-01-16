/**
 * Cloud Sync Service
 *
 * Syncs local activity data to Supabase cloud.
 * Handles authentication and offline-first sync.
 */

import { SummaryService } from './summaryService';
import { JournalService } from './journalService';
import { HourlySummary, DailyJournal, User } from '../../shared/types';
import { getUnsyncedActivity, markActivitySynced } from '../db/queries';
import { getAccessToken, getUser } from '../store';

// ============================================================================
// Constants
// ============================================================================

const SUPABASE_URL = 'https://sfxpmzicgpaxfntqleig.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmeHBtemljZ3BheGZudHFsZWlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NjIsImV4cCI6MjA4MjE4MjQ2Mn0.337ohi8A4zu_6Hl1LpcPaWP8UkI5E4Om7ZgeU9_A8t4';

// ============================================================================
// Types
// ============================================================================

export interface SyncResult {
  success: boolean;
  error?: string;
  syncedItems: {
    activities: number;
    summaries: number;
    journals: number;
  };
}

interface SupabaseResponse<T = any> {
  data?: T;
  error?: { message: string };
}

// ============================================================================
// Cloud Sync Service Class
// ============================================================================

export class CloudSyncService {
  private summaryService: SummaryService;
  private journalService: JournalService;
  private isSyncing: boolean = false;
  private lastSyncTime: Date | null = null;
  private syncErrors: string[] = [];

  constructor(summaryService: SummaryService, journalService: JournalService) {
    this.summaryService = summaryService;
    this.journalService = journalService;
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  isAuthenticated(): boolean {
    const token = getAccessToken();
    const user = getUser();
    const isAuth = !!token && !!user;
    if (!isAuth) {
      console.log('[sync] Not authenticated - token:', !!token, 'user:', !!user);
    }
    return isAuth;
  }

  // ============================================================================
  // API Helpers
  // ============================================================================

  private async supabaseRequest<T = any>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<SupabaseResponse<T>> {
    const accessToken = getAccessToken();

    if (!accessToken) {
      return { error: { message: 'Not authenticated' } };
    }

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        method,
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': method === 'POST' ? 'return=minimal' : 'return=representation',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { error: { message: `API error: ${response.status} - ${errorText}` } };
      }

      // Handle empty responses
      if (response.status === 201 || response.status === 204) {
        return { data: null as any };
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      return { error: { message: (error as Error).message } };
    }
  }

  // ============================================================================
  // Sync Operations
  // ============================================================================

  /**
   * Main sync method - syncs all unsynced data to cloud
   */
  async sync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        error: 'Sync already in progress',
        syncedItems: { activities: 0, summaries: 0, journals: 0 },
      };
    }

    if (!this.isAuthenticated()) {
      return {
        success: false,
        error: 'Not authenticated',
        syncedItems: { activities: 0, summaries: 0, journals: 0 },
      };
    }

    this.isSyncing = true;
    this.syncErrors = [];

    const result: SyncResult = {
      success: true,
      syncedItems: { activities: 0, summaries: 0, journals: 0 },
    };

    try {
      console.log('[sync] Starting cloud sync');

      // Sync hourly summaries
      const summaryCount = await this.syncHourlySummaries();
      result.syncedItems.summaries = summaryCount;

      // Sync daily journals
      const journalCount = await this.syncDailyJournals();
      result.syncedItems.journals = journalCount;

      // Note: We don't sync raw activity logs to save bandwidth
      // Summaries and journals contain the aggregated data

      this.lastSyncTime = new Date();
      console.log('[sync] Sync completed:', result.syncedItems);

      if (this.syncErrors.length > 0) {
        result.success = false;
        result.error = this.syncErrors.join('; ');
      }
    } catch (error) {
      console.error('[sync] Sync failed:', error);
      result.success = false;
      result.error = (error as Error).message;
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  /**
   * Sync hourly summaries to cloud
   */
  private async syncHourlySummaries(): Promise<number> {
    const unsynced = this.summaryService.getUnsyncedSummaries();

    if (unsynced.length === 0) {
      return 0;
    }

    console.log(`[sync] Syncing ${unsynced.length} hourly summaries`);
    const user = getUser();
    let syncedCount = 0;

    for (const summary of unsynced) {
      try {
        const cloudData = {
          user_id: user?.id,
          company_id: user?.companyId,
          hour_start: new Date(summary.hourStart).toISOString(),
          app_breakdown: summary.appBreakdown,
          total_minutes: summary.totalMinutes,
          focus_score: summary.focusScore,
        };

        const { error } = await this.supabaseRequest(
          'desktop_activity_logs',
          'POST',
          cloudData
        );

        if (error) {
          this.syncErrors.push(`Summary ${summary.id}: ${error.message}`);
          continue;
        }

        // Mark as synced locally
        this.summaryService.markAsSynced(summary.id);
        syncedCount++;
      } catch (error) {
        this.syncErrors.push(`Summary ${summary.id}: ${(error as Error).message}`);
      }
    }

    return syncedCount;
  }

  /**
   * Sync daily journals to cloud
   */
  private async syncDailyJournals(): Promise<number> {
    const unsynced = this.journalService.getUnsyncedJournals();

    if (unsynced.length === 0) {
      return 0;
    }

    console.log(`[sync] Syncing ${unsynced.length} daily journals`);
    const user = getUser();
    let syncedCount = 0;

    for (const journal of unsynced) {
      try {
        const cloudData = {
          user_id: user?.id,
          company_id: user?.companyId,
          journal_date: new Date(journal.journalDate).toISOString().split('T')[0],
          overview: journal.overview,
          highlights: journal.highlights,
          focus_areas: journal.focusAreas,
        };

        // Use upsert to handle duplicate dates
        const { error } = await this.supabaseRequest(
          'daily_journals?on_conflict=user_id,journal_date',
          'POST',
          cloudData
        );

        if (error) {
          this.syncErrors.push(`Journal ${journal.id}: ${error.message}`);
          continue;
        }

        // Mark as synced locally
        this.journalService.markAsSynced(journal.id);
        syncedCount++;
      } catch (error) {
        this.syncErrors.push(`Journal ${journal.id}: ${(error as Error).message}`);
      }
    }

    return syncedCount;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get sync status
   */
  getStatus(): {
    isSyncing: boolean;
    lastSyncTime: Date | null;
    isAuthenticated: boolean;
    pendingItems: { summaries: number; journals: number };
  } {
    const unsyncedSummaries = this.summaryService.getUnsyncedSummaries();
    const unsyncedJournals = this.journalService.getUnsyncedJournals();

    return {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      isAuthenticated: this.isAuthenticated(),
      pendingItems: {
        summaries: unsyncedSummaries.length,
        journals: unsyncedJournals.length,
      },
    };
  }

  /**
   * Get last sync errors
   */
  getLastErrors(): string[] {
    return [...this.syncErrors];
  }

  /**
   * Force immediate sync
   */
  async forceSync(): Promise<SyncResult> {
    return this.sync();
  }

  /**
   * Get context for SYNC AI from cloud (for cross-device context)
   */
  async getCloudContext(days: number = 7): Promise<{
    summaries: any[];
    journals: any[];
  } | null> {
    if (!this.isAuthenticated()) {
      return null;
    }

    const user = getUser();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    try {
      // Get recent summaries
      const summariesResult = await this.supabaseRequest(
        `desktop_activity_logs?user_id=eq.${user?.id}&hour_start=gte.${cutoffDate.toISOString()}&order=hour_start.desc&limit=100`
      );

      // Get recent journals
      const journalsResult = await this.supabaseRequest(
        `daily_journals?user_id=eq.${user?.id}&journal_date=gte.${cutoffDate.toISOString().split('T')[0]}&order=journal_date.desc&limit=7`
      );

      return {
        summaries: summariesResult.data || [],
        journals: journalsResult.data || [],
      };
    } catch (error) {
      console.error('[sync] Failed to fetch cloud context:', error);
      return null;
    }
  }
}
