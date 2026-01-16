"use strict";
/**
 * Preload Script
 *
 * Exposes a safe API to the renderer process via contextBridge.
 * This is the only way renderer can communicate with main process.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const ipcChannels_1 = require("../shared/ipcChannels");
// ============================================================================
// API Implementation
// ============================================================================
const electronAPI = {
    // Window
    expandWindow: (mode) => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.WINDOW_EXPAND, mode),
    collapseWindow: () => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.WINDOW_COLLAPSE),
    moveWindow: (x, y) => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.WINDOW_MOVE, { x, y }),
    onModeChange: (callback) => {
        const handler = (_event, mode) => callback(mode);
        electron_1.ipcRenderer.on(ipcChannels_1.IPC_CHANNELS.WINDOW_MODE_CHANGE, handler);
        return () => electron_1.ipcRenderer.removeListener(ipcChannels_1.IPC_CHANNELS.WINDOW_MODE_CHANGE, handler);
    },
    // Activity
    getRecentActivity: (minutes = 10) => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.ACTIVITY_GET_RECENT, minutes),
    getActivitySummary: (minutes = 10) => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.ACTIVITY_GET_SUMMARY, minutes),
    getActivityStatus: () => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.ACTIVITY_STATUS),
    // Auth
    login: () => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.AUTH_LOGIN),
    logout: () => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.AUTH_LOGOUT),
    getAuthStatus: () => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.AUTH_STATUS),
    onAuthCallback: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on(ipcChannels_1.IPC_CHANNELS.AUTH_CALLBACK, handler);
        return () => electron_1.ipcRenderer.removeListener(ipcChannels_1.IPC_CHANNELS.AUTH_CALLBACK, handler);
    },
    // Settings
    getSettings: () => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.SETTINGS_GET),
    setSettings: (updates) => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.SETTINGS_SET, updates),
    // Journal
    getTodayJournal: () => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.JOURNAL_GET_TODAY),
    getJournalHistory: (days = 30) => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.JOURNAL_GET_HISTORY, days),
    // System
    openExternal: (url) => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, url),
    getSystemInfo: () => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.SYSTEM_GET_INFO),
    checkPermissions: () => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.SYSTEM_CHECK_PERMISSIONS),
    requestPermission: (permission) => electron_1.ipcRenderer.invoke(ipcChannels_1.IPC_CHANNELS.SYSTEM_REQUEST_PERMISSION, permission),
    // Platform
    platform: process.platform,
};
// ============================================================================
// Expose to Renderer
// ============================================================================
electron_1.contextBridge.exposeInMainWorld('electron', electronAPI);
