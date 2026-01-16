// ============================================================================
// Activity Tracking Types
// ============================================================================

export interface ActivityLog {
  id?: number;
  timestamp: number;
  appName: string;
  windowTitle: string;
  url?: string;
  bundleId?: string;
  durationSeconds?: number;
  synced: boolean;
  createdAt?: string;
}

export interface AppBreakdownItem {
  appName: string;
  minutes: number;
  percentage: number;
  category: string;
}

export interface HourlySummary {
  id: number;
  hourStart: number; // timestamp
  appBreakdown: AppBreakdownItem[];
  totalMinutes: number;
  focusScore: number;
  synced: boolean;
}

export interface DayHighlight {
  type: 'achievement' | 'focus_session' | 'productive_streak' | 'meeting_heavy' | 'communication_heavy';
  description: string;
  timeRange?: string;
  durationMinutes?: number;
}

export interface FocusArea {
  category: string;
  minutes: number;
  percentage: number;
  apps: string[];
}

export interface DailyJournal {
  id: number;
  journalDate: number; // timestamp
  overview: string;
  highlights: DayHighlight[];
  focusAreas: FocusArea[];
  synced: boolean;
}

// ============================================================================
// User & Authentication Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  name?: string;
  companyId: string;
  avatarUrl?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
}

// ============================================================================
// Chat & Voice Types
// ============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  actionExecuted?: {
    type: string;
    success: boolean;
    redirectUrl?: string;
  };
}

export interface VoiceState {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  transcript: string;
  error: string | null;
}

// ============================================================================
// Window & UI Types
// ============================================================================

export type WidgetMode = 'avatar' | 'chat' | 'voice';

export interface WindowState {
  mode: WidgetMode;
  isExpanded: boolean;
  position: { x: number; y: number };
}

export interface AvatarState {
  mood: 'neutral' | 'happy' | 'thinking' | 'speaking' | 'listening';
  isAnimating: boolean;
  glowIntensity: number;
}

// ============================================================================
// Settings Types
// ============================================================================

export interface AppSettings {
  // Tracking
  trackingEnabled: boolean;
  excludedApps: string[];
  dataRetentionDays: number;

  // Sync
  autoSync: boolean;
  syncIntervalMinutes: number;

  // UI
  avatarPosition: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  avatarSize: 'small' | 'medium' | 'large';
  showInDock: boolean;
  launchAtLogin: boolean;

  // Voice
  voiceEnabled: boolean;
  voiceName: string;

  // Privacy
  trackBrowserUrls: boolean;
  anonymizeWindowTitles: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  trackingEnabled: true,
  excludedApps: [],
  dataRetentionDays: 30,
  autoSync: true,
  syncIntervalMinutes: 5,
  avatarPosition: 'top-right',
  avatarSize: 'medium',
  showInDock: false,
  launchAtLogin: true,
  voiceEnabled: true,
  voiceName: 'tara',
  trackBrowserUrls: true,
  anonymizeWindowTitles: false,
};

// ============================================================================
// IPC Types
// ============================================================================

export interface IPCRequest<T = unknown> {
  channel: string;
  data?: T;
}

export interface IPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// Sync API Types
// ============================================================================

export interface SyncRequest {
  message: string;
  sessionId: string;
  stream?: boolean;
  context?: {
    userId?: string;
    companyId?: string;
    source: 'desktop-app';
    recentActivity?: string;
    currentApp?: string;
  };
}

export interface SyncResponse {
  response: string;
  actionExecuted?: {
    type: string;
    success: boolean;
    redirectUrl?: string;
  };
}

export interface VoiceSyncRequest {
  message: string;
  sessionId: string;
  voice?: string;
  context?: {
    userId?: string;
    companyId?: string;
  };
}

export interface VoiceSyncResponse {
  text: string;
  audio: string; // base64
  audioFormat: string;
  actionExecuted?: {
    type: string;
    success: boolean;
  };
  timing: {
    total: number;
    sync: number;
    tts: number;
  };
}
