/**
 * Semantic Foundation Types
 *
 * Type definitions for the five-stage semantic processing pipeline:
 * 1. Entity Extraction
 * 2. Activity Typing
 * 3. Context Threading
 * 4. Intent Graphs
 * 5. Behavioral Signatures
 */

// ============================================================================
// Enums
// ============================================================================

export type EntityType = 'person' | 'project' | 'tool' | 'topic' | 'organization' | 'document';

export type ActivityType =
  | 'BUILDING'
  | 'INVESTIGATING'
  | 'COMMUNICATING'
  | 'ORGANIZING'
  | 'OPERATING'
  | 'CONTEXT_SWITCHING';

export type ActivitySubtype =
  // BUILDING
  | 'coding' | 'debugging' | 'designing' | 'writing' | 'composing'
  // INVESTIGATING
  | 'reading' | 'searching' | 'reviewing' | 'analyzing' | 'learning'
  // COMMUNICATING
  | 'messaging' | 'emailing' | 'meeting' | 'presenting' | 'calling'
  // ORGANIZING
  | 'planning' | 'filing' | 'scheduling' | 'documenting' | 'tagging'
  // OPERATING
  | 'deploying' | 'monitoring' | 'configuring' | 'testing_infra' | 'updating'
  // CONTEXT_SWITCHING
  | 'app_switch' | 'topic_switch' | 'break' | 'interruption';

export type IntentType = 'SHIP' | 'MANAGE' | 'PLAN' | 'MAINTAIN' | 'RESPOND';

export type IntentSubtype =
  // SHIP
  | 'feature_delivery' | 'bug_fix' | 'release' | 'hotfix'
  // MANAGE
  | 'code_review' | 'sprint_planning' | 'team_coordination' | 'status_update'
  // PLAN
  | 'architecture' | 'research' | 'design' | 'estimation'
  // MAINTAIN
  | 'refactoring' | 'dependency_update' | 'documentation' | 'tech_debt'
  // RESPOND
  | 'incident_response' | 'support_ticket' | 'ad_hoc_request' | 'meeting_followup';

export type ThreadStatus = 'active' | 'paused' | 'completed' | 'abandoned';

export type TransitionType = 'switch' | 'merge' | 'split' | 'resume';

export type IntentOutcome = 'completed' | 'abandoned' | 'deferred';

export type SignatureCategory = 'rhythm' | 'workflow' | 'quality' | 'collaboration' | 'tool' | 'stress';

export type SignatureTrend = 'improving' | 'declining' | 'stable' | 'volatile';

export type ExtractionMethod = 'regex' | 'mlx' | 'rule' | 'hybrid' | 'manual';

export type ClassificationMethod = 'rule' | 'mlx' | 'hybrid';

export type PrivacyLevel = 'local_only' | 'sync_allowed';

export type EntityRole = 'primary' | 'mentioned' | 'inferred';

export type RelationshipType = 'works_on' | 'collaborates_with' | 'owns' | 'uses' | 'member_of';

export type IntentEntityRole = 'primary' | 'related' | 'blocking';

// ============================================================================
// Stage 1: Entities
// ============================================================================

export interface Entity {
  id?: number;
  entityId: string;
  name: string;
  type: EntityType;
  confidence: number;
  firstSeen: number;
  lastSeen: number;
  occurrenceCount: number;
  metadata: Record<string, unknown>;
  privacyLevel: PrivacyLevel;
  synced: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface EntityAlias {
  id?: number;
  entityId: string;
  alias: string;
  source: 'ocr' | 'window_title' | 'commit' | 'calendar' | 'manual';
  frequency: number;
  createdAt: number;
}

export interface EntityRelationship {
  id?: number;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: RelationshipType;
  strength: number;
  evidenceCount: number;
  lastEvidence: number;
  synced: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface EventEntityLink {
  id?: number;
  eventId: string;
  entityId: string;
  role: EntityRole;
  extractionMethod: ExtractionMethod;
  confidence: number;
  createdAt: number;
}

// ============================================================================
// Stage 2: Activities
// ============================================================================

export interface SemanticActivity {
  id?: number;
  activityId: string;
  eventId: string;
  activityType: ActivityType;
  activitySubtype: ActivitySubtype | null;
  confidence: number;
  classificationMethod: ClassificationMethod;
  durationMs: number | null;
  metadata: Record<string, unknown>;
  privacyLevel: PrivacyLevel;
  synced: boolean;
  createdAt: number;
}

export interface ActivityTransition {
  id?: number;
  fromActivityId: string;
  toActivityId: string;
  transitionTime: number;
  gapMs: number;
  createdAt: number;
}

// ============================================================================
// Stage 3: Threads
// ============================================================================

export interface SemanticThread {
  id?: number;
  threadId: string;
  title: string | null;
  status: ThreadStatus;
  startedAt: number;
  lastActivityAt: number;
  eventCount: number;
  primaryEntities: string[];
  primaryActivityType: ActivityType | null;
  metadata: Record<string, unknown>;
  privacyLevel: PrivacyLevel;
  synced: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ThreadEvent {
  id?: number;
  threadId: string;
  eventId: string;
  relevanceScore: number;
  addedAt: number;
}

export interface ThreadTransition {
  id?: number;
  fromThreadId: string;
  toThreadId: string;
  transitionType: TransitionType;
  timestamp: number;
  createdAt: number;
}

// ============================================================================
// Stage 4: Intents
// ============================================================================

export interface SemanticIntent {
  id?: number;
  intentId: string;
  threadId: string | null;
  intentType: IntentType;
  intentSubtype: IntentSubtype | null;
  confidence: number;
  classificationMethod: ClassificationMethod;
  evidence: string[];
  resolvedAt: number | null;
  outcome: IntentOutcome | null;
  privacyLevel: PrivacyLevel;
  synced: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface IntentSequence {
  id?: number;
  intentId: string;
  activityId: string;
  sequenceOrder: number;
  createdAt: number;
}

export interface EntityIntentMap {
  id?: number;
  entityId: string;
  intentId: string;
  role: IntentEntityRole;
  createdAt: number;
}

// ============================================================================
// Stage 5: Behavioral Signatures
// ============================================================================

export interface BehavioralSignature {
  id?: number;
  signatureId: string;
  category: SignatureCategory;
  metricName: string;
  currentValue: unknown;
  trend: SignatureTrend;
  confidence: number;
  sampleSize: number;
  windowDays: number;
  computedAt: number;
  privacyLevel: PrivacyLevel;
  synced: boolean;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Composite / API Types
// ============================================================================

export interface WorkContext {
  thread: SemanticThread | null;
  intent: SemanticIntent | null;
  entities: Entity[];
  activityType: ActivityType | null;
  activitySubtype: ActivitySubtype | null;
  signatures: BehavioralSignature[];
}

export interface ActivityDistribution {
  type: ActivityType;
  count: number;
  totalDurationMs: number;
  percentage: number;
}

export interface ActivityClassification {
  activityType: ActivityType;
  activitySubtype: ActivitySubtype | null;
  confidence: number;
  method: ClassificationMethod;
}

export interface IntentClassification {
  intentType: IntentType;
  intentSubtype: IntentSubtype | null;
  confidence: number;
  evidence: string[];
  method: ClassificationMethod;
}

export interface EntityCorrection {
  type?: EntityType;
  name?: string;
  mergeWithEntityId?: string;
}

export interface ActivityCorrection {
  activityType: ActivityType;
  activitySubtype?: ActivitySubtype;
}

export interface ThreadCorrection {
  moveEventId?: string;
  targetThreadId?: string;
  mergeWithThreadId?: string;
}

export interface IntentCorrection {
  intentType: IntentType;
  intentSubtype?: IntentSubtype;
}
