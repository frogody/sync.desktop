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
  ocrText?: string | null;
  semanticCategory?: string | null;
  commitments?: string | null;
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
  companyId: string | null;
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
  syncIntervalMinutes: 1,
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

// ============================================================================
// Deep Context Types
// ============================================================================

export type CommitmentType = 'send_email' | 'create_event' | 'send_file' | 'follow_up' | 'make_call' | 'other';
export type CommitmentStatus = 'pending' | 'completed' | 'expired' | 'dismissed';
export type ActionPriority = 'high' | 'medium' | 'low';
export type ActionSource = 'email' | 'document' | 'chat' | 'calendar' | 'browser' | 'other';
export type ActivityType = 'composing_email' | 'reading_email' | 'editing_doc' | 'browsing' | 'coding' | 'meeting' | 'calendar' | 'chatting' | 'other';

export interface ScreenCapture {
  id?: number;
  timestamp: number;
  appName: string;
  windowTitle: string;
  textContent: string | null;
  analysis: ScreenAnalysis | null;
  imageHash: string | null;
  createdAt?: string;
}

export interface Commitment {
  id?: number;
  text: string;
  type: CommitmentType;
  recipient?: string;
  deadline?: number;
  detectedAt: number;
  completedAt?: number;
  status: CommitmentStatus;
  sourceCaptureId?: number;
  context?: Record<string, unknown>;
  confidence: number;
  synced: boolean;
}

export interface ActionItem {
  id?: number;
  text: string;
  priority: ActionPriority;
  source: ActionSource;
  detectedAt: number;
  completedAt?: number;
  status: 'pending' | 'completed' | 'dismissed';
  sourceCaptureId?: number;
  context?: Record<string, unknown>;
}

export interface CompletedAction {
  id?: number;
  actionType: string;
  details: Record<string, unknown>;
  timestamp: number;
  appName: string;
  matchedCommitmentId?: number;
}

export interface EmailContext {
  id?: number;
  timestamp: number;
  appName: string;
  action: 'composing' | 'reading' | 'sending' | 'sent';
  recipient?: string;
  subject?: string;
  bodyPreview?: string;
  hasAttachment: boolean;
  sourceCaptureId?: number;
}

export interface CalendarContext {
  id?: number;
  timestamp: number;
  appName: string;
  action: 'viewing' | 'creating' | 'editing' | 'created';
  eventTitle?: string;
  eventTime?: string;
  participants?: string[];
  sourceCaptureId?: number;
}

export interface ScreenAnalysis {
  timestamp: number;
  appContext: {
    app: string;
    activity: ActivityType;
  };
  commitments: {
    text: string;
    type: CommitmentType;
    recipient?: string;
    deadline?: string;
    confidence: number;
  }[];
  actionItems: {
    text: string;
    priority: ActionPriority;
    source: ActionSource;
  }[];
  emailContext?: {
    composing: boolean;
    to: string[];
    subject: string;
    bodyPreview: string;
    attachments: string[];
  };
  calendarContext?: {
    viewing: boolean;
    creating: boolean;
    eventTitle?: string;
    eventTime?: string;
    participants?: string[];
  };
}

export interface OCRResult {
  text: string;
  confidence: number;
  regions?: {
    text: string;
    bounds: { x: number; y: number; width: number; height: number };
    type?: 'heading' | 'paragraph' | 'button' | 'input' | 'link';
  }[];
}

export interface PendingFollowUp {
  commitment: Commitment;
  suggestedAction: string;
  context: string;
  urgency: 'low' | 'medium' | 'high';
}

export interface DeepContextSettings {
  enabled: boolean;
  captureIntervalMs: number;
  excludedApps: string[];
  ocrEnabled: boolean;
  semanticAnalysisEnabled: boolean;
  commitmentTrackingEnabled: boolean;
}

export const DEFAULT_DEEP_CONTEXT_SETTINGS: DeepContextSettings = {
  enabled: true,
  captureIntervalMs: 30000,
  excludedApps: [],
  ocrEnabled: true,
  semanticAnalysisEnabled: true,
  commitmentTrackingEnabled: true,
};
