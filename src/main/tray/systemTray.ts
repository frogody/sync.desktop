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
  collapseToAvatar,
} from '../windows/floatingWidget';
import { WEB_APP_URL } from '../../shared/constants';
import { getActivityTracker, setActivityTracker } from '../index';
import { ActivityTracker } from '../services/activityTracker';
import { getSettings } from '../store';
import { checkForUpdates, getUpdateStatus } from '../services/autoUpdater';

// ============================================================================
// State
// ============================================================================

let tray: Tray | null = null;

// ============================================================================
// Tray Creation
// ============================================================================

export function createSystemTray(): Tray {
  // Create tray icon
  // For now, use a placeholder - we'll add proper icons later
  const iconPath = path.join(__dirname, '../../assets/tray/trayTemplate.png');

  // Create a simple icon if the file doesn't exist
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch {
    // Create a simple 16x16 icon as fallback
    icon = nativeImage.createEmpty();
  }

  // On macOS, use template image for automatic dark/light mode
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);
  tray.setToolTip('SYNC Desktop');

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
      label: 'Start Voice',
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
        } else {
          const newTracker = new ActivityTracker();
          newTracker.start();
          setActivityTracker(newTracker);
        }
        updateTrayMenu();
      },
    },
    {
      label: 'Sync Now',
      click: () => {
        // TODO: Implement cloud sync
        console.log('[tray] Manual sync triggered');
      },
    },
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
        shell.openExternal(`${WEB_APP_URL}/settings`);
      },
    },
    { type: 'separator' },
    {
      label: `SYNC Desktop v${app.getVersion()}`,
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
      label: 'Quit SYNC Desktop',
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

  // TODO: Implement different icons for different states
  // For now, just update the tooltip
  const tooltips = {
    normal: 'SYNC Desktop',
    syncing: 'SYNC Desktop - Syncing...',
    error: 'SYNC Desktop - Error',
  };

  tray.setToolTip(tooltips[status]);
}

export function getTray(): Tray | null {
  return tray;
}
