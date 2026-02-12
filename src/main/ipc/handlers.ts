/**
 * IPC Handlers
 *
 * Handle communication between main and renderer processes.
 */

import { ipcMain, shell, systemPreferences, app } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipcChannels';
import { AppSettings } from '../../shared/types';
import { WEB_APP_URL, AUTH_CALLBACK_PATH } from '../../shared/constants';
import {
  getFloatingWidget,
  expandToChat,
  expandToVoice,
  collapseToAvatar,
  moveWidget,
} from '../windows/floatingWidget';
import { ActivityTracker } from '../services/activityTracker';
import {
  getContextManager,
  getSummaryService,
  getJournalService,
  getCloudSyncService,
  getDeepContextManager,
} from '../index';
import { getRecentActivity, getTodayJournal, getJournalHistory } from '../db/queries';
import {
  store,
  getSettings,
  updateSettings,
  getAccessToken,
  getUser,
  setUser,
  setAuthState,
  clearAuth,
  getTogetherApiKey,
  setTogetherApiKey,
} from '../store';

// Supabase config for fetching user info
const SUPABASE_URL = 'https://sfxpmzicgpaxfntqleig.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmeHBtemljZ3BheGZudHFsZWlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NjIsImV4cCI6MjA4MjE4MjQ2Mn0.337ohi8A4zu_6Hl1LpcPaWP8UkI5E4Om7ZgeU9_A8t4';

// Fetch user info from Supabase (used when token exists but user is missing)
async function fetchUserInfo(accessToken: string) {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error('[ipc] Failed to fetch user info:', response.status);
      return null;
    }

    const authUser = await response.json();

    // Get user record from users table for company_id
    const userResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${authUser.id}&select=id,email,full_name,company_id`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!userResponse.ok) {
      return {
        id: authUser.id,
        email: authUser.email,
        fullName: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
        companyId: authUser.user_metadata?.company_id || null,
      };
    }

    const users = await userResponse.json();
    if (users && users.length > 0) {
      return {
        id: users[0].id,
        email: users[0].email,
        fullName: users[0].full_name || authUser.email?.split('@')[0] || 'User',
        companyId: users[0].company_id || null,
      };
    }

    return {
      id: authUser.id,
      email: authUser.email,
      fullName: authUser.email?.split('@')[0] || 'User',
      companyId: null,
    };
  } catch (error) {
    console.error('[ipc] Error fetching user info:', error);
    return null;
  }
}

// ============================================================================
// Setup
// ============================================================================

export function setupIpcHandlers(
  _store: typeof store,  // Keep parameter for compatibility
  activityTracker: ActivityTracker | null
): void {
  // ============================================================================
  // Window Management
  // ============================================================================

  ipcMain.handle(IPC_CHANNELS.WINDOW_EXPAND, (_event, mode: 'chat' | 'voice') => {
    if (mode === 'chat') {
      expandToChat();
    } else if (mode === 'voice') {
      expandToVoice();
    }
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_COLLAPSE, () => {
    collapseToAvatar();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MOVE, (_event, { x, y }: { x: number; y: number }) => {
    moveWidget(x, y);
    return { success: true };
  });

  // ============================================================================
  // Activity Tracking
  // ============================================================================

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_GET_RECENT, (_event, minutes: number = 10) => {
    try {
      const activities = getRecentActivity(minutes);
      return { success: true, data: activities };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_GET_SUMMARY, (_event, minutes: number = 10) => {
    try {
      if (activityTracker) {
        const summary = activityTracker.getContextSummary(minutes);
        return { success: true, data: summary };
      }
      return { success: true, data: 'Activity tracking not enabled.' };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_STATUS, () => {
    return {
      success: true,
      data: {
        isTracking: !!activityTracker,
      },
    };
  });

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_GET_DETAILED_CONTEXT, (_event, minutes: number = 10) => {
    try {
      const contextManager = getContextManager();
      if (contextManager) {
        const context = contextManager.getFreshContext();
        return { success: true, data: context };
      }
      return { success: false, error: 'Context manager not available' };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_GET_CONTEXT_FOR_SYNC, () => {
    try {
      const contextManager = getContextManager();
      if (contextManager) {
        const context = contextManager.getContextForSync();
        return { success: true, data: context };
      }
      return { success: true, data: '' };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ============================================================================
  // Productivity Stats
  // ============================================================================

  ipcMain.handle(IPC_CHANNELS.STATS_GET_TODAY, () => {
    try {
      const summaryService = getSummaryService();
      if (summaryService) {
        const stats = summaryService.getTodayStats();
        return { success: true, data: stats };
      }
      return { success: false, error: 'Summary service not available' };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.STATS_GET_WEEKLY, () => {
    try {
      const journalService = getJournalService();
      if (journalService) {
        const summary = journalService.getWeeklySummary();
        return { success: true, data: summary };
      }
      return { success: false, error: 'Journal service not available' };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ============================================================================
  // Cloud Sync
  // ============================================================================

  ipcMain.handle(IPC_CHANNELS.CLOUD_SYNC_NOW, async () => {
    try {
      const cloudSyncService = getCloudSyncService();
      if (cloudSyncService) {
        const result = await cloudSyncService.forceSync();
        return { success: true, data: result };
      }
      return { success: false, error: 'Cloud sync service not available' };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CLOUD_SYNC_STATUS, () => {
    try {
      const cloudSyncService = getCloudSyncService();
      if (cloudSyncService) {
        const status = cloudSyncService.getStatus();
        return { success: true, data: status };
      }
      return { success: false, error: 'Cloud sync service not available' };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ============================================================================
  // Authentication
  // ============================================================================

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async () => {
    try {
      // Generate state for CSRF protection
      const state = crypto.randomUUID();
      setAuthState(state);

      // Open browser to login page
      const loginUrl = `${WEB_APP_URL}${AUTH_CALLBACK_PATH}?state=${state}`;
      await shell.openExternal(loginUrl);

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, () => {
    clearAuth();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_STATUS, async () => {
    const accessToken = getAccessToken();
    let user = getUser();

    // If we have token but no user, try to fetch user info
    if (accessToken && !user) {
      console.log('[ipc] Token exists but user missing, fetching user info...');
      const userInfo = await fetchUserInfo(accessToken);
      if (userInfo) {
        setUser(userInfo);
        user = userInfo;
        console.log('[ipc] User info fetched and saved:', userInfo.email);
      } else {
        // Token might be expired, clear auth
        console.log('[ipc] Failed to fetch user info, token may be expired');
        clearAuth();
        return {
          success: true,
          data: {
            isAuthenticated: false,
            accessToken: null,
            user: null,
          },
        };
      }
    }

    return {
      success: true,
      data: {
        isAuthenticated: !!accessToken && !!user,
        accessToken,
        user,
      },
    };
  });

  // ============================================================================
  // Settings
  // ============================================================================

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    try {
      const settings = getSettings();
      return { success: true, data: settings };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, updates: Partial<AppSettings>) => {
    try {
      const newSettings = updateSettings(updates);
      return { success: true, data: newSettings };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_API_KEY, (_event, key: string | null) => {
    try {
      setTogetherApiKey(key);

      // Update the semantic analyzer with the new key
      const deepContext = getDeepContextManager();
      if (deepContext) {
        deepContext.updateSettings({});
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_API_KEY_STATUS, () => {
    try {
      const key = getTogetherApiKey();
      return {
        success: true,
        data: {
          hasKey: !!key,
          keyPreview: key ? `${key.substring(0, 8)}...` : null
        }
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ============================================================================
  // Journal
  // ============================================================================

  ipcMain.handle(IPC_CHANNELS.JOURNAL_GET_TODAY, () => {
    try {
      const journal = getTodayJournal();
      return { success: true, data: journal };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.JOURNAL_GET_HISTORY, (_event, days: number = 30) => {
    try {
      const journals = getJournalHistory(days);
      return { success: true, data: journals };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ============================================================================
  // System
  // ============================================================================

  ipcMain.handle(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, async (_event, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_INFO, () => {
    return {
      success: true,
      data: {
        platform: process.platform,
        version: app.getVersion(),
        name: app.getName(),
      },
    };
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_CHECK_PERMISSIONS, async () => {
    const permissions: Record<string, boolean> = {
      accessibility: true,
      screenCapture: true,
    };

    if (process.platform === 'darwin') {
      // Check accessibility permission (required for active-win)
      permissions.accessibility =
        systemPreferences.isTrustedAccessibilityClient(false);

      // Check screen capture permission
      const screenStatus = systemPreferences.getMediaAccessStatus('screen');
      permissions.screenCapture = screenStatus === 'granted';
    }

    return { success: true, data: permissions };
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_REQUEST_PERMISSION, async (_event, permission: string) => {
    if (process.platform === 'darwin') {
      if (permission === 'accessibility') {
        // This will prompt the user to grant accessibility permission
        systemPreferences.isTrustedAccessibilityClient(true);
        return { success: true };
      }
      if (permission === 'screenCapture') {
        // For screen capture, we need to trigger a capture to prompt
        // This is handled automatically when we first try to capture
        return { success: true };
      }
    }
    return { success: true };
  });

  // ============================================================================
  // Deep Context
  // ============================================================================

  ipcMain.handle(IPC_CHANNELS.DEEP_CONTEXT_STATUS, () => {
    try {
      const deepContext = getDeepContextManager();
      if (deepContext) {
        return {
          success: true,
          data: {
            isRunning: deepContext.isRunning(),
            stats: deepContext.getStats(),
          },
        };
      }
      return {
        success: true,
        data: {
          isRunning: false,
          stats: null,
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEEP_CONTEXT_GET_COMMITMENTS, (_event, status?: string) => {
    try {
      const deepContext = getDeepContextManager();
      if (deepContext) {
        const commitments = deepContext.getCommitments(status as 'pending' | 'completed' | 'expired' | 'dismissed' | undefined);
        return { success: true, data: commitments };
      }
      return { success: true, data: [] };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEEP_CONTEXT_GET_PENDING_FOLLOWUPS, () => {
    try {
      const deepContext = getDeepContextManager();
      if (deepContext) {
        const followUps = deepContext.getPendingFollowUps();
        return { success: true, data: followUps };
      }
      return { success: true, data: [] };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEEP_CONTEXT_DISMISS_COMMITMENT, (_event, commitmentId: number) => {
    try {
      const deepContext = getDeepContextManager();
      if (deepContext) {
        deepContext.dismissCommitment(commitmentId);
        return { success: true };
      }
      return { success: false, error: 'Deep context manager not available' };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEEP_CONTEXT_COMPLETE_COMMITMENT, (_event, commitmentId: number) => {
    try {
      const deepContext = getDeepContextManager();
      if (deepContext) {
        deepContext.completeCommitment(commitmentId);
        return { success: true };
      }
      return { success: false, error: 'Deep context manager not available' };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEEP_CONTEXT_GET_ENRICHED_CONTEXT, () => {
    try {
      const deepContext = getDeepContextManager();
      if (deepContext) {
        const context = deepContext.getEnrichedContextForSync();
        return { success: true, data: context };
      }
      return { success: true, data: null };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  console.log('[ipc] Handlers registered');
}
