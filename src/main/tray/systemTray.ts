/**
 * System Tray Integration
 *
 * Menu bar icon on macOS / system tray on Windows
 * Provides quick access to SYNC features and settings
 */

import { Tray, Menu, nativeImage, app, shell, dialog } from 'electron';
import path from 'path';
import {
  getFloatingWidget,
  toggleWidget,
  expandToChat,
  expandToVoice,
  expandToSettings,
  collapseToAvatar,
} from '../windows/floatingWidget';
import { WEB_APP_URL, AUTH_CALLBACK_PATH } from '../../shared/constants';
import { getActivityTracker, setActivityTracker, getCloudSyncService } from '../index';
import { ActivityTracker } from '../services/activityTracker';
import { getSettings, updateSettings, getUser, clearAuth, setAuthState } from '../store';
import { checkForUpdates, getUpdateStatus } from '../services/autoUpdater';

// ============================================================================
// State
// ============================================================================

let tray: Tray | null = null;

// ============================================================================
// Tray Creation
// ============================================================================

export function createSystemTray(): Tray {
  // Create tray icon — resolve path for both dev and production (packaged) builds
  // In dev, __dirname is dist/main/tray/ — assets live at the project root (app.getAppPath())
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'tray', 'trayTemplate.png')
    : path.join(app.getAppPath(), 'assets', 'tray', 'trayTemplate.png');

  // Fallback bee icon (22x22 transparent template PNG) — black silhouette, no background.
  const BEE_ICON_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAABOElEQVR4nO3Uu0pDQRCA4S/x' +
    'ggYFCwVB0VKwtBRRW1/Bh/AVbK0tfQhLa8EnSCVWVqkMguLdaGRhTlgP8cQLdvlhObNzY3Zm' +
    '9zDkv6l9oetiAeu4xinew17HFhZxhssspjJxwXTY19DASeh38IBmJLvxBw4iUTPkPzESFW/j' +
    'LarrhrwVtuTTl6pWjKKDQ1xhJfQXmMNe5vPjihO7MaB8JZ2qivsxVjrNTFRVtKITutyniOmR' +
    'jlKmgdtsP479kk/SyZI3yrejX+K7LCBVuIFNPMY+JTnHceZTxPRIl73MW+gnY7+KeSxhOeSk' +
    'Ez71iBnYisQU7jGBNo4iuJYlSrbn8P32IxmLb3q2T9ngivUUttx3YCvE5FN1r2jhJap7DrkV' +
    'ttpX97jqgRSkYc36TDv+F7+m9kvbED0+ADsBRjMrS/pCAAAAAElFTkSuQmCC';

  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      console.warn('[tray] Tray icon empty, using built-in bee icon:', iconPath);
      icon = nativeImage.createFromDataURL(`data:image/png;base64,${BEE_ICON_B64}`);
    }
  } catch {
    console.warn('[tray] Could not load tray icon, using built-in bee icon:', iconPath);
    icon = nativeImage.createFromDataURL(`data:image/png;base64,${BEE_ICON_B64}`);
  }

  // Template mode: macOS automatically renders white in dark mode, black in light mode.
  // The icon is a black silhouette on transparent background, so template mode works correctly.
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);
  tray.setToolTip('Sync');

  // Update context menu
  updateTrayMenu();

  // Click behavior
  tray.on('click', () => {
    toggleWidget();
  });

  // Right-click shows menu (already default on Windows)
  if (process.platform === 'darwin') {
    tray.on('right-click', () => {
      tray?.popUpContextMenu();
    });
  }

  return tray;
}

// ============================================================================
// Menu Updates
// ============================================================================

export function updateTrayMenu(): void {
  if (!tray) return;

  const settings = getSettings();
  const activityTracker = getActivityTracker();
  const isTracking = !!activityTracker;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show SYNC',
      click: () => {
        const widget = getFloatingWidget();
        if (widget) {
          widget.show();
          widget.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Open Chat',
      accelerator: 'CommandOrControl+Shift+S',
      click: () => {
        const widget = getFloatingWidget();
        if (widget) {
          widget.show();
          expandToChat();
        }
      },
    },
    {
      label: 'Start Voice Mode',
      accelerator: 'CommandOrControl+Shift+V',
      click: () => {
        const widget = getFloatingWidget();
        if (widget) {
          widget.show();
          expandToVoice();
        }
      },
    },
    { type: 'separator' },
    {
      label: isTracking ? 'Pause Tracking' : 'Resume Tracking',
      click: () => {
        if (isTracking) {
          activityTracker?.stop();
          setActivityTracker(null);
          updateSettings({ trackingEnabled: false });
          console.log('[tray] Tracking paused');
        } else {
          const newTracker = new ActivityTracker();
          newTracker.start();
          setActivityTracker(newTracker);
          updateSettings({ trackingEnabled: true });
          console.log('[tray] Tracking resumed');
        }
        updateTrayMenu();
      },
    },
    {
      label: 'Sync Now',
      click: async () => {
        console.log('[tray] Manual sync triggered');
        const syncService = getCloudSyncService();
        if (syncService) {
          const result = await syncService.forceSync();
          console.log('[tray] Sync result:', result);
          if (!result.success) {
            // Translate raw errors to user-friendly messages
            const rawError = result.error || '';
            let userMessage: string;
            if (rawError.includes('ENOTFOUND') || rawError.includes('network') || rawError.includes('fetch')) {
              userMessage = 'Could not reach the server. Please check your internet connection and try again.';
            } else if (rawError.includes('401') || rawError.includes('403') || rawError.includes('Unauthorized')) {
              userMessage = 'Your session has expired. Please sign out and sign back in, then try syncing again.';
            } else if (rawError.includes('429')) {
              userMessage = 'Too many sync requests. Please wait a few minutes and try again.';
            } else if (rawError.includes('500') || rawError.includes('502') || rawError.includes('503')) {
              userMessage = 'The SYNC server is temporarily unavailable. Please try again in a few minutes.';
            } else if (rawError) {
              userMessage = `Cloud sync could not complete: ${rawError}`;
            } else {
              userMessage = 'Cloud sync could not complete. Please check your connection and try again.';
            }
            dialog.showMessageBox({
              type: 'warning',
              title: 'SYNC Cloud Sync Failed',
              message: userMessage,
              buttons: ['OK'],
            });
          }
        } else {
          console.log('[tray] No sync service available');
        }
      },
    },
    { type: 'separator' },
    ...((() => {
      const user = getUser();
      if (user) {
        return [
          {
            label: `Signed in as ${user.email}`,
            enabled: false,
          },
          {
            label: 'Log Out',
            click: async () => {
              const { response } = await dialog.showMessageBox({
                type: 'question',
                title: 'Log Out',
                message: 'Are you sure you want to log out?',
                detail: 'Activity tracking will continue locally, but data won\'t sync until you sign in again.',
                buttons: ['Cancel', 'Log Out'],
                defaultId: 0,
                cancelId: 0,
              });
              if (response === 1) {
                console.log('[tray] User logged out');
                clearAuth();
                // Notify renderer
                const widget = getFloatingWidget();
                if (widget) {
                  widget.webContents.send('auth:callback', { success: false, error: 'logged_out' });
                }
                updateTrayMenu();
              }
            },
          },
        ] as Electron.MenuItemConstructorOptions[];
      } else {
        return [
          {
            label: 'Sign In...',
            click: () => {
              // Open auth URL directly in browser (floating widget may be hidden
              // when native notch widget is active)
              const { randomUUID } = require('crypto');
              const state = randomUUID();
              setAuthState(state);
              const authUrl = `${WEB_APP_URL}${AUTH_CALLBACK_PATH}?state=${state}`;
              shell.openExternal(authUrl);
            },
          },
        ] as Electron.MenuItemConstructorOptions[];
      }
    })()),
    { type: 'separator' },
    {
      label: 'Open Web App',
      click: () => {
        shell.openExternal(WEB_APP_URL);
      },
    },
    {
      label: 'Settings',
      click: () => {
        const widget = getFloatingWidget();
        if (widget) {
          widget.show();
          expandToSettings();
        }
      },
    },
    { type: 'separator' },
    {
      label: `Sync v${app.getVersion()}`,
      enabled: false,
    },
    {
      label: 'Check for Updates...',
      click: async () => {
        console.log('[tray] Checking for updates...');
        const result = await checkForUpdates();

        // If no update available, show dialog
        if (result && !getUpdateStatus().available) {
          dialog.showMessageBox({
            type: 'info',
            title: 'No Updates Available',
            message: 'You are running the latest version!',
            detail: `Current version: ${app.getVersion()}`,
            buttons: ['OK'],
          });
        }
        // If update is available, the auto-updater will show its own dialog
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Sync',
      accelerator: 'CommandOrControl+Q',
      click: () => {
        app.exit(0);
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// ============================================================================
// Status Updates
// ============================================================================

export function setTrayIcon(status: 'normal' | 'syncing' | 'error'): void {
  if (!tray) return;

  const tooltips = {
    normal: 'Sync — Running',
    syncing: 'Sync — Syncing your data...',
    error: 'Sync — Sync issue, check your connection',
  };

  tray.setToolTip(tooltips[status]);
}

export function getTray(): Tray | null {
  return tray;
}
