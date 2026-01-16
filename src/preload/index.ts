/**
 * Preload Script
 *
 * Exposes a safe API to the renderer process via contextBridge.
 * This is the only way renderer can communicate with main process.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipcChannels';
import type { AppSettings, WidgetMode } from '../shared/types';

// ============================================================================
// Type Definitions for Exposed API
// ============================================================================

export interface ElectronAPI {
  // Window
  expandWindow: (mode: 'chat' | 'voice') => Promise<{ success: boolean }>;
  collapseWindow: () => Promise<{ success: boolean }>;
  moveWindow: (x: number, y: number) => Promise<{ success: boolean }>;
  onModeChange: (callback: (mode: WidgetMode) => void) => () => void;

  // Activity
  getRecentActivity: (minutes?: number) => Promise<{
    success: boolean;
    data?: any[];
    error?: string;
  }>;
  getActivitySummary: (minutes?: number) => Promise<{
    success: boolean;
    data?: string;
    error?: string;
  }>;
  getDetailedContext: (minutes?: number) => Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }>;
  getContextForSync: () => Promise<{
    success: boolean;
    data?: string;
    error?: string;
  }>;
  getActivityStatus: () => Promise<{
    success: boolean;
    data?: { isTracking: boolean };
  }>;

  // Productivity Stats
  getTodayStats: () => Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }>;
  getWeeklySummary: () => Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }>;

  // Cloud Sync
  triggerSync: () => Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }>;
  getSyncStatus: () => Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }>;

  // Auth
  login: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<{ success: boolean }>;
  getAuthStatus: () => Promise<{
    success: boolean;
    data?: { isAuthenticated: boolean; accessToken?: string };
  }>;
  onAuthCallback: (
    callback: (data: { success: boolean; token?: string }) => void
  ) => () => void;
  offAuthCallback: (callback: () => void) => void;

  // Settings
  getSettings: () => Promise<{
    success: boolean;
    data?: AppSettings;
    error?: string;
  }>;
  setSettings: (updates: Partial<AppSettings>) => Promise<{
    success: boolean;
    data?: AppSettings;
    error?: string;
  }>;

  // Journal
  getTodayJournal: () => Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }>;
  getJournalHistory: (days?: number) => Promise<{
    success: boolean;
    data?: any[];
    error?: string;
  }>;

  // System
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  getSystemInfo: () => Promise<{
    success: boolean;
    data?: { platform: string; version: string; name: string };
  }>;
  checkPermissions: () => Promise<{
    success: boolean;
    data?: { accessibility: boolean; screenCapture: boolean };
  }>;
  requestPermission: (permission: string) => Promise<{ success: boolean }>;

  // Platform
  platform: string;
}

// ============================================================================
// API Implementation
// ============================================================================

const electronAPI: ElectronAPI = {
  // Window
  expandWindow: (mode) => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_EXPAND, mode),
  collapseWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_COLLAPSE),
  moveWindow: (x, y) => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MOVE, { x, y }),
  onModeChange: (callback) => {
    const handler = (_event: any, mode: WidgetMode) => callback(mode);
    ipcRenderer.on(IPC_CHANNELS.WINDOW_MODE_CHANGE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_MODE_CHANGE, handler);
  },

  // Activity
  getRecentActivity: (minutes = 10) =>
    ipcRenderer.invoke(IPC_CHANNELS.ACTIVITY_GET_RECENT, minutes),
  getActivitySummary: (minutes = 10) =>
    ipcRenderer.invoke(IPC_CHANNELS.ACTIVITY_GET_SUMMARY, minutes),
  getDetailedContext: (minutes = 10) =>
    ipcRenderer.invoke(IPC_CHANNELS.ACTIVITY_GET_DETAILED_CONTEXT, minutes),
  getContextForSync: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ACTIVITY_GET_CONTEXT_FOR_SYNC),
  getActivityStatus: () => ipcRenderer.invoke(IPC_CHANNELS.ACTIVITY_STATUS),

  // Productivity Stats
  getTodayStats: () => ipcRenderer.invoke(IPC_CHANNELS.STATS_GET_TODAY),
  getWeeklySummary: () => ipcRenderer.invoke(IPC_CHANNELS.STATS_GET_WEEKLY),

  // Cloud Sync
  triggerSync: () => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_SYNC_NOW),
  getSyncStatus: () => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_SYNC_STATUS),

  // Auth
  login: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN),
  logout: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
  getAuthStatus: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_STATUS),
  onAuthCallback: (callback) => {
    const handler = (_event: any, data: { success: boolean; token?: string }) =>
      callback(data);
    ipcRenderer.on(IPC_CHANNELS.AUTH_CALLBACK, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AUTH_CALLBACK, handler);
  },
  offAuthCallback: (callback) => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.AUTH_CALLBACK);
  },

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  setSettings: (updates) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, updates),

  // Journal
  getTodayJournal: () => ipcRenderer.invoke(IPC_CHANNELS.JOURNAL_GET_TODAY),
  getJournalHistory: (days = 30) =>
    ipcRenderer.invoke(IPC_CHANNELS.JOURNAL_GET_HISTORY, days),

  // System
  openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, url),
  getSystemInfo: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_INFO),
  checkPermissions: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_CHECK_PERMISSIONS),
  requestPermission: (permission) =>
    ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_REQUEST_PERMISSION, permission),

  // Platform
  platform: process.platform,
};

// ============================================================================
// Expose to Renderer
// ============================================================================

contextBridge.exposeInMainWorld('electron', electronAPI);

// TypeScript declaration for window.electron
declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
