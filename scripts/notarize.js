/**
 * macOS Notarization Script
 *
 * This script is called by electron-builder after signing the app.
 * It submits the app to Apple for notarization.
 *
 * Supported authentication methods (in order of preference):
 * 1. App Store Connect API Key:
 *    - APPLE_API_KEY_ID: API Key ID (e.g., ABCD1234)
 *    - APPLE_API_KEY_ISSUER_ID: Issuer ID
 *    - APPLE_API_KEY_PATH: Path to .p8 file
 *    - APPLE_TEAM_ID: Your Apple Developer Team ID
 *
 * 2. Apple ID (legacy):
 *    - APPLE_ID: Your Apple ID email
 *    - APPLE_APP_SPECIFIC_PASSWORD: App-specific password
 *    - APPLE_TEAM_ID: Your Apple Developer Team ID
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

  console.log(`Notarizing ${appPath}...`);

  // Determine authentication method
  let notarizeOptions = {
    appBundleId: 'com.isyncso.sync-desktop',
    appPath,
  };

  // Check for App Store Connect API Key (preferred method)
  if (process.env.APPLE_API_KEY_ID && 
      process.env.APPLE_API_KEY_ISSUER_ID && 
      process.env.APPLE_API_KEY_PATH) {
    console.log('Using App Store Connect API Key for notarization');
    notarizeOptions.appleApiKey = process.env.APPLE_API_KEY_PATH;
    notarizeOptions.appleApiKeyId = process.env.APPLE_API_KEY_ID;
    notarizeOptions.appleApiIssuer = process.env.APPLE_API_KEY_ISSUER_ID;
  }
  // Fall back to Apple ID method
  else if (process.env.APPLE_ID && 
           process.env.APPLE_APP_SPECIFIC_PASSWORD && 
           process.env.APPLE_TEAM_ID) {
    console.log('Using Apple ID for notarization');
    notarizeOptions.appleId = process.env.APPLE_ID;
    notarizeOptions.appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
    notarizeOptions.teamId = process.env.APPLE_TEAM_ID;
  }
  // No credentials found
  else {
    console.log('Skipping notarization - missing Apple credentials');
    console.log('Provide either:');
    console.log('  - APPLE_API_KEY_ID, APPLE_API_KEY_ISSUER_ID, APPLE_API_KEY_PATH (preferred)');
    console.log('  - APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID (legacy)');
    return;
  }

  try {
    await notarize(notarizeOptions);
    console.log('Notarization complete!');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};
