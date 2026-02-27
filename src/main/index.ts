/**
 * SYNC Desktop - Main Process Entry Point
 *
 * This is the main Electron process that handles:
 * - Window management (floating widget, chat, voice)
 * - Activity tracking
 * - System tray
 * - IPC communication
 * - Cloud sync
 */

import 'dotenv/config';
import { app, BrowserWindow, ipcMain, protocol, shell } from 'electron';
import path from 'path';
import { createFloatingWidget, getFloatingWidget } from './windows/floatingWidget';
import { createSystemTray, updateTrayMenu } from './tray/systemTray';
import { setupIpcHandlers } from './ipc/handlers';
import { ActivityTracker } from './services/activityTracker';
import { ContextManager } from './services/contextManager';
import { SummaryService } from './services/summaryService';
import { JournalService } from './services/journalService';
import { Scheduler } from './services/scheduler';
import { CloudSyncService } from './services/cloudSyncService';
import { DeepContextManager } from './services/deepContextManager';
import { DeepContextEngine } from '../deep-context';
import { checkAndRequestPermissions, checkPermissions } from './services/permissions';
import { initAutoUpdater } from './services/autoUpdater';
import { NotchBridge } from './services/notchBridge';
import { initDatabase } from './db/database';
import { APP_PROTOCOL, WEB_APP_URL } from '../shared/constants';
import {
  store,
  StoreSchema,
  getSettings,
  getAccessToken,
  getAuthState,
  getUser,
  setAccessToken,
  setRefreshToken,
  setAuthState,
  setUser,
} from './store';

export type { StoreSchema };

// ============================================================================
// Service Instances
// ============================================================================

let activityTracker: ActivityTracker | null = null;
let contextManager: ContextManager | null = null;
let summaryService: SummaryService | null = null;
let journalService: JournalService | null = null;
let scheduler: Scheduler | null = null;
let cloudSyncService: CloudSyncService | null = null;
let deepContextManager: DeepContextManager | null = null;
let deepContextEngine: DeepContextEngine | null = null;
let notchBridge: NotchBridge | null = null;
let mainWindow: BrowserWindow | null = null;

// ============================================================================
// Single Instance Lock
// ============================================================================

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Handle deep link from second instance
    const url = commandLine.find((arg) => arg.startsWith(`${APP_PROTOCOL}://`));
    if (url) {
      handleDeepLink(url);
    }

    // Focus the main window
    const widget = getFloatingWidget();
    if (widget) {
      widget.focus();
    }
  });
}

// ============================================================================
// Deep Link Protocol Handler
// ============================================================================

const SUPABASE_URL = 'https://sfxpmzicgpaxfntqleig.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmeHBtemljZ3BheGZudHFsZWlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NjIsImV4cCI6MjA4MjE4MjQ2Mn0.337ohi8A4zu_6Hl1LpcPaWP8UkI5E4Om7ZgeU9_A8t4';

// Re-export refreshAccessToken for backward compatibility
export { refreshAccessToken } from './services/authUtils';

async function fetchUserInfo(accessToken: string) {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error('[main] Failed to fetch user info:', response.status);
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
      // User might not have a row yet, use auth data
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
    console.error('[main] Error fetching user info:', error);
    return null;
  }
}

async function handleDeepLink(url: string) {
  console.log('[main] Deep link received:', url);

  try {
    const parsed = new URL(url);

    // Handle auth callback: isyncso://auth?token=xxx&refresh_token=yyy&state=zzz
    if (parsed.hostname === 'auth') {
      const token = parsed.searchParams.get('token');
      const refreshTokenParam = parsed.searchParams.get('refresh_token');
      const state = parsed.searchParams.get('state');

      // Verify state matches what we stored
      const storedState = getAuthState();
      if (state && state === storedState) {
        // Store both tokens
        setAccessToken(token);
        if (refreshTokenParam) {
          setRefreshToken(refreshTokenParam);
          console.log('[main] Refresh token saved');
        }
        setAuthState(null);

        // Fetch user info
        if (token) {
          const userInfo = await fetchUserInfo(token);
          if (userInfo) {
            setUser(userInfo);
            console.log('[main] User info saved:', userInfo.email);
          } else {
            console.error('[main] Failed to fetch user info after auth - user object not saved');
          }
        }

        // Notify renderer of successful auth
        const widget = getFloatingWidget();
        if (widget) {
          widget.webContents.send('auth:callback', { success: true, token });
        }

        // Forward auth to native notch widget
        if (notchBridge?.running) {
          notchBridge.sendAuthUpdate();
        }

        // Generate current hour summary and sync immediately
        if (summaryService) {
          console.log('[main] Generating current hour summary...');
          try {
            await summaryService.saveLastHourSummary();
            await summaryService.saveOrUpdateCurrentHourSummary();
          } catch (err) {
            console.error('[main] Summary generation error:', err);
          }
        }
        if (cloudSyncService) {
          console.log('[main] Triggering immediate sync after auth...');
          cloudSyncService.forceSync().then((result) => {
            console.log('[main] Post-auth sync result:', result);
          }).catch((err) => {
            console.error('[main] Post-auth sync error:', err);
          });
        }
      } else {
        console.error('[main] Auth state mismatch - stored:', storedState, 'received:', state);
        // Notify renderer of auth failure
        const widget = getFloatingWidget();
        if (widget) {
          widget.webContents.send('auth:callback', { success: false, error: 'State mismatch' });
        }
      }
    }
  } catch (error) {
    console.error('[main] Failed to parse deep link:', error);
  }
}

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(async () => {
  // Register protocol for deep links
  protocol.registerHttpProtocol(APP_PROTOCOL, (request) => {
    handleDeepLink(request.url);
  });

  // Set as default protocol handler
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(APP_PROTOCOL);
  }

  // Initialize database
  await initDatabase();

  // Create main floating widget
  mainWindow = await createFloatingWidget();

  // Create system tray
  createSystemTray();

  // Setup IPC handlers
  setupIpcHandlers(store, activityTracker);

  // Initialize services
  const settings = getSettings();

  // Check permissions on macOS (non-blocking, just logs status)
  const permissions = await checkAndRequestPermissions();
  console.log('[main] Permissions:', permissions);

  // Create core services
  summaryService = new SummaryService();
  journalService = new JournalService(summaryService);

  // Start activity tracking if enabled and permissions granted
  if (settings.trackingEnabled) {
    if (permissions.accessibility || process.platform !== 'darwin') {
      activityTracker = new ActivityTracker();
      contextManager = new ContextManager(activityTracker);

      activityTracker.start();
      contextManager.start();

      console.log('[main] Activity tracking started');

      // Start deep context manager (screen capture, OCR, semantic analysis)
      // Requires screen capture permission on macOS
      if (permissions.screenCapture || process.platform !== 'darwin') {
        deepContextManager = new DeepContextManager();
        deepContextManager.start();

        // Log deep context events
        deepContextManager.on('event', (event) => {
          if (event.type === 'commitment_detected') {
            console.log('[main] Commitment detected:', event.data);
          } else if (event.type === 'follow_up_needed') {
            console.log('[main] Follow-up needed:', event.data);
          }
        });

        console.log('[main] Deep context manager started');
      } else {
        console.log('[main] Deep context disabled - screen capture permission not granted');
      }

      // Start deep context engine (accessibility-based, no screen capture needed)
      deepContextEngine = new DeepContextEngine();
      deepContextEngine.start();

      deepContextEngine.on('event', (event) => {
        if (event.eventType === 'commitment_detected') {
          console.log('[main] [deep-context-engine] Commitment:', event.semanticPayload?.summary);
        }
      });

      console.log('[main] Deep context engine started');
    } else {
      console.log('[main] Activity tracking disabled - accessibility permission not granted');
    }
  }

  // Create cloud sync service (after deepContextEngine so it can sync context events)
  cloudSyncService = new CloudSyncService(summaryService, journalService, deepContextEngine || undefined);

  // Update tray menu now that tracker state is known
  updateTrayMenu();

  // Start scheduler for periodic tasks
  scheduler = new Scheduler(summaryService, journalService, deepContextManager || undefined, deepContextEngine || undefined);
  scheduler.setSyncCallback(async () => {
    // Read fresh settings each time (don't use closure-captured value)
    const currentSettings = getSettings();
    if (cloudSyncService && currentSettings.autoSync) {
      await cloudSyncService.sync();
    }
  });
  scheduler.start();

  console.log('[main] Scheduler started');

  // On startup: try to generate summary for last hour (may have been missed)
  // and trigger an immediate sync if authenticated
  if (summaryService) {
    summaryService.saveLastHourSummary().catch(() => {});
  }
  setTimeout(async () => {
    if (cloudSyncService && cloudSyncService.isAuthenticated()) {
      console.log('[main] Startup sync: generating current hour summary and syncing...');
      if (summaryService) {
        await summaryService.saveOrUpdateCurrentHourSummary().catch(() => {});
      }
      const result = await cloudSyncService.forceSync();
      console.log('[main] Startup sync result:', result);
    }
  }, 10000); // Wait 10s for app to settle

  // Launch native notch widget on macOS
  if (process.platform === 'darwin') {
    notchBridge = new NotchBridge();
    try {
      notchBridge.start();
      console.log('[main] Notch widget bridge started');

      // Try to recover auth on startup: if access token is missing but
      // refresh token exists, use it to get a fresh token + user info.
      // This handles the case where the app restarts after token expiry.
      const { refreshAccessToken: refreshToken } = await import('./services/authUtils');
      const token = getAccessToken();
      const user = getUser();
      if (!token && !user) {
        // No auth at all — try to recover using refresh token
        console.log('[main] No auth stored, attempting refresh token recovery...');
        const newToken = await refreshToken();
        if (newToken) {
          const userInfo = await fetchUserInfo(newToken);
          if (userInfo) {
            setUser(userInfo);
            console.log('[main] Auth recovered via refresh token:', userInfo.email);
            notchBridge.sendAuthUpdate();
          }
        }
      } else if (token && user && !user.companyId) {
        // User exists but companyId is stale/missing — re-fetch user info
        console.log('[main] User cached but companyId missing, re-fetching user info for', user.email);
        const userInfo = await fetchUserInfo(token);
        if (userInfo) {
          setUser(userInfo);
          console.log('[main] User info refreshed — companyId:', userInfo.companyId || 'still null');
          if (userInfo.companyId) {
            notchBridge.sendAuthUpdate();
          }
        }
      }
    } catch (err) {
      console.error('[main] Notch widget failed to start, using fallback:', err);
      notchBridge = null;
    }
  }

  // Hide dock icon on macOS (we use menu bar/tray instead)
  if (process.platform === 'darwin' && !settings.showInDock) {
    app.dock?.hide();
  }

  // Initialize auto-updater (only in production)
  initAutoUpdater();

  console.log('[main] SYNC Desktop started successfully');
});

// Handle macOS deep links
app.on('open-url', (_event, url) => {
  handleDeepLink(url);
});

// Prevent app from quitting when all windows are closed (stays in tray)
app.on('window-all-closed', () => {
  // Don't quit - app lives in system tray
});

// Cleanup on quit
app.on('before-quit', () => {
  console.log('[main] Shutting down...');

  // Stop notch widget bridge
  if (notchBridge) {
    notchBridge.stop();
  }

  // Stop scheduler first
  if (scheduler) {
    scheduler.stop();
  }

  // Stop deep context engine
  if (deepContextEngine) {
    deepContextEngine.stop();
  }

  // Stop deep context manager
  if (deepContextManager) {
    deepContextManager.stop();
  }

  // Stop context manager
  if (contextManager) {
    contextManager.stop();
  }

  // Stop activity tracker
  if (activityTracker) {
    activityTracker.stop();
  }

  console.log('[main] Cleanup complete');
});

// ============================================================================
// Exports for IPC
// ============================================================================

export function getStore() {
  return store;
}

export function getActivityTracker() {
  return activityTracker;
}

export function setActivityTracker(tracker: ActivityTracker | null) {
  activityTracker = tracker;
}

export function getContextManager() {
  return contextManager;
}

export function getSummaryService() {
  return summaryService;
}

export function getJournalService() {
  return journalService;
}

export function getScheduler() {
  return scheduler;
}

export function getCloudSyncService() {
  return cloudSyncService;
}

export function getDeepContextManager() {
  return deepContextManager;
}

export function getDeepContextEngine() {
  return deepContextEngine;
}

export function getNotchBridge() {
  return notchBridge;
}
