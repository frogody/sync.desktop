/**
 * macOS Notarization Script
 *
 * This script is called by electron-builder after signing the app.
 * It submits the app to Apple for notarization.
 *
 * Supports two authentication methods:
 *
 * Method 1: Apple ID (legacy)
 * - APPLE_ID: Your Apple ID email (e.g., developer@example.com)
 * - APPLE_APP_SPECIFIC_PASSWORD: App-specific password from appleid.apple.com
 * - APPLE_TEAM_ID: Your 10-character Apple Developer Team ID (e.g., ABC1234XYZ)
 *
 * Method 2: App Store Connect API Key (recommended for CI/CD)
 * - APPLE_API_KEY_PATH: Path to .p8 file (e.g., /tmp/AuthKey_ABC123XYZ.p8)
 * - APPLE_API_KEY_ID: API Key ID (e.g., ABC123XYZ)
 * - APPLE_API_KEY_ISSUER_ID: Issuer ID from App Store Connect (UUID format)
 * - APPLE_TEAM_ID: Your 10-character Apple Developer Team ID (e.g., ABC1234XYZ)
 *
 * Note: If both methods are provided, API Key method takes precedence.
 */

const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization - not a macOS build');
    return;
  }

  // Check if notarization is explicitly disabled
  if (process.env.SKIP_NOTARIZE === 'true') {
    console.log('Skipping notarization - SKIP_NOTARIZE is set');
    return;
  }

  // Detect which authentication method to use
  const hasAppleIdAuth = !!(
    process.env.APPLE_ID &&
    process.env.APPLE_APP_SPECIFIC_PASSWORD &&
    process.env.APPLE_TEAM_ID
  );

  const hasApiKeyAuth = !!(
    process.env.APPLE_API_KEY_PATH &&
    process.env.APPLE_API_KEY_ID &&
    process.env.APPLE_API_KEY_ISSUER_ID &&
    process.env.APPLE_TEAM_ID
  );

  // Handle cases where neither or both authentication methods are available
  if (!hasAppleIdAuth && !hasApiKeyAuth) {
    console.log('Skipping notarization - no valid authentication method found');
    console.log('');
    console.log('To enable notarization, provide one of the following:');
    console.log('');
    console.log('Method 1 (Apple ID - legacy):');
    console.log('  - APPLE_ID: Your Apple ID email (e.g., developer@example.com)');
    console.log('  - APPLE_APP_SPECIFIC_PASSWORD: App-specific password from appleid.apple.com');
    console.log('  - APPLE_TEAM_ID: Your 10-character Team ID (e.g., ABC1234XYZ)');
    console.log('');
    console.log('Method 2 (API Key - recommended for CI/CD):');
    console.log('  - APPLE_API_KEY_PATH: Path to .p8 file (e.g., /tmp/AuthKey_ABC123XYZ.p8)');
    console.log('  - APPLE_API_KEY_ID: API Key ID (e.g., ABC123XYZ)');
    console.log('  - APPLE_API_KEY_ISSUER_ID: Issuer ID from App Store Connect (UUID format)');
    console.log('  - APPLE_TEAM_ID: Your 10-character Team ID (e.g., ABC1234XYZ)');
    return;
  }

  if (hasAppleIdAuth && hasApiKeyAuth) {
    console.log('Both Apple ID and API Key authentication methods detected');
    console.log('Using API Key method (recommended for CI/CD)');
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`Notarizing ${appPath}...`);

  try {
    // Prefer API Key authentication if available (more reliable for CI/CD)
    if (hasApiKeyAuth) {
      console.log('Using App Store Connect API Key authentication');
      await notarize({
        appBundleId: 'com.isyncso.sync-desktop',
        appPath,
        appleApiKey: process.env.APPLE_API_KEY_PATH,
        appleApiKeyId: process.env.APPLE_API_KEY_ID,
        appleApiIssuer: process.env.APPLE_API_KEY_ISSUER_ID,
        teamId: process.env.APPLE_TEAM_ID,
      });
    } else {
      console.log('Using Apple ID authentication');
      await notarize({
        appBundleId: 'com.isyncso.sync-desktop',
        appPath,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
      });
    }

    console.log('Notarization complete!');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};
