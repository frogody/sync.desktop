"use strict";
// ============================================================================
// Application Constants
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.BROWSER_APPS = exports.SENSITIVE_APP_PATTERNS = exports.TTS_VOICES = exports.TRIPLE_CLICK_MAX_MS = exports.DOUBLE_CLICK_MAX_MS = exports.CLICK_DEBOUNCE_MS = exports.SYNC_BATCH_SIZE = exports.DEFAULT_SYNC_INTERVAL_MS = exports.DAILY_JOURNAL_RETENTION_DAYS = exports.HOURLY_SUMMARY_RETENTION_HOURS = exports.CONTEXT_WINDOW_MINUTES = exports.ACTIVITY_POLL_INTERVAL_MS = exports.VOICE_WINDOW_SIZE = exports.CHAT_WINDOW_SIZE = exports.WIDGET_SIZES = exports.AUTH_CALLBACK_PATH = exports.WEB_APP_URL = exports.SUPABASE_ANON_KEY = exports.SUPABASE_URL = exports.APP_PROTOCOL = exports.APP_VERSION = exports.APP_NAME = void 0;
exports.APP_NAME = 'SYNC Desktop';
exports.APP_VERSION = '1.0.0';
exports.APP_PROTOCOL = 'isyncso';
// ============================================================================
// API Configuration
// ============================================================================
exports.SUPABASE_URL = 'https://sfxpmzicgpaxfntqleig.supabase.co';
exports.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmeHBtemljZ3BheGZudHFsZWlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NjIsImV4cCI6MjA4MjE4MjQ2Mn0.337ohi8A4zu_6Hl1LpcPaWP8UkI5E4Om7ZgeU9_A8t4';
exports.WEB_APP_URL = 'https://app.isyncso.com';
exports.AUTH_CALLBACK_PATH = '/desktop-auth';
// ============================================================================
// Widget Configuration
// ============================================================================
exports.WIDGET_SIZES = {
    small: { width: 48, height: 48 },
    medium: { width: 64, height: 64 },
    large: { width: 80, height: 80 },
};
exports.CHAT_WINDOW_SIZE = {
    width: 380,
    height: 520,
};
exports.VOICE_WINDOW_SIZE = {
    width: 320,
    height: 400,
};
// ============================================================================
// Activity Tracking Configuration
// ============================================================================
exports.ACTIVITY_POLL_INTERVAL_MS = 5000; // 5 seconds
exports.CONTEXT_WINDOW_MINUTES = 10;
exports.HOURLY_SUMMARY_RETENTION_HOURS = 168; // 7 days
exports.DAILY_JOURNAL_RETENTION_DAYS = 90;
// ============================================================================
// Cloud Sync Configuration
// ============================================================================
exports.DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
exports.SYNC_BATCH_SIZE = 100;
// ============================================================================
// Click Detection
// ============================================================================
exports.CLICK_DEBOUNCE_MS = 300;
exports.DOUBLE_CLICK_MAX_MS = 400;
exports.TRIPLE_CLICK_MAX_MS = 600;
// ============================================================================
// Voice Configuration
// ============================================================================
exports.TTS_VOICES = ['tara', 'leah', 'jess', 'leo', 'dan', 'mia', 'zac', 'zoe'];
// ============================================================================
// Privacy Defaults
// ============================================================================
exports.SENSITIVE_APP_PATTERNS = [
    'password',
    '1password',
    'lastpass',
    'keychain',
    'bitwarden',
    'dashlane',
    'banking',
    'medical',
    'health',
];
exports.BROWSER_APPS = [
    'Google Chrome',
    'Firefox',
    'Safari',
    'Microsoft Edge',
    'Arc',
    'Brave Browser',
    'Opera',
];
