/**
 * Desktop Sync Diagnostic
 * Run this to check auth status and recent sync activity
 */

const Store = require('electron-store');
const store = new Store({
  encryptionKey: 'isyncso-desktop-encryption-key-2024',
  name: 'isyncso-desktop-v1'
});

console.log('=== SYNC DESKTOP DIAGNOSTIC ===\n');

// Check authentication
const accessToken = store.get('accessToken');
const user = store.get('user');

console.log('1. AUTHENTICATION STATUS:');
console.log('   Access Token:', accessToken ? `Present (${accessToken.substring(0, 20)}...)` : 'MISSING');
console.log('   User Object:', user ? 'Present' : 'MISSING');

if (user) {
  console.log('   User ID:', user.id);
  console.log('   Email:', user.email);
  console.log('   Company ID:', user.companyId || 'MISSING');
}

// Check settings
const settings = store.get('settings');
console.log('\n2. SYNC SETTINGS:');
console.log('   Tracking Enabled:', settings?.trackingEnabled ?? 'default (true)');
console.log('   Auto Sync:', settings?.autoSync ?? 'default (true)');
console.log('   Sync Interval:', settings?.syncIntervalMinutes ?? '5 minutes');

// Provide next steps
console.log('\n3. DIAGNOSTIC RESULT:');

if (!accessToken || !user) {
  console.log('   ❌ ISSUE: Authentication incomplete');
  console.log('   → You need to sign in via the desktop app');
  console.log('   → Click the SYNC avatar → "Sign in with iSyncSO"');
} else if (!user.companyId) {
  console.log('   ⚠️  WARNING: User missing company_id');
  console.log('   → This will cause sync to fail');
  console.log('   → Re-authenticate to fetch complete user profile');
} else {
  console.log('   ✅ Authentication looks good');
  console.log('   → If sync still fails, check:');
  console.log('     1. Desktop app is running');
  console.log('     2. Check desktop app logs for sync errors');
  console.log('     3. Verify data appears in web app DesktopActivity page');
}

console.log('\n=== END DIAGNOSTIC ===');
