/**
 * Permissions Service
 *
 * Handles macOS permission checks and requests for:
 * - Accessibility (required for active window tracking)
 * - Screen Recording (required for screen capture/OCR)
 */

import { systemPreferences, dialog, shell } from 'electron';

export interface PermissionStatus {
  accessibility: boolean;
  screenCapture: boolean;
}

/**
 * Check current permission status
 */
export function checkPermissions(): PermissionStatus {
  const results: PermissionStatus = {
    accessibility: false,
    screenCapture: false,
  };

  if (process.platform === 'darwin') {
    // macOS accessibility permission (required for active-win/get-windows)
    results.accessibility = systemPreferences.isTrustedAccessibilityClient(false);

    // Screen capture permission
    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    results.screenCapture = screenStatus === 'granted';
  } else {
    // Windows/Linux don't need explicit permissions
    results.accessibility = true;
    results.screenCapture = true;
  }

  return results;
}

/**
 * Request accessibility permission (macOS only)
 * This will prompt the user to grant accessibility access
 */
export async function requestAccessibilityPermission(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return true;
  }

  // Check if already granted
  if (systemPreferences.isTrustedAccessibilityClient(false)) {
    return true;
  }

  // Prompt to open System Preferences
  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'Accessibility Permission Required',
    message: 'SYNC Desktop needs Accessibility permission to track your active windows.',
    detail: 'This allows SYNC to understand what apps you\'re using and provide contextual assistance.\n\nClick "Open Settings" to grant permission, then restart SYNC Desktop.',
    buttons: ['Open Settings', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response === 0) {
    // Open System Settings directly — do NOT call isTrustedAccessibilityClient(true)
    // as that triggers the native dialog which loops annoyingly
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    return false; // Permission not yet granted, user needs to restart
  }

  return false;
}

/**
 * Request screen recording permission (macOS only)
 */
export async function requestScreenCapturePermission(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return true;
  }

  const status = systemPreferences.getMediaAccessStatus('screen');

  if (status === 'granted') {
    return true;
  }

  // Prompt to open System Preferences
  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'Screen Recording Permission Required',
    message: 'SYNC Desktop needs Screen Recording permission to read window titles and track your activity.',
    detail: 'Without this permission, SYNC cannot see what you\'re working on.\n\nClick "Open Settings" to grant permission, then restart SYNC Desktop.',
    buttons: ['Open Settings', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response === 0) {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    return false;
  }

  return false;
}

/**
 * Check permissions on startup and prompt if needed
 */
export async function checkAndRequestPermissions(): Promise<PermissionStatus> {
  const status = checkPermissions();

  console.log('[permissions] Current status:', status);

  // Prompt for accessibility (required for window tracking)
  if (!status.accessibility && process.platform === 'darwin') {
    console.log('[permissions] Accessibility not granted, prompting user...');
    await requestAccessibilityPermission();
  }

  // Prompt for screen recording (required for window titles)
  if (!status.screenCapture && process.platform === 'darwin') {
    console.log('[permissions] Screen Recording not granted, prompting user...');
    await requestScreenCapturePermission();
  }

  return checkPermissions();
}

/**
 * Show permissions status dialog
 */
export async function showPermissionsDialog(): Promise<void> {
  const status = checkPermissions();

  const accessibilityStatus = status.accessibility ? '✅ Granted' : '❌ Not Granted';
  const screenStatus = status.screenCapture ? '✅ Granted' : '⚠️ Not Granted (Optional)';

  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'SYNC Desktop Permissions',
    message: 'Permission Status',
    detail: `Accessibility: ${accessibilityStatus}\nScreen Recording: ${screenStatus}\n\nAccessibility is required for activity tracking.\nScreen Recording is optional for advanced features.`,
    buttons: ['Open System Preferences', 'Close'],
    defaultId: 1,
  });

  if (result.response === 0) {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy');
  }
}
