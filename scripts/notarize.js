/**
 * macOS Notarization Script
 *
 * This script is called by electron-builder after signing the app.
 * It submits the app to Apple for notarization.
 *
 * Supports two authentication methods:
 *
 * Method 1: App Store Connect API Key (recommended for CI)
 * - APPLE_API_KEY: Path to .p8 file or use APPLE_API_KEY_ID/ISSUER_ID with APPLE_API_KEY_PATH
 * - APPLE_API_KEY_ID: Your API Key ID (e.g., "ABC123DEFG")
 * - APPLE_API_KEY_ISSUER_ID: Your Issuer ID (UUID from App Store Connect)
 * - APPLE_API_KEY_PATH: Path to the .p8 file (if not using APPLE_API_KEY)
 * - APPLE_TEAM_ID: Your Apple Developer Team ID (optional with API key method)
 *
 * Method 2: Apple ID credentials (legacy)
 * - APPLE_ID: Your Apple ID email
 * - APPLE_APP_SPECIFIC_PASSWORD: App-specific password from Apple ID settings
 * - APPLE_TEAM_ID: Your Apple Developer Team ID
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

  // Check if notarization is enabled
  if (process.env.SKIP_NOTARIZE === 'true') {
    console.log('Skipping notarization - SKIP_NOTARIZE is set');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  // Check for API Key credentials (preferred for CI)
  const hasApiKey = (process.env.APPLE_API_KEY || process.env.APPLE_API_KEY_PATH) &&
                    process.env.APPLE_API_KEY_ID &&
                    process.env.APPLE_API_KEY_ISSUER_ID;

  // Check for Apple ID credentials (legacy method)
  const hasAppleId = process.env.APPLE_ID &&
                     process.env.APPLE_APP_SPECIFIC_PASSWORD &&
                     process.env.APPLE_TEAM_ID;

  if (!hasApiKey && !hasAppleId) {
    console.log('Skipping notarization - missing credentials');
    console.log('Provide either API Key (APPLE_API_KEY_ID, APPLE_API_KEY_ISSUER_ID, APPLE_API_KEY_PATH)');
    console.log('or Apple ID (APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID)');
    return;
  }

  console.log(`Notarizing ${appPath}...`);

  try {
    const notarizeOptions = {
      appBundleId: 'com.isyncso.sync-desktop',
      appPath,
    };

    if (hasApiKey) {
      // Use API Key authentication (recommended for CI)
      console.log('Using App Store Connect API Key authentication');
      // appleApiKey expects a path to the .p8 file
      notarizeOptions.appleApiKey = process.env.APPLE_API_KEY_PATH || process.env.APPLE_API_KEY;
      notarizeOptions.appleApiKeyId = process.env.APPLE_API_KEY_ID;
      notarizeOptions.appleApiIssuer = process.env.APPLE_API_KEY_ISSUER_ID;
      if (process.env.APPLE_TEAM_ID) {
        notarizeOptions.teamId = process.env.APPLE_TEAM_ID;
      }
    } else {
      // Use Apple ID authentication (legacy)
      console.log('Using Apple ID authentication');
      notarizeOptions.appleId = process.env.APPLE_ID;
      notarizeOptions.appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
      notarizeOptions.teamId = process.env.APPLE_TEAM_ID;
    }

    await notarize(notarizeOptions);

    console.log('Notarization complete!');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};
