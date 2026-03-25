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
  WINDOW_SHOW_LOGIN: 'window:show-login',

  // Activity Tracking
  ACTIVITY_GET_RECENT: 'activity:get-recent',
  ACTIVITY_GET_SUMMARY: 'activity:get-summary',
  ACTIVITY_GET_DETAILED_CONTEXT: 'activity:get-detailed-context',
  ACTIVITY_GET_CONTEXT_FOR_SYNC: 'activity:get-context-for-sync',
  // TODO: No handler registered — reserved for future renderer-based tracking toggle (currently tray-only)
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

  // SYNC Agent — TODO: No handlers registered. Reserved for future main-process SYNC streaming.
  // Currently, renderer calls Supabase edge functions directly via fetch().
  SYNC_SEND_MESSAGE: 'sync:send-message',
  SYNC_STREAM_CHUNK: 'sync:stream-chunk',
  SYNC_STREAM_END: 'sync:stream-end',
  SYNC_VOICE_START: 'sync:voice-start',
  SYNC_VOICE_END: 'sync:voice-end',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  // TODO: No handler registered — reserved for future settings reset feature
  SETTINGS_RESET: 'settings:reset',
  SETTINGS_SET_API_KEY: 'settings:set-api-key',
  SETTINGS_GET_API_KEY_STATUS: 'settings:get-api-key-status',

  // Cloud Sync
  CLOUD_SYNC_NOW: 'cloud:sync-now',
  CLOUD_SYNC_STATUS: 'cloud:sync-status',
  // TODO: No handler registered — reserved for future last-sync timestamp query
  CLOUD_LAST_SYNC: 'cloud:last-sync',

  // System
  SYSTEM_OPEN_EXTERNAL: 'system:open-external',
  SYSTEM_GET_INFO: 'system:get-info',
  SYSTEM_CHECK_PERMISSIONS: 'system:check-permissions',
  SYSTEM_REQUEST_PERMISSION: 'system:request-permission',
  SYSTEM_RELAUNCH_APP: 'system:relaunch-app',

  // Journal
  JOURNAL_GET_TODAY: 'journal:get-today',
  JOURNAL_GET_HISTORY: 'journal:get-history',

  // Updates
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATUS: 'update:status',
  UPDATE_AVAILABLE: 'update:available',
  UPDATE_PROGRESS: 'update:progress',
  UPDATE_DOWNLOADED: 'update:downloaded',

  // Deep Context
  DEEP_CONTEXT_STATUS: 'deep-context:status',
  DEEP_CONTEXT_GET_COMMITMENTS: 'deep-context:get-commitments',
  DEEP_CONTEXT_GET_PENDING_FOLLOWUPS: 'deep-context:get-pending-followups',
  DEEP_CONTEXT_DISMISS_COMMITMENT: 'deep-context:dismiss-commitment',
  DEEP_CONTEXT_COMPLETE_COMMITMENT: 'deep-context:complete-commitment',
  DEEP_CONTEXT_GET_ENRICHED_CONTEXT: 'deep-context:get-enriched-context',

  // Health Checks (INF-009)
  HEALTH_CHECK: 'health:check',

  // Semantic Pipeline
  SEMANTIC_GET_WORK_CONTEXT: 'semantic:get-work-context',
  SEMANTIC_GET_ENTITIES: 'semantic:get-entities',
  SEMANTIC_GET_THREADS: 'semantic:get-threads',
  SEMANTIC_GET_SIGNATURES: 'semantic:get-signatures',
  SEMANTIC_GET_ACTIVITY_DISTRIBUTION: 'semantic:get-activity-distribution',
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
