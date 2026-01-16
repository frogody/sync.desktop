// ============================================================================
// IPC Channel Names
// Shared between main and renderer processes
// ============================================================================

export const IPC_CHANNELS = {
  // Window Management
  WINDOW_EXPAND: 'window:expand',
  WINDOW_COLLAPSE: 'window:collapse',
  WINDOW_MOVE: 'window:move',
  WINDOW_MODE_CHANGE: 'window:mode-change',

  // Activity Tracking
  ACTIVITY_GET_RECENT: 'activity:get-recent',
  ACTIVITY_GET_SUMMARY: 'activity:get-summary',
  ACTIVITY_GET_DETAILED_CONTEXT: 'activity:get-detailed-context',
  ACTIVITY_GET_CONTEXT_FOR_SYNC: 'activity:get-context-for-sync',
  ACTIVITY_TOGGLE_TRACKING: 'activity:toggle-tracking',
  ACTIVITY_STATUS: 'activity:status',

  // Productivity Stats
  STATS_GET_TODAY: 'stats:get-today',
  STATS_GET_WEEKLY: 'stats:get-weekly',

  // Authentication
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_STATUS: 'auth:status',
  AUTH_CALLBACK: 'auth:callback',

  // SYNC Agent
  SYNC_SEND_MESSAGE: 'sync:send-message',
  SYNC_STREAM_CHUNK: 'sync:stream-chunk',
  SYNC_STREAM_END: 'sync:stream-end',
  SYNC_VOICE_START: 'sync:voice-start',
  SYNC_VOICE_END: 'sync:voice-end',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RESET: 'settings:reset',

  // Cloud Sync
  CLOUD_SYNC_NOW: 'cloud:sync-now',
  CLOUD_SYNC_STATUS: 'cloud:sync-status',
  CLOUD_LAST_SYNC: 'cloud:last-sync',

  // System
  SYSTEM_OPEN_EXTERNAL: 'system:open-external',
  SYSTEM_GET_INFO: 'system:get-info',
  SYSTEM_CHECK_PERMISSIONS: 'system:check-permissions',
  SYSTEM_REQUEST_PERMISSION: 'system:request-permission',

  // Journal
  JOURNAL_GET_TODAY: 'journal:get-today',
  JOURNAL_GET_HISTORY: 'journal:get-history',
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
