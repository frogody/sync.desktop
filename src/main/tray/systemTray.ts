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

  // Fallback bee icon (22x22 PNG, base64-encoded) — metallic teal/cyan bee.
  const BEE_ICON_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAEFElEQVR4nNWTW2gcVRjHzzlz25nZnb1v' +
    'NpdNzCYsaatNkRZShfoiKkiR+iAKXmi8ElGbl774oj6KVpEi+iAWoVJCQRCfBBWx1EKR0jYpidakTpLd' +
    '7G6yt5nduZ5z5CzNkmRTC4IP/mFg+L7//8c538cB4A46emGGsu/f9hH4j8Rv/qjJuKQk43Lu+WOHVn/8' +
    'tVK5fP2cbTbFUHbwYGutvIwtuwIAIJwoKHJvKrfy/YXzSOBR6v5770OEloaffDR389x318s3fq8xHtwE' +
    'x/aMxh86+XpWjUUlxHPKxU/PbJgbVc0VxafN2flTfrNVpBhjTpYjYkTrUcdG30DV2mklrNUnXnkuCnkO' +
    'WA2DfHN8+vK2UWSfevxAE9E+JRkTZU2zH3z1BVmNhA0lFpXkVGJQiEb28pHwPj6oZpTcyBQobXykRiLG' +
    'kbdejofSKUHtScosf/TCzJvbThwdG0nuPzF5ONLfKwyk+9aJ60HLNLVqvhi98sMvx72mJQMICPYxJcXy' +
    '+4dffAbF+nurSljzkSSilbV8orZa8H5+7e1vt83YWq+0Zk9/denA9OSEFdRAIBiUeFUJWEFpj5xKZMYP' +
    'jicAQvDm4pLR0vPvWEHpvKAF54Eo1CzT9MxS2WP5ruW5DdOGANJrH395EZ6YnOgbGvLXm0ZWv3LjsdDY' +
    'cFSIaOpyuQTEeFjgQgq3fHXhCUGRraQaqud1PcRyrbVyqwtMfUzchuGYCKKrn5z5zZ169mEqCKrnuprr' +
    'uPJifhVBnoOYUupZDmc3m7xRLAOTFOPzn539ySyUWiy/yessjxJCSRtu+q1aXZz7YkZ3HCeGMVFNvcBT' +
    'TCB1fYBtF9YXljjrz7/OMt/s51/PmYWSw6As3wXuwDGGvuUE1EP7p/VL1x7RRjJyYu8oHBu+B7grRWDd' +
    'yoNgdgCinuTUxvLaA061Dl2j6TEoy9/55VEKKYIh81Y+HuhLxbHry7nRLJJkGYwfmQDKQBoACoJSOhkx' +
    'llYjvuOKFOP2obZiusEQcsTHPICATwym+eRwP182G5BAACqeDXpGM1xqJMPHM+m2h3kppV2czvI6IhQD' +
    'SgklFDdqBnERh3lJ5MrF9XYbEwKI62G7brQ9zNvO3A1MGdTzan7Lqjf0Qs0yLAlJAoAQcrf7mDiu51Xr' +
    'bQ/zssxdwYBSTF2vbs0tvAt4/pScHRSRHIgCdPu2hHjEsqvWor7CPMzLMjsxnSfdEYQcRFCAohhDQXUw' +
    'sG/sAxRUhqAghFmbel6dNFsr9uz8NDGbOnXdCrvjTng3eCtcEGNQDgxIuZH3YEDq3QQ783+cpC1bp97u' +
    '0DZiZ6EjNlPI4HwYCkIMSlKvkOl7yVvSPyS2U6CeVwF0d2g7vlsRbIUDgCBCAuC5ULvGduBj85+g/0/9' +
    'DfQgRZW7XkCYAAAAAElFTkSuQmCC';

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

  // On macOS, template images automatically adapt to dark/light mode.
  // The bee icon is coloured (not purely black/white), so do NOT set template mode —
  // that would make it invisible in dark mode by applying a monochrome mask.
  // Instead keep it as-is; macOS will render it at the correct size.
  if (process.platform === 'darwin') {
    icon.setTemplateImage(false);
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
