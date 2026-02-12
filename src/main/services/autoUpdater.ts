/**
 * Auto-Updater Service
 *
 * Handles automatic updates from GitHub Releases using electron-updater.
 * Sends events to renderer for in-app update UI.
 */

import { autoUpdater, UpdateCheckResult, UpdateInfo } from 'electron-updater';
import { ipcMain, app } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipcChannels';
import { getFloatingWidget } from '../windows/floatingWidget';

// ============================================================================
// Configuration
// ============================================================================

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowDowngrade = false;

// ============================================================================
// State
// ============================================================================

let updateAvailable = false;
let updateDownloaded = false;
let downloadProgress = 0;
let updateInfo: UpdateInfo | null = null;
let isChecking = false;
let isDownloading = false;

// ============================================================================
// Helper — send event to renderer
// ============================================================================

function sendToRenderer(channel: string, data?: any) {
  const widget = getFloatingWidget();
  if (widget && !widget.isDestroyed()) {
    widget.webContents.send(channel, data);
  }
}

// ============================================================================
// electron-updater Event Handlers
// ============================================================================

autoUpdater.on('checking-for-update', () => {
  console.log('[updater] Checking for updates...');
  isChecking = true;
});

autoUpdater.on('update-available', (info) => {
  console.log('[updater] Update available:', info.version);
  isChecking = false;
  updateAvailable = true;
  updateInfo = info;

  // Notify renderer
  sendToRenderer(IPC_CHANNELS.UPDATE_AVAILABLE, {
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes: info.releaseNotes,
  });
});

autoUpdater.on('update-not-available', (info) => {
  console.log('[updater] No updates available. Current version:', info.version);
  isChecking = false;
  updateAvailable = false;
});

autoUpdater.on('error', (err) => {
  console.error('[updater] Error:', err.message);
  isChecking = false;
  isDownloading = false;
});

autoUpdater.on('download-progress', (progress) => {
  downloadProgress = progress.percent;
  console.log(`[updater] Download progress: ${progress.percent.toFixed(1)}%`);

  sendToRenderer(IPC_CHANNELS.UPDATE_PROGRESS, {
    percent: progress.percent,
    bytesPerSecond: progress.bytesPerSecond,
    transferred: progress.transferred,
    total: progress.total,
  });
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('[updater] Update downloaded:', info.version);
  isDownloading = false;
  updateDownloaded = true;

  sendToRenderer(IPC_CHANNELS.UPDATE_DOWNLOADED, {
    version: info.version,
  });
});

// ============================================================================
// IPC Handlers
// ============================================================================

function registerUpdateIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return {
        success: true,
        data: result ? {
          available: updateAvailable,
          version: result.updateInfo?.version,
        } : { available: false },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async () => {
    if (!updateAvailable) {
      return { success: false, error: 'No update available' };
    }
    if (isDownloading) {
      return { success: false, error: 'Download already in progress' };
    }
    try {
      isDownloading = true;
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      isDownloading = false;
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => {
    if (!updateDownloaded) {
      return { success: false, error: 'No update downloaded' };
    }
    // Small delay to let the renderer acknowledge
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 500);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_STATUS, () => {
    return {
      success: true,
      data: {
        currentVersion: app.getVersion(),
        available: updateAvailable,
        downloaded: updateDownloaded,
        downloading: isDownloading,
        checking: isChecking,
        progress: downloadProgress,
        version: updateInfo?.version || null,
      },
    };
  });
}

// ============================================================================
// Public API
// ============================================================================

export async function checkForUpdates(): Promise<UpdateCheckResult | null> {
  try {
    return await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('[updater] Check failed:', error);
    return null;
  }
}

export function getUpdateStatus() {
  return {
    available: updateAvailable,
    downloaded: updateDownloaded,
    info: updateInfo,
    progress: downloadProgress,
  };
}

// ============================================================================
// Initialization
// ============================================================================

export function initAutoUpdater(): void {
  // Register IPC handlers always (so renderer can call them)
  registerUpdateIpcHandlers();

  // Only auto-check in production
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    console.log('[updater] Skipping auto-check in development mode');
    return;
  }

  console.log('[updater] Initializing auto-updater');

  // Check for updates on startup (after a delay)
  setTimeout(() => {
    checkForUpdates();
  }, 10000);

  // Check every 4 hours
  setInterval(() => {
    checkForUpdates();
  }, 4 * 60 * 60 * 1000);
}
