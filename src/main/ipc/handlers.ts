/**
 * IPC Handlers
 *
 * Handle communication between main and renderer processes.
 */

import { ipcMain, shell, app } from 'electron';
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
  getNotchBridge,
  getDeepContextEngine,
  getEntityRegistry,
  getThreadManager,
  getIntentClassifier,
  getSignatureComputer,
} from '../index';
import { refreshAccessToken } from '../services/authUtils';
import {
  getRecentActivity,
  getTodayJournal,
  getJournalHistory,
  getRecentEntities,
  getActiveThreads,
  getActiveIntents,
  getAllCurrentSignatures,
  getActivityDistribution,
} from '../db/queries';
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
        name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
        companyId: authUser.user_metadata?.company_id || null,
      };
    }

    const users = await userResponse.json();
    if (users && users.length > 0) {
      return {
        id: users[0].id,
        email: users[0].email,
        name: users[0].full_name || authUser.email?.split('@')[0] || 'User',
        companyId: users[0].company_id || null,
      };
    }

    return {
      id: authUser.id,
      email: authUser.email,
      name: authUser.email?.split('@')[0] || 'User',
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
    // SEC-006: Validate mode parameter
    if (mode !== 'chat' && mode !== 'voice') {
      return { success: false, error: 'Invalid mode. Must be "chat" or "voice".' };
    }
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

  // Use 'on' (fire-and-forget) instead of 'handle' (async round-trip)
  // for window move — prevents IPC queue backup during fast drags
  ipcMain.on(IPC_CHANNELS.WINDOW_MOVE, (_event, { x, y }: { x: number; y: number }) => {
    // SEC-006: Validate x and y are finite numbers
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    moveWidget(x, y);
  });

  // ============================================================================
  // Activity Tracking
  // ============================================================================

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_GET_RECENT, (_event, minutes: number = 10) => {
    try {
      // SEC-006: Validate and cap minutes to prevent excessive data retrieval
      if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 1) {
        minutes = 10;
      }
      minutes = Math.min(minutes, 1440); // Cap at 24 hours
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
      // Primary: DeepContextEngine (rich context)
      const deepEngine = getDeepContextEngine();
      if (deepEngine) {
        const deepContext = deepEngine.getContextForSync();
        if (deepContext && deepContext.length > 0) {
          // Append basic tracker data (focus score, idle state)
          const contextManager = getContextManager();
          const basicContext = contextManager?.getContextForSync() || '';

          // Merge: deep context first, then append focus/idle from basic
          const focusLine = basicContext.split('\n').find(l => l.startsWith('Focus score:'));
          const idleLine = basicContext.split('\n').find(l => l.includes('idle'));
          const extras = [focusLine, idleLine].filter(Boolean).join('\n');

          const merged = extras ? `${deepContext}\n${extras}` : deepContext;
          return { success: true, data: merged };
        }
      }

      // Fallback: basic contextManager
      const contextManager = getContextManager();
      if (contextManager) {
        const context = contextManager.getContextForSync();
        return { success: true, data: context };
      }
      return { success: true, data: '' };
    } catch (error) {
      console.error('[ipc] Error getting context for sync:', error);
      // Fallback to basic on any error
      try {
        const contextManager = getContextManager();
        return { success: true, data: contextManager?.getContextForSync() || '' };
      } catch {
        return { success: false, error: String(error) };
      }
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
    let accessToken = getAccessToken();
    let user = getUser();

    // If we have token but no user, try to fetch user info
    if (accessToken && !user) {
      console.log('[ipc] Token exists but user missing, fetching user info...');
      let userInfo = await fetchUserInfo(accessToken);

      // If fetch fails, try refreshing the token first
      if (!userInfo) {
        console.log('[ipc] Fetch failed, attempting token refresh...');
        const newToken = await refreshAccessToken();
        if (newToken) {
          accessToken = newToken;
          userInfo = await fetchUserInfo(newToken);
        }
      }

      if (userInfo) {
        setUser(userInfo);
        user = userInfo;
        console.log('[ipc] User info fetched and saved:', userInfo.email);
        // Notify notch bridge now that auth is repaired
        const bridge = getNotchBridge();
        if (bridge?.running) {
          bridge.sendAuthUpdate();
        }
      } else {
        // Token and refresh both failed, clear auth
        console.log('[ipc] Failed to fetch user info after refresh, clearing auth');
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
      // SEC-006: Validate updates is a plain object
      if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
        return { success: false, error: 'Updates must be a non-null object' };
      }
      const newSettings = updateSettings(updates);
      return { success: true, data: newSettings };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_API_KEY, (_event, key: string | null) => {
    try {
      // SEC-006: Validate key is a non-empty string or null (to clear)
      if (key !== null && (typeof key !== 'string' || key.trim().length === 0)) {
        return { success: false, error: 'API key must be a non-empty string or null' };
      }
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
      // SEC-006: Validate and cap days
      if (typeof days !== 'number' || !Number.isFinite(days) || days < 1) {
        days = 30;
      }
      days = Math.min(days, 365); // Cap at 1 year
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
      // SEC-005: Validate URL before opening
      if (typeof url !== 'string' || url.trim().length === 0) {
        return { success: false, error: 'URL must be a non-empty string' };
      }
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { success: false, error: 'Invalid URL format' };
      }
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        return { success: false, error: `Blocked protocol: ${parsed.protocol}. Only http: and https: are allowed.` };
      }

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
    // Use the shared checkPermissions which handles the Sequoia+ bug
    const { checkPermissions } = await import('../services/permissions');
    const status = await checkPermissions();
    return { success: true, data: status };
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_RELAUNCH_APP, () => {
    app.relaunch();
    app.exit(0);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_REQUEST_PERMISSION, async (_event, permission: string) => {
    // SEC-006: Validate permission is an allowed value
    const allowedPermissions = ['accessibility', 'screenCapture'];
    if (typeof permission !== 'string' || !allowedPermissions.includes(permission)) {
      return { success: false, error: `Invalid permission. Must be one of: ${allowedPermissions.join(', ')}` };
    }
    if (process.platform === 'darwin') {
      if (permission === 'accessibility') {
        // Open System Settings directly — avoid isTrustedAccessibilityClient(true)
        // which triggers the native dialog that loops
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
        return { success: true };
      }
      if (permission === 'screenCapture') {
        // Open System Settings to Screen Recording pane
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
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
      // SEC-006: Validate commitmentId is a positive integer
      if (typeof commitmentId !== 'number' || !Number.isInteger(commitmentId) || commitmentId < 1) {
        return { success: false, error: 'commitmentId must be a positive integer' };
      }
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
      // SEC-006: Validate commitmentId is a positive integer
      if (typeof commitmentId !== 'number' || !Number.isInteger(commitmentId) || commitmentId < 1) {
        return { success: false, error: 'commitmentId must be a positive integer' };
      }
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

  // ============================================================================
  // Semantic Pipeline
  // ============================================================================

  ipcMain.handle(IPC_CHANNELS.SEMANTIC_GET_WORK_CONTEXT, () => {
    try {
      const threads = getActiveThreads();
      const topThread = threads.length > 0 ? threads[0] : null;
      const intents = getActiveIntents();
      const topIntent = intents.length > 0 ? intents[0] : null;
      const entities = getRecentEntities(10);
      const distribution = getActivityDistribution(1);
      const signatures = getAllCurrentSignatures();

      return {
        success: true,
        data: {
          currentThread: topThread,
          currentIntent: topIntent,
          recentEntities: entities,
          activityDistribution: distribution,
          signatures,
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SEMANTIC_GET_ENTITIES, (_event, options?: { type?: string; limit?: number }) => {
    try {
      // SEC-006: Validate and cap limit
      let limit = options?.limit ?? 50;
      if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 1) limit = 50;
      limit = Math.min(limit, 500);
      let entities = getRecentEntities(limit);
      if (options?.type) {
        entities = entities.filter(e => e.type === options.type);
      }
      return { success: true, data: entities };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SEMANTIC_GET_THREADS, () => {
    try {
      const threads = getActiveThreads();
      return { success: true, data: threads };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SEMANTIC_GET_SIGNATURES, () => {
    try {
      const signatures = getAllCurrentSignatures();
      return { success: true, data: signatures };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SEMANTIC_GET_ACTIVITY_DISTRIBUTION, (_event, days?: number) => {
    try {
      // SEC-006: Validate and cap days
      let validDays = days ?? 7;
      if (typeof validDays !== 'number' || !Number.isFinite(validDays) || validDays < 1) validDays = 7;
      validDays = Math.min(validDays, 90);
      const distribution = getActivityDistribution(validDays);
      return { success: true, data: distribution };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  console.log('[ipc] Handlers registered');
}
