/**
 * Permissions Service
 *
 * Handles macOS permission checks and requests for:
 * - Accessibility (required for active window tracking)
 * - Screen Recording (required for screen capture/OCR)
 *
 * Note: systemPreferences.getMediaAccessStatus('screen') is unreliable on
 * macOS Sequoia+ for packaged apps with hardened runtime. We use a real
 * screen capture test instead.
 */

import { systemPreferences, desktopCapturer, dialog, shell } from 'electron';

export interface PermissionStatus {
  accessibility: boolean;
  screenCapture: boolean;
}

/**
 * Test screen recording permission by attempting an actual capture.
 * getMediaAccessStatus('screen') is broken on macOS 15+ for signed apps.
 *
 * Uses a slightly larger thumbnail (8x8) to reduce false negatives.
 * On the first call after a grant, macOS sometimes returns an empty thumbnail —
 * retry once after a short delay if that happens.
 */
async function testScreenCapturePermission(retry = true): Promise<boolean> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 8, height: 8 },
    });

    if (!sources || sources.length === 0) {
      return false;
    }

    // If we got a source, check the thumbnail isn't empty/all-zero
    // When permission is denied, macOS returns a blank/black thumbnail
    const thumb = sources[0].thumbnail;
    if (!thumb || thumb.isEmpty()) {
      if (retry) {
        // First call after permission grant sometimes returns empty — retry once after short delay
        await new Promise((resolve) => setTimeout(resolve, 500));
        return testScreenCapturePermission(false);
      }
      return false;
    }

    // Having a non-empty thumbnail with sources is sufficient — the key failure mode
    // is getSources returning empty or throwing
    return true;
  } catch (err) {
    console.log('[permissions] Screen capture test failed:', err);
    return false;
  }
}

/**
 * Check current permission status
 *
 * On macOS Sequoia+, the system APIs cache permission state per-process.
 * We use isTrustedAccessibilityClient(true) to force a re-evaluation,
 * and always do a real screen capture test since getMediaAccessStatus
 * is unreliable.
 */
export async function checkPermissions(): Promise<PermissionStatus> {
  const results: PermissionStatus = {
    accessibility: false,
    screenCapture: false,
  };

  if (process.platform === 'darwin') {
    // macOS accessibility permission (required for active-win/get-windows)
    // Pass `true` to force macOS to re-evaluate the trust state.
    // With `false`, macOS caches the result and never updates it within
    // the same process — which is why users grant access but the app
    // doesn't detect it.
    results.accessibility = systemPreferences.isTrustedAccessibilityClient(true);

    // Screen capture: always do a real capture test.
    // getMediaAccessStatus('screen') is broken on macOS 14+/Sequoia,
    // so skip it entirely and go straight to the real test.
    results.screenCapture = await testScreenCapturePermission();
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
    buttons: ['Open System Settings', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response === 0) {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    return false;
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

  const granted = await testScreenCapturePermission();
  if (granted) {
    return true;
  }

  // Prompt to open System Preferences
  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'Screen Recording Permission Required',
    message: 'SYNC Desktop needs Screen Recording permission to read window titles and track your activity.',
    detail: 'Without this permission, SYNC cannot see what you\'re working on.\n\nClick "Open Settings" to grant permission, then restart SYNC Desktop.',
    buttons: ['Open System Settings', 'Later'],
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
  const status = await checkPermissions();

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

  return await checkPermissions();
}

/**
 * Show permissions status dialog
 */
export async function showPermissionsDialog(): Promise<void> {
  const status = await checkPermissions();

  const accessibilityStatus = status.accessibility ? 'Granted' : 'Not Granted';
  const screenStatus = status.screenCapture ? 'Granted' : 'Not Granted (Optional)';

  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'SYNC Desktop Permissions',
    message: 'Permission Status',
    detail: `Accessibility: ${accessibilityStatus}\nScreen Recording: ${screenStatus}\n\nAccessibility is required for activity tracking.\nScreen Recording is optional for advanced features.`,
    buttons: ['Open System Settings', 'Close'],
    defaultId: 1,
  });

  if (result.response === 0) {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy');
  }
}
