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
import { getAccessToken, getUser, setUser } from '../store';
import { refreshAccessToken } from './authUtils';
import { DeepContextEngine } from '../../deep-context';
import type { ContextEvent } from '../../deep-context/types';

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
    contextEvents: number;
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
  private deepContextEngine: DeepContextEngine | null;
  private isSyncing: boolean = false;
  private lastSyncTime: Date | null = null;
  private syncErrors: string[] = [];

  constructor(
    summaryService: SummaryService,
    journalService: JournalService,
    deepContextEngine?: DeepContextEngine
  ) {
    this.summaryService = summaryService;
    this.journalService = journalService;
    this.deepContextEngine = deepContextEngine || null;
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
    body?: any,
    isRetry: boolean = false,
    upsert: boolean = false
  ): Promise<SupabaseResponse<T>> {
    const accessToken = getAccessToken();

    if (!accessToken) {
      return { error: { message: 'Not authenticated' } };
    }

    try {
      // Build Prefer header: upsert needs resolution=merge-duplicates
      let prefer = 'return=representation';
      if (method === 'POST') {
        prefer = upsert
          ? 'return=minimal,resolution=merge-duplicates'
          : 'return=minimal';
      }

      const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        method,
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': prefer,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      // Handle expired token — attempt refresh and retry once
      if ((response.status === 401 || response.status === 403) && !isRetry) {
        console.log('[sync] Token expired, attempting refresh...');
        const newToken = await refreshAccessToken();
        if (newToken) {
          console.log('[sync] Token refreshed, retrying request');
          return this.supabaseRequest<T>(endpoint, method, body, true, upsert);
        } else {
          console.error('[sync] Token refresh failed, cannot retry');
          return { error: { message: 'Authentication expired and refresh failed' } };
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        return { error: { message: `API error: ${response.status} - ${errorText}` } };
      }

      // Handle empty responses (return=minimal gives no body on 200/201/204)
      const contentLength = response.headers.get('content-length');
      const responseText = await response.text();
      if (!responseText || responseText.trim() === '') {
        return { data: null as any };
      }

      try {
        const data = JSON.parse(responseText);
        return { data };
      } catch {
        // Non-JSON response but request succeeded
        return { data: null as any };
      }
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
        syncedItems: { activities: 0, summaries: 0, journals: 0, contextEvents: 0 },
      };
    }

    if (!this.isAuthenticated()) {
      return {
        success: false,
        error: 'Not authenticated',
        syncedItems: { activities: 0, summaries: 0, journals: 0, contextEvents: 0 },
      };
    }

    this.isSyncing = true;
    this.syncErrors = [];

    const result: SyncResult = {
      success: true,
      syncedItems: { activities: 0, summaries: 0, journals: 0, contextEvents: 0 },
    };

    try {
      console.log('[sync] Starting cloud sync');

      // Sync hourly summaries
      const summaryCount = await this.syncHourlySummaries();
      result.syncedItems.summaries = summaryCount;

      // Sync daily journals
      const journalCount = await this.syncDailyJournals();
      result.syncedItems.journals = journalCount;

      // Sync deep context events
      const contextCount = await this.syncContextEvents();
      result.syncedItems.contextEvents = contextCount;

      // Note: We don't sync raw activity logs to save bandwidth
      // Summaries and journals contain the aggregated data

      this.lastSyncTime = new Date();
      console.log('[sync] Sync completed:', result.syncedItems);

      if (this.syncErrors.length > 0) {
        console.error('[sync] Sync errors:', this.syncErrors);
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

    const user = getUser();

    if (!user?.id) {
      console.error('[sync] Cannot sync summaries: user.id is missing');
      this.syncErrors.push('User ID missing - please re-authenticate');
      return 0;
    }
    if (!user?.companyId) {
      console.log('[sync] companyId missing for', user?.email, '— attempting to re-fetch user info...');
      const refreshedUser = await this.refreshUserInfo();
      if (refreshedUser?.companyId) {
        console.log('[sync] User info refreshed, companyId:', refreshedUser.companyId);
      } else {
        console.error('[sync] Cannot sync summaries: user.companyId still missing after refresh');
        this.syncErrors.push('Company ID missing for user ' + (user?.email || 'unknown') + ' — please sign out and sign in again');
        return 0;
      }
    }

    // Re-read user after potential refresh
    const currentUser = getUser()!;
    console.log(`[sync] Syncing ${unsynced.length} hourly summaries for user ${currentUser.email} (company: ${currentUser.companyId})`);
    let syncedCount = 0;

    for (const summary of unsynced) {
      try {
        const cloudData = {
          user_id: currentUser.id,
          company_id: currentUser.companyId,
          hour_start: new Date(summary.hourStart).toISOString(),
          app_breakdown: summary.appBreakdown,
          total_minutes: summary.totalMinutes,
          focus_score: summary.focusScore,
          ocr_text: summary.ocrText || null,
          semantic_category: summary.semanticCategory || null,
          commitments: summary.commitments || null,
        };

        // Use upsert to handle duplicate hours (unique_user_hour constraint)
        const { error } = await this.supabaseRequest(
          'desktop_activity_logs?on_conflict=user_id,hour_start',
          'POST',
          cloudData,
          false,
          true
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

    const user = getUser();

    if (!user?.id || !user?.companyId) {
      console.log('[sync] User data incomplete for journals, attempting refresh...');
      const refreshedUser = await this.refreshUserInfo();
      if (!refreshedUser?.id || !refreshedUser?.companyId) {
        console.error('[sync] Cannot sync journals: user data still incomplete after refresh');
        return 0;
      }
    }

    // Re-read user after potential refresh
    const currentUser = getUser()!;
    console.log(`[sync] Syncing ${unsynced.length} daily journals for user ${currentUser.email} (company: ${currentUser.companyId})`);
    let syncedCount = 0;

    for (const journal of unsynced) {
      try {
        const cloudData = {
          user_id: currentUser.id,
          company_id: currentUser.companyId,
          journal_date: new Date(journal.journalDate).toISOString().split('T')[0],
          overview: journal.overview,
          highlights: journal.highlights,
          focus_areas: journal.focusAreas,
        };

        // Use upsert to handle duplicate dates
        const { error } = await this.supabaseRequest(
          'daily_journals?on_conflict=user_id,journal_date',
          'POST',
          cloudData,
          false,
          true
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

  /**
   * Sync deep context events to cloud
   */
  private async syncContextEvents(): Promise<number> {
    if (!this.deepContextEngine) return 0;

    const user = getUser();
    if (!user?.id || !user?.companyId) return 0;

    const unsyncedEvents = this.deepContextEngine.getUnsyncedEvents(50);
    if (unsyncedEvents.length === 0) return 0;

    console.log(`[sync] Syncing ${unsyncedEvents.length} deep context events`);
    let syncedCount = 0;

    // Batch upload (chunks of 10)
    for (let i = 0; i < unsyncedEvents.length; i += 10) {
      const batch = unsyncedEvents.slice(i, i + 10);
      const cloudData = batch.map((event) => ({
        user_id: user.id,
        company_id: user.companyId,
        event_type: event.eventType,
        source_application: event.source.application,
        source_window_title: event.source.windowTitle?.substring(0, 200),
        summary: event.semanticPayload.summary,
        entities: event.semanticPayload.entities,
        intent: event.semanticPayload.intent || null,
        commitments: event.semanticPayload.commitments || [],
        skill_signals: event.semanticPayload.skillSignals || [],
        confidence: event.confidence,
        privacy_level: event.privacyLevel,
        created_at: new Date(event.timestamp).toISOString(),
      }));

      const { error } = await this.supabaseRequest(
        'desktop_context_events',
        'POST',
        cloudData
      );

      if (error) {
        console.error('[sync] Context events batch failed:', error.message);
        this.syncErrors.push(`Context events: ${error.message}`);
      } else {
        // Mark as synced locally
        const ids = batch
          .map((event) => event.id)
          .filter((id): id is number => id !== undefined);
        if (ids.length > 0) {
          this.deepContextEngine!.markEventsSynced(ids);
        }
        syncedCount += batch.length;
      }
    }

    return syncedCount;
  }

  // ============================================================================
  // User Info Refresh
  // ============================================================================

  /**
   * Re-fetch user info from Supabase when cached data is stale (e.g. missing companyId).
   * Updates the local store and returns the refreshed user, or null on failure.
   */
  private async refreshUserInfo(): Promise<User | null> {
    const accessToken = getAccessToken();
    if (!accessToken) return null;

    try {
      // 1. Get auth user from Supabase Auth
      const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!authResponse.ok) {
        console.error('[sync] refreshUserInfo: auth fetch failed:', authResponse.status);
        return null;
      }

      const authUser = await authResponse.json();

      // 2. Get user record from users table for company_id
      const userResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/users?id=eq.${authUser.id}&select=id,email,full_name,company_id`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      let userInfo: User;
      if (userResponse.ok) {
        const users = await userResponse.json();
        if (users && users.length > 0) {
          userInfo = {
            id: users[0].id,
            email: users[0].email,
            name: users[0].full_name || authUser.email?.split('@')[0] || 'User',
            companyId: users[0].company_id || null,
          };
        } else {
          userInfo = {
            id: authUser.id,
            email: authUser.email,
            name: authUser.email?.split('@')[0] || 'User',
            companyId: null,
          };
        }
      } else {
        userInfo = {
          id: authUser.id,
          email: authUser.email,
          name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
          companyId: authUser.user_metadata?.company_id || null,
        };
      }

      // 3. Update the local store
      setUser(userInfo);
      console.log('[sync] refreshUserInfo: updated user -', userInfo.email, 'companyId:', userInfo.companyId);
      return userInfo;
    } catch (error) {
      console.error('[sync] refreshUserInfo failed:', error);
      return null;
    }
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
