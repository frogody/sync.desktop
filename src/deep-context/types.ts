/**
 * Deep Context Types
 *
 * Unified data models for the deep context activity tracker.
 * These types represent the new accessibility-based context system
 * that runs alongside the existing screen capture pipeline.
 */

// ============================================================================
// Core Context Event
// ============================================================================

export type ContextEventType =
  | 'commitment_detected'
  | 'task_started'
  | 'task_completed'
  | 'context_switch'
  | 'skill_signal'
  | 'opportunity_detected'
  | 'document_interaction'
  | 'communication_event';

export type PrivacyLevel = 'local_only' | 'sync_allowed';

export interface ContextEvent {
  id?: number;
  timestamp: number;
  eventType: ContextEventType;
  source: {
    application: string;
    windowTitle: string;
    url?: string;
    filePath?: string;
  };
  semanticPayload: {
    summary: string;
    entities: string[];
    intent?: string;
    commitments?: Commitment[];
    skillSignals?: SkillSignal[];
  };
  confidence: number;
  privacyLevel: PrivacyLevel;
  synced: boolean;
}

// ============================================================================
// Commitment
// ============================================================================

export type CommitmentStatus = 'detected' | 'pending_action' | 'fulfilled' | 'overdue';

export interface Commitment {
  description: string;
  dueDate?: number;
  involvedParties: string[];
  status: CommitmentStatus;
  requiredAction?: string;
}

// ============================================================================
// Skill Signal
// ============================================================================

export type ProficiencyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface SkillSignal {
  skillCategory: string;
  skillPath: string[];
  proficiencyIndicator: ProficiencyLevel;
  evidence: string;
}

// ============================================================================
// Daily Summary
// ============================================================================

export interface DailySummary {
  date: number;
  userId?: string;
  totalActiveTime: number;
  topApplications: {
    app: string;
    duration: number;
    activities: string[];
  }[];
  achievements: string[];
  commitmentsMade: Commitment[];
  commitmentsFollowedUp: Commitment[];
  commitmentsMissed: Commitment[];
  skillsExercised: SkillSignal[];
  contextSwitchCount: number;
  opportunitiesSurfaced: number;
}

// ============================================================================
// Capture Types (internal)
// ============================================================================

export interface AccessibilityCaptureResult {
  timestamp: number;
  appName: string;
  windowTitle: string;
  focusedElementText: string;
  focusedElementRole: string;
  visibleText: string;
  url?: string;
  filePath?: string;
}

export interface FileChangeEvent {
  timestamp: number;
  eventType: 'created' | 'modified' | 'renamed' | 'deleted';
  filePath: string;
  fileName: string;
  directory: string;
  extension: string;
}

// ============================================================================
// Configuration
// ============================================================================

export interface DeepContextEngineConfig {
  enabled: boolean;
  captureIntervalMs: number;
  excludedApps: string[];
  excludedDomains: string[];
  excludedTimeWindows: { start: string; end: string }[];
  fileWatcherEnabled: boolean;
  watchedDirectories: string[];
  encryptionEnabled: boolean;
  retentionDays: number;
  privacyLevel: PrivacyLevel;
}

export const DEFAULT_ENGINE_CONFIG: DeepContextEngineConfig = {
  enabled: true,
  captureIntervalMs: 15000,
  excludedApps: [],
  excludedDomains: [],
  excludedTimeWindows: [],
  fileWatcherEnabled: true,
  watchedDirectories: [],  // Will be populated with ~/Desktop, ~/Documents, ~/Downloads at runtime
  encryptionEnabled: true,
  retentionDays: 30,
  privacyLevel: 'sync_allowed',
};
