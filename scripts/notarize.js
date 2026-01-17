/**
 * macOS Notarization Script
 *
 * This script is called by electron-builder after signing the app.
 * It submits the app to Apple for notarization.
 *
 * Preferred method: App Store Connect API Key (.p8)
 * - APPLE_API_KEY_ID: Your API key ID (e.g., ABC123XYZ)
 * - APPLE_API_KEY_ISSUER_ID: Your issuer ID (UUID)
 * - APPLE_API_KEY_PATH: Path to .p8 key file
 * - APPLE_TEAM_ID: Your Apple Developer Team ID (optional)
 *
 * Legacy method: Apple ID + app-specific password
 * - APPLE_ID: Your Apple ID email
 * - APPLE_APP_SPECIFIC_PASSWORD: App-specific password from Apple ID settings
 * - APPLE_TEAM_ID: Your Apple Developer Team ID
 */

const fs = require('fs');
const path = require('path');
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName } = context;
  const appOutDir = context.appOutDir || (context.packager && context.packager.appOutDir);

  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization - not a macOS build');
    return;
  }

  // Check if notarization is disabled
  if (process.env.SKIP_NOTARIZE === 'true') {
    console.log('Skipping notarization - SKIP_NOTARIZE is set');
    return;
  }

  if (!appOutDir) {
    console.log('No appOutDir available, skipping notarization.');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  console.log(`Notarizing ${appPath}...`);

  const notarizeOptions = {
    appBundleId: 'com.isyncso.sync-desktop',
    appPath,
  };

  // Preferred method: App Store Connect API Key (.p8)
  if (process.env.APPLE_API_KEY_ID && process.env.APPLE_API_KEY_ISSUER_ID && process.env.APPLE_API_KEY_PATH) {
    try {
      console.log('Using App Store Connect API Key for notarization.');
      const keyPath = process.env.APPLE_API_KEY_PATH;
      const keyContents = fs.readFileSync(keyPath, 'utf8');

      // Provide the key contents in a structured object for compatibility
      notarizeOptions.appleApiKey = {
        keyId: process.env.APPLE_API_KEY_ID,
        issuerId: process.env.APPLE_API_KEY_ISSUER_ID,
        key: keyContents,
      };

      if (process.env.APPLE_TEAM_ID) {
        notarizeOptions.teamId = process.env.APPLE_TEAM_ID;
      }
    } catch (err) {
      console.error('Failed to read APPLE_API_KEY_PATH:', err);
      console.log('Falling back to Apple ID method if available.');
    }
  }

  // Fallback method: Apple ID + app-specific password (legacy)
  if (!notarizeOptions.appleApiKey) {
    if (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) {
      console.log('Using Apple ID (app-specific password) for notarization.');
      notarizeOptions.appleId = process.env.APPLE_ID;
      notarizeOptions.appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
      notarizeOptions.teamId = process.env.APPLE_TEAM_ID;
    } else {
      console.log('Skipping notarization - missing Apple credentials.');
      console.log('Provide either (preferred): APPLE_API_KEY_ID, APPLE_API_KEY_ISSUER_ID, APPLE_API_KEY_PATH');
      console.log('Or (legacy): APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID');
      return;
    }
  }

  try {
    await notarize(notarizeOptions);
    console.log('Notarization complete!');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};
