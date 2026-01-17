/**
 * macOS Notarization Script
 *
 * This script is called by electron-builder after signing the app.
 * It submits the app to Apple for notarization.
 *
 * Two authentication methods are supported:
 *
 * Method 1: App Store Connect API Key (Recommended for CI/CD)
 * Required environment variables:
 * - APPLE_API_KEY_ID: Key ID from App Store Connect (e.g., ABC123XYZ)
 * - APPLE_API_KEY_ISSUER_ID: Issuer ID from App Store Connect (UUID format)
 * - APPLE_API_KEY_PATH: Path to .p8 file OR
 * - APPLE_API_KEY_PRIVATE_BASE64: Base64-encoded .p8 file contents
 *
 * Method 2: Apple ID with App-Specific Password
 * Required environment variables:
 * - APPLE_ID: Your Apple ID email
 * - APPLE_APP_SPECIFIC_PASSWORD: App-specific password from appleid.apple.com
 * - APPLE_TEAM_ID: Your Apple Developer Team ID (10-character identifier)
 *
 * Setup Instructions:
 * - For App Store Connect API Key: https://developer.apple.com/documentation/appstoreconnectapi/creating_api_keys_for_app_store_connect_api
 * - For Apple ID method: https://support.apple.com/en-us/HT204397
 */

const { notarize } = require('@electron/notarize');
const path = require('path');
const fs = require('fs');

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
  const appBundleId = 'com.isyncso.sync-desktop';

  // Determine which authentication method to use
  const hasApiKey = !!(process.env.APPLE_API_KEY_ID && process.env.APPLE_API_KEY_ISSUER_ID);
  const hasAppleId = !!(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID);

  if (!hasApiKey && !hasAppleId) {
    console.log('⚠️  Skipping notarization - No Apple credentials configured');
    console.log('');
    console.log('To enable notarization, configure one of the following methods:');
    console.log('');
    console.log('Method 1 (Recommended for CI/CD): App Store Connect API Key');
    console.log('  Set these environment variables:');
    console.log('  - APPLE_API_KEY_ID: Key ID from App Store Connect');
    console.log('  - APPLE_API_KEY_ISSUER_ID: Issuer ID from App Store Connect');
    console.log('  - APPLE_API_KEY_PATH: Path to .p8 file OR');
    console.log('  - APPLE_API_KEY_PRIVATE_BASE64: Base64-encoded .p8 contents');
    console.log('  Guide: https://developer.apple.com/documentation/appstoreconnectapi/creating_api_keys_for_app_store_connect_api');
    console.log('');
    console.log('Method 2: Apple ID with App-Specific Password');
    console.log('  Set these environment variables:');
    console.log('  - APPLE_ID: Your Apple ID email');
    console.log('  - APPLE_APP_SPECIFIC_PASSWORD: App-specific password from appleid.apple.com');
    console.log('  - APPLE_TEAM_ID: Your 10-character Developer Team ID');
    console.log('  Guide: https://support.apple.com/en-us/HT204397');
    console.log('');
    return;
  }

  console.log(`🔐 Notarizing ${appPath}...`);

  try {
    let notarizeOptions = {
      appBundleId,
      appPath,
    };

    if (hasApiKey) {
      console.log('Using App Store Connect API Key authentication');
      
      // Read .p8 file contents
      let appleApiKey;
      if (process.env.APPLE_API_KEY_PRIVATE_BASE64) {
        // Decode from base64
        console.log('Reading API key from APPLE_API_KEY_PRIVATE_BASE64');
        appleApiKey = Buffer.from(process.env.APPLE_API_KEY_PRIVATE_BASE64, 'base64').toString('utf8');
      } else if (process.env.APPLE_API_KEY_PATH) {
        // Read from file
        console.log(`Reading API key from file: ${process.env.APPLE_API_KEY_PATH}`);
        appleApiKey = fs.readFileSync(process.env.APPLE_API_KEY_PATH, 'utf8');
      } else {
        throw new Error('APPLE_API_KEY_PATH or APPLE_API_KEY_PRIVATE_BASE64 must be set when using API Key authentication');
      }

      notarizeOptions.appleApiKey = appleApiKey;
      notarizeOptions.appleApiKeyId = process.env.APPLE_API_KEY_ID;
      notarizeOptions.appleApiIssuer = process.env.APPLE_API_KEY_ISSUER_ID;
    } else if (hasAppleId) {
      console.log('Using Apple ID authentication');
      notarizeOptions.appleId = process.env.APPLE_ID;
      notarizeOptions.appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
      notarizeOptions.teamId = process.env.APPLE_TEAM_ID;
    }

    await notarize(notarizeOptions);

    console.log('✅ Notarization complete!');
  } catch (error) {
    console.error('❌ Notarization failed:', error);
    console.error('');
    console.error('Troubleshooting tips:');
    console.error('- Verify your credentials are correct and up-to-date');
    console.error('- Check that your Apple Developer account is in good standing');
    console.error('- Ensure the app is properly signed before notarization');
    console.error('- Review the error message above for specific issues');
    console.error('');
    throw error;
  }
};
