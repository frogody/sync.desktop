// ============================================================================
// Application Constants
// ============================================================================

export const APP_NAME = 'SYNC Desktop';
export const APP_VERSION = '2.2.0';
export const APP_PROTOCOL = 'isyncso';

// ============================================================================
// API Configuration
// ============================================================================

export const SUPABASE_URL = 'https://sfxpmzicgpaxfntqleig.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmeHBtemljZ3BheGZudHFsZWlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NjIsImV4cCI6MjA4MjE4MjQ2Mn0.337ohi8A4zu_6Hl1LpcPaWP8UkI5E4Om7ZgeU9_A8t4';

export const WEB_APP_URL = 'https://app.isyncso.com';
export const AUTH_CALLBACK_PATH = '/desktop-auth';

// ============================================================================
// Widget Configuration
// ============================================================================

export const WIDGET_SIZES = {
  small: { width: 48, height: 48 },
  medium: { width: 64, height: 64 },
  large: { width: 80, height: 80 },
} as const;

export const CHAT_WINDOW_SIZE = {
  width: 380,
  height: 520,
};

export const VOICE_WINDOW_SIZE = {
  width: 320,
  height: 400,
};

// ============================================================================
// Activity Tracking Configuration
// ============================================================================

export const ACTIVITY_POLL_INTERVAL_MS = 5000; // 5 seconds
export const CONTEXT_WINDOW_MINUTES = 10;
export const HOURLY_SUMMARY_RETENTION_HOURS = 168; // 7 days
export const DAILY_JOURNAL_RETENTION_DAYS = 90;

// ============================================================================
// Cloud Sync Configuration
// ============================================================================

export const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const SYNC_BATCH_SIZE = 100;

// ============================================================================
// Service Timing Constants (INF-011)
// ============================================================================

/** Auto-updater: delay before first check after startup */
export const UPDATER_INITIAL_DELAY_MS = 10_000; // 10 seconds
/** Auto-updater: interval between recurring checks */
export const UPDATER_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Cross-reference interval for commitment follow-ups */
export const CROSS_REFERENCE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Semantic batch processing delay */
export const SEMANTIC_BATCH_DELAY_MS = 2_000; // 2 seconds
/** Semantic batch max size */
export const SEMANTIC_MAX_BATCH_SIZE = 3;

/** Semantic processing cycle interval */
export const SEMANTIC_CYCLE_INTERVAL_MS = 60 * 1000; // 60 seconds
/** Initial delay before first semantic cycle */
export const SEMANTIC_INITIAL_DELAY_MS = 15_000; // 15 seconds

/** Signature computation interval */
export const SIGNATURE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
/** Initial delay before first signature computation */
export const SIGNATURE_INITIAL_DELAY_MS = 60_000; // 60 seconds

/** Initial delay before first cloud sync */
export const SYNC_INITIAL_DELAY_MS = 30_000; // 30 seconds

// ============================================================================
// Together.ai API Configuration (INF-006)
// ============================================================================

export const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
export const TOGETHER_MODEL = 'moonshotai/Kimi-K2-Instruct';

// ============================================================================
// Click Detection
// ============================================================================

export const CLICK_DEBOUNCE_MS = 300;
export const DOUBLE_CLICK_MAX_MS = 400;
export const TRIPLE_CLICK_MAX_MS = 600;

// ============================================================================
// Voice Configuration
// ============================================================================

export const TTS_VOICES = ['tara', 'leah', 'jess', 'leo', 'dan', 'mia', 'zac', 'zoe'] as const;
export type TTSVoice = (typeof TTS_VOICES)[number];

// ============================================================================
// Privacy Defaults
// ============================================================================

export const SENSITIVE_APP_PATTERNS = [
  'password',
  '1password',
  'lastpass',
  'keychain',
  'bitwarden',
  'dashlane',
  'banking',
  'medical',
  'health',
] as const;

export const BROWSER_APPS = [
  'Google Chrome',
  'Firefox',
  'Safari',
  'Microsoft Edge',
  'Arc',
  'Brave Browser',
  'Opera',
] as const;
