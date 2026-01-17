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

import { app, BrowserWindow, ipcMain, protocol, shell } from 'electron';
import path from 'path';
import { createFloatingWidget, getFloatingWidget } from './windows/floatingWidget';
import { createSystemTray } from './tray/systemTray';
import { setupIpcHandlers } from './ipc/handlers';
import { ActivityTracker } from './services/activityTracker';
import { ContextManager } from './services/contextManager';
import { SummaryService } from './services/summaryService';
import { JournalService } from './services/journalService';
import { Scheduler } from './services/scheduler';
import { CloudSyncService } from './services/cloudSyncService';
import { DeepContextManager } from './services/deepContextManager';
import { checkAndRequestPermissions, checkPermissions } from './services/permissions';
import { initAutoUpdater } from './services/autoUpdater';
import { initDatabase } from './db/database';
import { APP_PROTOCOL, WEB_APP_URL } from '../shared/constants';
import {
  store,
  StoreSchema,
  getSettings,
  getAuthState,
  setAccessToken,
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
    console.error('[main] Error fetching user info:', error);
    return null;
  }
}

async function handleDeepLink(url: string) {
  console.log('[main] Deep link received:', url);

  try {
    const parsed = new URL(url);

    // Handle auth callback: isyncso://auth?token=xxx&state=yyy
    if (parsed.hostname === 'auth') {
      const token = parsed.searchParams.get('token');
      const state = parsed.searchParams.get('state');

      // Verify state matches what we stored
      const storedState = getAuthState();
      if (state && state === storedState) {
        setAccessToken(token);
        setAuthState(null);

        // Fetch user info
        if (token) {
          const userInfo = await fetchUserInfo(token);
          if (userInfo) {
            setUser(userInfo);
            console.log('[main] User info saved:', userInfo.email);
          }
        }

        // Notify renderer of successful auth
        const widget = getFloatingWidget();
        if (widget) {
          widget.webContents.send('auth:callback', { success: true, token });
        }
      } else {
        console.error('[main] Auth state mismatch');
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
  cloudSyncService = new CloudSyncService(summaryService, journalService);

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
    } else {
      console.log('[main] Activity tracking disabled - accessibility permission not granted');
    }
  }

  // Start scheduler for periodic tasks
  scheduler = new Scheduler(summaryService, journalService);
  scheduler.setSyncCallback(async () => {
    if (cloudSyncService && settings.autoSync) {
      await cloudSyncService.sync();
    }
  });
  scheduler.start();

  console.log('[main] Scheduler started');

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

  // Stop scheduler first
  if (scheduler) {
    scheduler.stop();
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
