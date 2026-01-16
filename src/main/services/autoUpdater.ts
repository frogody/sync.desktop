/**
 * Auto-Updater Service
 *
 * Handles automatic updates from GitHub Releases using electron-updater.
 */

import { autoUpdater, UpdateCheckResult, UpdateInfo } from 'electron-updater';
import { dialog, BrowserWindow } from 'electron';
import { getFloatingWidget } from '../windows/floatingWidget';

// ============================================================================
// Configuration
// ============================================================================

// Configure auto-updater
autoUpdater.autoDownload = false; // Don't auto-download, let user decide
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowDowngrade = false;

// ============================================================================
// State
// ============================================================================

let updateAvailable = false;
let downloadProgress = 0;
let updateInfo: UpdateInfo | null = null;

// ============================================================================
// Event Handlers
// ============================================================================

autoUpdater.on('checking-for-update', () => {
  console.log('[updater] Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  console.log('[updater] Update available:', info.version);
  updateAvailable = true;
  updateInfo = info;

  // Notify user
  promptForUpdate(info);
});

autoUpdater.on('update-not-available', (info) => {
  console.log('[updater] No updates available. Current version:', info.version);
  updateAvailable = false;
});

autoUpdater.on('error', (err) => {
  console.error('[updater] Error:', err);
});

autoUpdater.on('download-progress', (progress) => {
  downloadProgress = progress.percent;
  console.log(`[updater] Download progress: ${progress.percent.toFixed(1)}%`);

  // Notify renderer of progress
  const widget = getFloatingWidget();
  if (widget) {
    widget.webContents.send('updater:progress', progress);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('[updater] Update downloaded:', info.version);

  // Prompt to restart
  promptForRestart(info);
});

// ============================================================================
// Public API
// ============================================================================

/**
 * Check for updates (can be called manually)
 */
export async function checkForUpdates(): Promise<UpdateCheckResult | null> {
  try {
    const result = await autoUpdater.checkForUpdates();
    return result;
  } catch (error) {
    console.error('[updater] Check failed:', error);
    return null;
  }
}

/**
 * Download the available update
 */
export async function downloadUpdate(): Promise<void> {
  if (!updateAvailable) {
    console.log('[updater] No update available to download');
    return;
  }

  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    console.error('[updater] Download failed:', error);
  }
}

/**
 * Install update and restart
 */
export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true);
}

/**
 * Get current update status
 */
export function getUpdateStatus() {
  return {
    available: updateAvailable,
    info: updateInfo,
    progress: downloadProgress,
  };
}

// ============================================================================
// UI Prompts
// ============================================================================

async function promptForUpdate(info: UpdateInfo): Promise<void> {
  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: `A new version of SYNC Desktop is available!`,
    detail: `Version ${info.version} is ready to download.\n\nWould you like to download it now?`,
    buttons: ['Download', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response === 0) {
    downloadUpdate();
  }
}

async function promptForRestart(info: UpdateInfo): Promise<void> {
  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: `Version ${info.version} has been downloaded.`,
    detail: 'The update will be installed when you restart SYNC Desktop.\n\nWould you like to restart now?',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response === 0) {
    installUpdate();
  }
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize auto-updater and check for updates
 */
export function initAutoUpdater(): void {
  // Only run in production
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    console.log('[updater] Skipping in development mode');
    return;
  }

  console.log('[updater] Initializing auto-updater');

  // Check for updates on startup (after a delay)
  setTimeout(() => {
    checkForUpdates();
  }, 10000); // Wait 10 seconds after startup

  // Check for updates every 4 hours
  setInterval(() => {
    checkForUpdates();
  }, 4 * 60 * 60 * 1000);
}
