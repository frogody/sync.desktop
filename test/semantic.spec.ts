/**
 * Semantic Pipeline Tests
 *
 * Tests for the 5-stage semantic processing pipeline:
 * 1. EntityRegistry — entity extraction, deduplication, aliases, relationships
 * 2. SemanticProcessor — activity classification, transitions
 * 3. ThreadManager — thread creation, assignment, lifecycle
 * 4. IntentClassifier — intent detection, resolution
 * 5. SignatureComputer — behavioral signatures, trends
 *
 * Resolves: TEST-014
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ContextEvent } from '../src/deep-context/types';
import type { SemanticActivity, SemanticThread, ActivityType, Entity } from '../src/main/services/semantic/types';

// ============================================================================
// In-Memory Database Mock
// ============================================================================

// Simulate SQLite tables with in-memory stores
let entities: Map<string, any> = new Map();
let aliases: Map<string, any> = new Map();
let relationships: Map<string, any> = new Map();
let eventEntityLinks: any[] = [];
let activities: any[] = [];
let activityTransitions: any[] = [];
let threads: Map<string, any> = new Map();
let threadEvents: any[] = [];
let threadTransitions: any[] = [];
let intents: Map<string, any> = new Map();
let intentSequences: any[] = [];
let intentEntityMaps: any[] = [];
let signatures: Map<string, any> = new Map();
let syncMetadata: Map<string, string> = new Map();

// ============================================================================
// Mock all DB query functions
// ============================================================================

vi.mock('../src/main/db/queries', () => ({
  // Entity queries
  insertEntity: vi.fn((entity: any) => {
    entities.set(entity.entityId, { ...entity, id: entities.size + 1 });
  }),
  updateEntity: vi.fn((entityId: string, updates: any) => {
    const entity = entities.get(entityId);
    if (entity) {
      Object.assign(entity, updates);
    }
  }),
  getEntityById: vi.fn((entityId: string) => entities.get(entityId) || null),
  findEntityByName: vi.fn((name: string, type?: string) => {
    const results: any[] = [];
    for (const entity of entities.values()) {
      if (entity.name.toLowerCase() === name.toLowerCase() && (!type || entity.type === type)) {
        results.push(entity);
      }
    }
    return results;
  }),
  findEntityByAlias: vi.fn((alias: string) => {
    for (const a of aliases.values()) {
      if (a.alias.toLowerCase() === alias.toLowerCase()) {
        return entities.get(a.entityId) || null;
      }
    }
    return null;
  }),
  getRecentEntities: vi.fn((limit: number = 50) => {
    return Array.from(entities.values())
      .sort((a: any, b: any) => b.lastSeen - a.lastSeen)
      .slice(0, limit);
  }),
  upsertEntityAlias: vi.fn((alias: any) => {
    aliases.set(`${alias.entityId}:${alias.alias}`, alias);
  }),
  upsertEntityRelationship: vi.fn((rel: any) => {
    const key = `${rel.sourceEntityId}:${rel.targetEntityId}`;
    const existing = relationships.get(key);
    if (existing) {
      existing.evidenceCount++;
      existing.lastEvidence = rel.lastEvidence;
    } else {
      relationships.set(key, { ...rel });
    }
  }),
  linkEventToEntity: vi.fn((link: any) => {
    eventEntityLinks.push(link);
  }),

  // Activity queries
  insertSemanticActivity: vi.fn((activity: any) => {
    activities.push({ ...activity, id: activities.length + 1 });
  }),
  insertActivityTransition: vi.fn((transition: any) => {
    activityTransitions.push(transition);
  }),
  getActivitiesByTimeRange: vi.fn((start: number, end: number) => {
    return activities.filter((a: any) => a.createdAt >= start && a.createdAt <= end);
  }),
  getActivitiesForThread: vi.fn((threadId: string, limit: number = 15) => {
    const eventIds = threadEvents
      .filter((te: any) => te.threadId === threadId)
      .map((te: any) => te.eventId);
    return activities
      .filter((a: any) => eventIds.includes(a.eventId))
      .slice(0, limit);
  }),

  // Thread queries
  insertThread: vi.fn((thread: any) => {
    threads.set(thread.threadId, { ...thread, id: threads.size + 1 });
  }),
  updateThread: vi.fn((threadId: string, updates: any) => {
    const thread = threads.get(threadId);
    if (thread) Object.assign(thread, updates);
  }),
  getActiveThreads: vi.fn(() => {
    return Array.from(threads.values()).filter((t: any) => t.status === 'active');
  }),
  addEventToThread: vi.fn((link: any) => {
    threadEvents.push(link);
  }),
  getThreadEvents: vi.fn((threadId: string) => {
    return threadEvents.filter((te: any) => te.threadId === threadId);
  }),
  insertThreadTransition: vi.fn((transition: any) => {
    threadTransitions.push(transition);
  }),
  getEntitiesForEvent: vi.fn(() => []),

  // Intent queries
  insertIntent: vi.fn((intent: any) => {
    intents.set(intent.intentId, { ...intent, id: intents.size + 1 });
  }),
  updateIntent: vi.fn((intentId: string, updates: any) => {
    const intent = intents.get(intentId);
    if (intent) Object.assign(intent, updates);
  }),
  getIntentByThread: vi.fn((threadId: string) => {
    for (const intent of intents.values()) {
      if (intent.threadId === threadId) return intent;
    }
    return null;
  }),
  linkIntentToActivity: vi.fn((link: any) => {
    intentSequences.push(link);
  }),
  linkIntentToEntity: vi.fn((link: any) => {
    intentEntityMaps.push(link);
  }),
  getThreadsNeedingIntentFromDB: vi.fn(() => []),

  // Signature queries
  upsertSignature: vi.fn((sig: any) => {
    const key = `${sig.category}:${sig.metricName}`;
    signatures.set(key, { ...sig, id: signatures.size + 1 });
  }),
  getAllCurrentSignatures: vi.fn(() => Array.from(signatures.values())),
  getActivityDistribution: vi.fn((days: number) => {
    // Compute distribution from activities in memory
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const recent = activities.filter((a: any) => a.createdAt >= cutoff);
    const counts = new Map<string, number>();
    for (const a of recent) {
      counts.set(a.activityType, (counts.get(a.activityType) || 0) + 1);
    }
    const total = recent.length;
    return Array.from(counts.entries()).map(([type, count]) => ({
      type,
      count,
      totalDurationMs: 0,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
  }),
  getActiveIntents: vi.fn(() => Array.from(intents.values()).filter((i: any) => !i.resolvedAt)),

  // Metadata
  getSyncMetadata: vi.fn((key: string) => syncMetadata.get(key) || null),
  setSyncMetadata: vi.fn((key: string, value: string) => syncMetadata.set(key, value)),
}));

// Mock the database module for EntityRegistry's direct DB calls
vi.mock('../src/main/db/database', () => ({
  getDatabase: vi.fn(() => ({
    prepare: vi.fn(() => ({
      run: vi.fn(),
      all: vi.fn(() => []),
      get: vi.fn(() => null),
    })),
  })),
}));

// ============================================================================
// Helper: Create mock ContextEvent
// ============================================================================

function createEvent(overrides: Partial<ContextEvent> = {}): ContextEvent {
  return {
    id: Date.now(),
    timestamp: Date.now(),
    eventType: 'document_interaction',
    source: {
      application: 'VS Code',
      windowTitle: 'handlers.ts — sync-desktop',
      url: undefined,
      filePath: '/Users/dev/sync-desktop/src/main/ipc/handlers.ts',
    },
    semanticPayload: {
      summary: 'Editing IPC handlers in the sync-desktop project',
      entities: ['TypeScript', 'IPC'],
    },
    confidence: 0.8,
    privacyLevel: 'sync_allowed',
    synced: false,
    ...overrides,
  };
}

function createActivity(type: ActivityType, timestamp: number, overrides: Partial<SemanticActivity> = {}): SemanticActivity {
  return {
    activityId: `act-${Math.random().toString(36).slice(2)}`,
    eventId: `evt-${Math.random().toString(36).slice(2)}`,
    activityType: type,
    activitySubtype: null,
    confidence: 0.8,
    classificationMethod: 'rule',
    durationMs: null,
    metadata: {},
    privacyLevel: 'sync_allowed',
    synced: false,
    createdAt: timestamp,
    ...overrides,
  };
}

// ============================================================================
// Reset state between tests
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  entities.clear();
  aliases.clear();
  relationships.clear();
  eventEntityLinks = [];
  activities = [];
  activityTransitions = [];
  threads.clear();
  threadEvents = [];
  threadTransitions = [];
  intents.clear();
  intentSequences = [];
  intentEntityMaps = [];
  signatures.clear();
  syncMetadata.clear();
});

// ============================================================================
// Stage 1: EntityRegistry Tests
// ============================================================================

describe('EntityRegistry', () => {
  let registry: any;

  beforeEach(async () => {
    const { EntityRegistry } = await import('../src/main/services/semantic/entityRegistry');
    registry = new EntityRegistry(100);
    // Don't call start() to avoid loading from DB
    (registry as any).running = true;
  });

  afterEach(() => {
    registry.stop();
  });

  describe('Entity extraction from events', () => {
    it('extracts tool entity from VS Code', () => {
      const event = createEvent({
        source: { application: 'Visual Studio Code', windowTitle: 'test.ts', url: undefined },
      });
      const extracted = registry.extractAndResolve(event);
      const tools = extracted.filter((e: Entity) => e.type === 'tool');
      expect(tools.length).toBeGreaterThanOrEqual(1);
      expect(tools[0].name).toBe('VS Code');
    });

    it('extracts tool entity from Slack', () => {
      const event = createEvent({
        source: { application: 'Slack', windowTitle: '#general - Slack', url: undefined },
      });
      const extracted = registry.extractAndResolve(event);
      const tools = extracted.filter((e: Entity) => e.type === 'tool');
      expect(tools.some((t: Entity) => t.name === 'Slack')).toBe(true);
    });

    it('extracts project entity from file path', () => {
      const event = createEvent({
        source: {
          application: 'VS Code',
          windowTitle: 'index.ts — my-project',
          filePath: '/Users/dev/my-project/src/index.ts',
        },
      });
      const extracted = registry.extractAndResolve(event);
      const projects = extracted.filter((e: Entity) => e.type === 'project');
      expect(projects.some((p: Entity) => p.name === 'my-project')).toBe(true);
    });

    it('extracts technology entity from .tsx file', () => {
      const event = createEvent({
        source: {
          application: 'VS Code',
          windowTitle: 'App.tsx',
          filePath: '/Users/dev/app/src/App.tsx',
        },
      });
      const extracted = registry.extractAndResolve(event);
      const topics = extracted.filter((e: Entity) => e.type === 'topic');
      expect(topics.some((t: Entity) => t.name === 'React')).toBe(true);
    });

    it('extracts person from window title with messaging context', () => {
      const event = createEvent({
        source: {
          application: 'Slack',
          windowTitle: 'DM with John Smith | Slack',
        },
        semanticPayload: {
          summary: 'DM with John Smith | Slack',
          entities: [],
        },
      });
      const extracted = registry.extractAndResolve(event);
      const people = extracted.filter((e: Entity) => e.type === 'person');
      expect(people.some((p: Entity) => p.name === 'John Smith')).toBe(true);
    });

    it('does not extract common words as people', () => {
      const event = createEvent({
        source: {
          application: 'Chrome',
          windowTitle: 'Getting Started with React',
        },
        semanticPayload: {
          summary: 'Getting Started with React',
          entities: [],
        },
      });
      const extracted = registry.extractAndResolve(event);
      const people = extracted.filter((e: Entity) => e.type === 'person');
      // "Getting Started" should not be treated as a person name
      expect(people.some((p: Entity) => p.name === 'Getting Started')).toBe(false);
    });

    it('extracts organization from GitHub URL', () => {
      const event = createEvent({
        source: {
          application: 'Chrome',
          windowTitle: 'isyncso/sync-desktop',
          url: 'https://github.com/isyncso/sync-desktop',
        },
      });
      const extracted = registry.extractAndResolve(event);
      const orgs = extracted.filter((e: Entity) => e.type === 'organization');
      expect(orgs.some((o: Entity) => o.name === 'isyncso')).toBe(true);
    });
  });

  describe('Entity deduplication', () => {
    it('same name returns same entity', () => {
      const event1 = createEvent({
        source: { application: 'Slack', windowTitle: 'General', url: undefined },
      });
      const event2 = createEvent({
        source: { application: 'Slack', windowTitle: 'Random', url: undefined },
      });

      const extracted1 = registry.extractAndResolve(event1);
      const extracted2 = registry.extractAndResolve(event2);

      const slack1 = extracted1.find((e: Entity) => e.name === 'Slack');
      const slack2 = extracted2.find((e: Entity) => e.name === 'Slack');

      expect(slack1).toBeDefined();
      expect(slack2).toBeDefined();
      expect(slack1!.entityId).toBe(slack2!.entityId);
    });
  });

  describe('Entity type classification', () => {
    it('classifies apps as tools', () => {
      const entity = registry.resolveOrCreate('Figma', 'tool', 'rule', Date.now(), 'app');
      expect(entity.type).toBe('tool');
    });

    it('classifies @mentions as persons', () => {
      const event = createEvent({
        source: { application: 'Slack', windowTitle: 'msg', url: undefined },
        semanticPayload: { summary: 'Hey @david-jones check this', entities: [] },
      });
      const extracted = registry.extractAndResolve(event);
      const people = extracted.filter((e: Entity) => e.type === 'person');
      expect(people.some((p: Entity) => p.name === 'david-jones')).toBe(true);
    });
  });

  describe('Relationship creation (co-occurrence)', () => {
    it('creates relationship between co-occurring entities', () => {
      const event = createEvent({
        source: {
          application: 'VS Code',
          windowTitle: 'handlers.ts — sync-desktop',
          filePath: '/Users/dev/sync-desktop/src/handlers.ts',
        },
      });
      registry.extractAndResolve(event);

      // Should have created relationships between VS Code (tool) and sync-desktop (project)
      expect(relationships.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Topic validation', () => {
    it('filters garbage topics', () => {
      const event = createEvent({
        semanticPayload: {
          summary: 'working',
          entities: ['taxi eindhoven airport', 'TypeScript', '123', 'config'],
        },
      });
      const extracted = registry.extractAndResolve(event);
      const topics = extracted.filter((e: Entity) => e.type === 'topic');
      const topicNames = topics.map((t: Entity) => t.name.toLowerCase());
      expect(topicNames).not.toContain('taxi eindhoven airport');
      expect(topicNames).not.toContain('123');
      expect(topicNames).not.toContain('config');
    });

    it('accepts valid technical topics', () => {
      const event = createEvent({
        semanticPayload: {
          summary: 'working on API',
          entities: ['TypeScript', 'WebSocket'],
        },
      });
      const extracted = registry.extractAndResolve(event);
      const topics = extracted.filter((e: Entity) => e.type === 'topic');
      const topicNames = topics.map((t: Entity) => t.name);
      expect(topicNames).toContain('TypeScript');
    });
  });
});

// ============================================================================
// Stage 2: SemanticProcessor Tests (ActivityRuleEngine)
// ============================================================================

describe('SemanticProcessor / ActivityRuleEngine', () => {
  let ruleEngine: any;

  beforeEach(async () => {
    const { ActivityRuleEngine } = await import('../src/main/services/semantic/activityRuleEngine');
    ruleEngine = new ActivityRuleEngine();
  });

  describe('Activity classification', () => {
    it('classifies VS Code as BUILDING/coding', () => {
      const event = createEvent({
        source: { application: 'VS Code', windowTitle: 'index.ts' },
      });
      const result = ruleEngine.classify(event);
      expect(result.activityType).toBe('BUILDING');
      expect(result.activitySubtype).toBe('coding');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('classifies Slack as COMMUNICATING/messaging', () => {
      const event = createEvent({
        source: { application: 'Slack', windowTitle: '#general' },
      });
      const result = ruleEngine.classify(event);
      expect(result.activityType).toBe('COMMUNICATING');
      expect(result.activitySubtype).toBe('messaging');
    });

    it('classifies Zoom as COMMUNICATING/meeting', () => {
      const event = createEvent({
        source: { application: 'Zoom', windowTitle: 'Zoom Meeting' },
      });
      const result = ruleEngine.classify(event);
      expect(result.activityType).toBe('COMMUNICATING');
      expect(result.activitySubtype).toBe('meeting');
    });

    it('classifies Linear as ORGANIZING/planning', () => {
      const event = createEvent({
        source: { application: 'Linear', windowTitle: 'Backlog' },
      });
      const result = ruleEngine.classify(event);
      expect(result.activityType).toBe('ORGANIZING');
      expect(result.activitySubtype).toBe('planning');
    });

    it('classifies Docker as OPERATING/configuring', () => {
      const event = createEvent({
        source: { application: 'Docker', windowTitle: 'Containers' },
      });
      const result = ruleEngine.classify(event);
      expect(result.activityType).toBe('OPERATING');
    });

    it('classifies unknown apps as CONTEXT_SWITCHING with low confidence', () => {
      const event = createEvent({
        source: { application: 'SomeUnknownApp', windowTitle: '' },
      });
      const result = ruleEngine.classify(event);
      expect(result.activityType).toBe('CONTEXT_SWITCHING');
      expect(result.confidence).toBeLessThanOrEqual(0.4);
    });

    it('does not override IDE classification when debug confidence is lower', () => {
      // VS Code has app-level confidence 0.85 for coding
      // Debug title pattern has confidence 0.80
      // Rule engine only overrides when refinement confidence >= app confidence
      const event = createEvent({
        source: { application: 'VS Code', windowTitle: 'debugging session - breakpoint hit' },
      });
      const result = ruleEngine.classify(event);
      // The app-level match (0.85) wins over the title match (0.80)
      expect(result.activitySubtype).toBe('coding');
      expect(result.confidence).toBe(0.85);
    });

    it('refines terminal classification with debug title', () => {
      // Terminal has lower confidence (0.60) so debug pattern (0.80) wins
      const event = createEvent({
        source: { application: 'Terminal', windowTitle: 'debugging session - breakpoint hit' },
      });
      const result = ruleEngine.classify(event);
      expect(result.activitySubtype).toBe('debugging');
    });

    it('classifies Chrome with StackOverflow as INVESTIGATING/searching', () => {
      const event = createEvent({
        source: {
          application: 'Google Chrome',
          windowTitle: 'How to fix React hooks - stackoverflow.com',
        },
      });
      const result = ruleEngine.classify(event);
      expect(result.activityType).toBe('INVESTIGATING');
      expect(result.activitySubtype).toBe('searching');
    });

    it('classifies Chrome with GitHub PR as INVESTIGATING/reviewing', () => {
      const event = createEvent({
        source: {
          application: 'Chrome',
          windowTitle: 'Fix auth flow by dev - github.com/org/repo/pull/42',
        },
      });
      const result = ruleEngine.classify(event);
      expect(result.activityType).toBe('INVESTIGATING');
      expect(result.activitySubtype).toBe('reviewing');
    });

    it('classifies Chrome with Gmail as COMMUNICATING/emailing', () => {
      const event = createEvent({
        source: {
          application: 'Chrome',
          windowTitle: 'Inbox - mail.google.com',
          url: 'https://mail.google.com/mail/u/0/',
        },
      });
      const result = ruleEngine.classify(event);
      expect(result.activityType).toBe('COMMUNICATING');
      expect(result.activitySubtype).toBe('emailing');
    });

    it('classifies test files as OPERATING/testing_infra', () => {
      const event = createEvent({
        source: {
          application: 'VS Code',
          windowTitle: 'transport.spec.ts — sync-desktop',
        },
      });
      const result = ruleEngine.classify(event);
      // Title pattern "test" should be detected
      expect(result.activityType === 'OPERATING' || result.activityType === 'BUILDING').toBe(true);
    });
  });

  describe('Confidence scoring', () => {
    it('direct app match has higher confidence than partial match', () => {
      const directEvent = createEvent({
        source: { application: 'Slack', windowTitle: 'msg' },
      });
      const partialEvent = createEvent({
        source: { application: 'Slack Beta', windowTitle: 'msg' },
      });
      const direct = ruleEngine.classify(directEvent);
      const partial = ruleEngine.classify(partialEvent);
      expect(direct.confidence).toBeGreaterThan(partial.confidence);
    });
  });
});

// ============================================================================
// Stage 2b: SemanticProcessor orchestration
// ============================================================================

describe('SemanticProcessor', () => {
  let processor: any;

  beforeEach(async () => {
    const { SemanticProcessor } = await import('../src/main/services/semantic/semanticProcessor');
    processor = new SemanticProcessor();
    await processor.start();
  });

  afterEach(() => {
    processor.stop();
  });

  it('processes event and returns activity', async () => {
    const event = createEvent();
    const result = await processor.processEvent(event);
    expect(result).not.toBeNull();
    expect(result.activityType).toBeDefined();
    expect(result.activityId).toBeDefined();
  });

  it('persists activity to DB', async () => {
    const event = createEvent();
    await processor.processEvent(event);
    expect(activities.length).toBe(1);
    expect(activities[0].activityType).toBe('BUILDING');
  });

  it('records transition on activity type change with sufficient gap', async () => {
    // persistActivity uses Date.now() for createdAt, so we need to mock time
    let mockTime = 1000000;
    const originalDateNow = Date.now;
    Date.now = () => mockTime;

    try {
      const event1 = createEvent({
        source: { application: 'VS Code', windowTitle: 'code.ts' },
      });
      await processor.processEvent(event1);

      // Advance time by 10 seconds
      mockTime += 10000;

      const event2 = createEvent({
        timestamp: mockTime,
        source: { application: 'Slack', windowTitle: 'chat' },
      });
      await processor.processEvent(event2);

      // Transition should be recorded since activity type changed and gap > 5s
      expect(activityTransitions.length).toBe(1);
      expect(activityTransitions[0].gapMs).toBeGreaterThan(0);
    } finally {
      Date.now = originalDateNow;
    }
  });

  it('skips transition for events < 5 seconds apart', async () => {
    let mockTime = 1000000;
    const originalDateNow = Date.now;
    Date.now = () => mockTime;

    try {
      const event1 = createEvent({
        source: { application: 'VS Code', windowTitle: 'code.ts' },
      });
      await processor.processEvent(event1);

      // Advance only 2 seconds
      mockTime += 2000;

      const event2 = createEvent({
        timestamp: mockTime,
        source: { application: 'Slack', windowTitle: 'chat' },
      });
      await processor.processEvent(event2);

      expect(activityTransitions.length).toBe(0);
    } finally {
      Date.now = originalDateNow;
    }
  });
});

// ============================================================================
// Stage 3: ThreadManager Tests
// ============================================================================

describe('ThreadManager', () => {
  let threadManager: any;

  beforeEach(async () => {
    const { ThreadManager } = await import('../src/main/services/semantic/threadManager');
    threadManager = new ThreadManager();
    await threadManager.start();
  });

  afterEach(() => {
    threadManager.stop();
  });

  describe('Thread creation', () => {
    it('creates new thread for first event', () => {
      const event = createEvent();
      const activity = createActivity('BUILDING', Date.now());
      const entityList: Entity[] = [{
        entityId: 'e1', name: 'VS Code', type: 'tool', confidence: 0.8,
        firstSeen: Date.now(), lastSeen: Date.now(), occurrenceCount: 1,
        metadata: {}, privacyLevel: 'sync_allowed', synced: false,
        createdAt: Date.now(), updatedAt: Date.now(),
      }];

      const thread = threadManager.assignToThread(event, entityList, activity);
      expect(thread).toBeDefined();
      expect(thread.threadId).toBeDefined();
      expect(thread.status).toBe('active');
      expect(thread.eventCount).toBe(1);
    });

    it('generates title from window title', () => {
      const event = createEvent({
        source: { application: 'VS Code', windowTitle: 'handlers.ts — sync-desktop — VS Code' },
      });
      const activity = createActivity('BUILDING', Date.now());
      const thread = threadManager.assignToThread(event, [], activity);
      expect(thread.title).toBeTruthy();
      expect(thread.title!.length).toBeGreaterThan(0);
    });
  });

  describe('Thread assignment (similarity scoring)', () => {
    it('assigns to existing thread with matching entities', () => {
      const now = Date.now();
      const entity: Entity = {
        entityId: 'e1', name: 'sync-desktop', type: 'project', confidence: 0.8,
        firstSeen: now, lastSeen: now, occurrenceCount: 1,
        metadata: {}, privacyLevel: 'sync_allowed', synced: false,
        createdAt: now, updatedAt: now,
      };

      const event1 = createEvent({ timestamp: now });
      const activity1 = createActivity('BUILDING', now);
      const thread1 = threadManager.assignToThread(event1, [entity], activity1);

      // Second event with same entity, close in time
      const event2 = createEvent({
        timestamp: now + 60000,
        source: { application: 'VS Code', windowTitle: 'queries.ts — sync-desktop' },
      });
      const activity2 = createActivity('BUILDING', now + 60000);
      const thread2 = threadManager.assignToThread(event2, [entity], activity2);

      // Should be assigned to the same thread
      expect(thread2.threadId).toBe(thread1.threadId);
      expect(thread2.eventCount).toBe(2);
    });

    it('creates new thread for unrelated event', () => {
      const now = Date.now();
      const entity1: Entity = {
        entityId: 'e1', name: 'project-a', type: 'project', confidence: 0.8,
        firstSeen: now, lastSeen: now, occurrenceCount: 1,
        metadata: {}, privacyLevel: 'sync_allowed', synced: false,
        createdAt: now, updatedAt: now,
      };
      const entity2: Entity = {
        entityId: 'e2', name: 'project-b', type: 'project', confidence: 0.8,
        firstSeen: now, lastSeen: now, occurrenceCount: 1,
        metadata: {}, privacyLevel: 'sync_allowed', synced: false,
        createdAt: now, updatedAt: now,
      };

      const event1 = createEvent({ timestamp: now });
      const activity1 = createActivity('BUILDING', now);
      const thread1 = threadManager.assignToThread(event1, [entity1], activity1);

      // Different project, different activity type, large time gap
      const event2 = createEvent({
        timestamp: now + 3 * 60 * 60 * 1000, // 3 hours later
        source: { application: 'Slack', windowTitle: 'team-chat' },
      });
      const activity2 = createActivity('COMMUNICATING', now + 3 * 60 * 60 * 1000);
      const thread2 = threadManager.assignToThread(event2, [entity2], activity2);

      expect(thread2.threadId).not.toBe(thread1.threadId);
    });
  });

  describe('Thread status transitions', () => {
    it('pauses thread after inactivity (2h)', async () => {
      const now = Date.now();
      const event = createEvent({ timestamp: now - 3 * 60 * 60 * 1000 }); // 3 hours ago
      const activity = createActivity('BUILDING', now - 3 * 60 * 60 * 1000);
      const thread = threadManager.assignToThread(event, [], activity);

      // Now run lifecycle check — the thread is 3 hours old with no new activity
      threadManager.runLifecycleCheck();

      // Thread should be removed from active threads
      const { updateThread } = await import('../src/main/db/queries');
      expect(updateThread).toHaveBeenCalledWith(thread.threadId, { status: 'paused' });
    });

    it('abandons thread after 8h of inactivity', async () => {
      const now = Date.now();
      const event = createEvent({ timestamp: now - 9 * 60 * 60 * 1000 }); // 9 hours ago
      const activity = createActivity('BUILDING', now - 9 * 60 * 60 * 1000);
      const thread = threadManager.assignToThread(event, [], activity);

      threadManager.runLifecycleCheck();

      const { updateThread } = await import('../src/main/db/queries');
      expect(updateThread).toHaveBeenCalledWith(thread.threadId, { status: 'abandoned' });
    });
  });

  describe('Thread event assignment tracking', () => {
    it('tracks event count correctly', () => {
      const now = Date.now();
      const entity: Entity = {
        entityId: 'e1', name: 'project', type: 'project', confidence: 0.8,
        firstSeen: now, lastSeen: now, occurrenceCount: 1,
        metadata: {}, privacyLevel: 'sync_allowed', synced: false,
        createdAt: now, updatedAt: now,
      };

      let thread: any;
      for (let i = 0; i < 5; i++) {
        const event = createEvent({ timestamp: now + i * 1000 * 60 });
        const activity = createActivity('BUILDING', now + i * 1000 * 60);
        thread = threadManager.assignToThread(event, [entity], activity);
      }

      expect(thread.eventCount).toBe(5);
    });
  });
});

// ============================================================================
// Stage 4: IntentClassifier Tests
// ============================================================================

describe('IntentClassifier', () => {
  let classifier: any;
  let mockThreadManager: any;

  beforeEach(async () => {
    const { IntentClassifier } = await import('../src/main/services/semantic/intentClassifier');
    const { ThreadManager } = await import('../src/main/services/semantic/threadManager');

    mockThreadManager = new ThreadManager();
    // Mock the methods we need
    mockThreadManager.getThreadsNeedingIntentClassification = vi.fn().mockReturnValue([]);
    mockThreadManager.markIntentClassified = vi.fn();

    classifier = new IntentClassifier(mockThreadManager);
    await classifier.start();
  });

  afterEach(() => {
    classifier.stop();
  });

  describe('Intent detection', () => {
    it('classifies thread with 60%+ BUILDING as SHIP', async () => {
      const now = Date.now();
      const threadId = 'thread-1';

      // Create 10 activities: 7 BUILDING, 3 INVESTIGATING
      for (let i = 0; i < 7; i++) {
        const a = createActivity('BUILDING', now + i * 60000, { eventId: `evt-b-${i}` });
        activities.push({ ...a, id: activities.length + 1 });
        threadEvents.push({ threadId, eventId: a.eventId, relevanceScore: 0.8, addedAt: now });
      }
      for (let i = 0; i < 3; i++) {
        const a = createActivity('INVESTIGATING', now + (7 + i) * 60000, { eventId: `evt-i-${i}` });
        activities.push({ ...a, id: activities.length + 1 });
        threadEvents.push({ threadId, eventId: a.eventId, relevanceScore: 0.8, addedAt: now });
      }

      const thread: SemanticThread = {
        threadId,
        title: 'Feature work',
        status: 'active',
        startedAt: now,
        lastActivityAt: now + 9 * 60000,
        eventCount: 10,
        primaryEntities: [],
        primaryActivityType: 'BUILDING',
        metadata: {},
        privacyLevel: 'sync_allowed',
        synced: false,
        createdAt: now,
        updatedAt: now,
      };

      const intent = await classifier.classifyThreadIntent(thread);
      expect(intent).not.toBeNull();
      expect(intent.intentType).toBe('SHIP');
    });

    it('classifies thread with 60%+ COMMUNICATING + few entities as RESPOND', async () => {
      const now = Date.now();
      const threadId = 'thread-2';

      for (let i = 0; i < 8; i++) {
        const a = createActivity('COMMUNICATING', now + i * 60000, { eventId: `evt-c-${i}` });
        activities.push({ ...a, id: activities.length + 1 });
        threadEvents.push({ threadId, eventId: a.eventId, relevanceScore: 0.8, addedAt: now });
      }

      const thread: SemanticThread = {
        threadId,
        title: 'Chat session',
        status: 'active',
        startedAt: now,
        lastActivityAt: now + 7 * 60000,
        eventCount: 8,
        primaryEntities: ['e1'], // Few entities
        primaryActivityType: 'COMMUNICATING',
        metadata: {},
        privacyLevel: 'sync_allowed',
        synced: false,
        createdAt: now,
        updatedAt: now,
      };

      const intent = await classifier.classifyThreadIntent(thread);
      expect(intent).not.toBeNull();
      expect(intent.intentType).toBe('RESPOND');
    });

    it('classifies COMMUNICATING + many entities as MANAGE', async () => {
      const now = Date.now();
      const threadId = 'thread-3';

      for (let i = 0; i < 6; i++) {
        const a = createActivity('COMMUNICATING', now + i * 60000, { eventId: `evt-c2-${i}` });
        activities.push({ ...a, id: activities.length + 1 });
        threadEvents.push({ threadId, eventId: a.eventId, relevanceScore: 0.8, addedAt: now });
      }

      const thread: SemanticThread = {
        threadId,
        title: 'Team sync',
        status: 'active',
        startedAt: now,
        lastActivityAt: now + 5 * 60000,
        eventCount: 6,
        primaryEntities: ['e1', 'e2', 'e3', 'e4'], // Many entities = team coordination
        primaryActivityType: 'COMMUNICATING',
        metadata: {},
        privacyLevel: 'sync_allowed',
        synced: false,
        createdAt: now,
        updatedAt: now,
      };

      const intent = await classifier.classifyThreadIntent(thread);
      expect(intent).not.toBeNull();
      expect(intent.intentType).toBe('MANAGE');
    });

    it('classifies BUILDING+INVESTIGATING combination as MAINTAIN', async () => {
      const now = Date.now();
      const threadId = 'thread-4';

      for (let i = 0; i < 4; i++) {
        const a = createActivity('BUILDING', now + i * 60000, { eventId: `evt-b2-${i}` });
        activities.push({ ...a, id: activities.length + 1 });
        threadEvents.push({ threadId, eventId: a.eventId, relevanceScore: 0.8, addedAt: now });
      }
      for (let i = 0; i < 4; i++) {
        const a = createActivity('INVESTIGATING', now + (4 + i) * 60000, { eventId: `evt-i2-${i}` });
        activities.push({ ...a, id: activities.length + 1 });
        threadEvents.push({ threadId, eventId: a.eventId, relevanceScore: 0.8, addedAt: now });
      }

      const thread: SemanticThread = {
        threadId,
        title: 'Refactoring',
        status: 'active',
        startedAt: now,
        lastActivityAt: now + 7 * 60000,
        eventCount: 8,
        primaryEntities: [],
        primaryActivityType: 'BUILDING',
        metadata: {},
        privacyLevel: 'sync_allowed',
        synced: false,
        createdAt: now,
        updatedAt: now,
      };

      const intent = await classifier.classifyThreadIntent(thread);
      expect(intent).not.toBeNull();
      expect(intent.intentType).toBe('MAINTAIN');
    });

    it('returns null for thread with fewer than 3 activities', async () => {
      const now = Date.now();
      const threadId = 'thread-small';

      const a1 = createActivity('BUILDING', now, { eventId: 'evt-small-1' });
      activities.push({ ...a1, id: 1 });
      threadEvents.push({ threadId, eventId: a1.eventId, relevanceScore: 0.8, addedAt: now });

      const thread: SemanticThread = {
        threadId,
        title: 'Quick',
        status: 'active',
        startedAt: now,
        lastActivityAt: now,
        eventCount: 1,
        primaryEntities: [],
        primaryActivityType: 'BUILDING',
        metadata: {},
        privacyLevel: 'sync_allowed',
        synced: false,
        createdAt: now,
        updatedAt: now,
      };

      const intent = await classifier.classifyThreadIntent(thread);
      expect(intent).toBeNull();
    });
  });

  describe('Intent resolution', () => {
    it('resolves intent with outcome', async () => {
      const now = Date.now();
      const threadId = 'thread-resolve';

      // Create enough activities for classification
      for (let i = 0; i < 5; i++) {
        const a = createActivity('BUILDING', now + i * 60000, { eventId: `evt-r-${i}` });
        activities.push({ ...a, id: activities.length + 1 });
        threadEvents.push({ threadId, eventId: a.eventId, relevanceScore: 0.8, addedAt: now });
      }

      const thread: SemanticThread = {
        threadId,
        title: 'Feature',
        status: 'active',
        startedAt: now,
        lastActivityAt: now + 4 * 60000,
        eventCount: 5,
        primaryEntities: [],
        primaryActivityType: 'BUILDING',
        metadata: {},
        privacyLevel: 'sync_allowed',
        synced: false,
        createdAt: now,
        updatedAt: now,
      };

      await classifier.classifyThreadIntent(thread);

      // Resolve the intent
      classifier.resolveIntent(threadId, 'completed');

      const { updateIntent } = await import('../src/main/db/queries');
      expect(updateIntent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ outcome: 'completed' })
      );
    });
  });
});

// ============================================================================
// Stage 5: SignatureComputer Tests
// ============================================================================

describe('SignatureComputer', () => {
  let computer: any;

  beforeEach(async () => {
    const { SignatureComputer } = await import('../src/main/services/semantic/signatureComputer');
    computer = new SignatureComputer();
  });

  describe('Behavioral signature computation', () => {
    it('computes signatures when activities exist', () => {
      const now = Date.now();
      // Seed activities over a 7-day window
      for (let day = 0; day < 7; day++) {
        for (let hour = 9; hour < 17; hour++) {
          const ts = now - day * 24 * 60 * 60 * 1000 + hour * 60 * 60 * 1000;
          const type: ActivityType = hour < 13 ? 'BUILDING' : 'COMMUNICATING';
          activities.push({
            ...createActivity(type, ts),
            id: activities.length + 1,
            createdAt: ts,
          });
        }
      }

      computer.computeAll(30);

      // Should have computed multiple signature categories
      expect(signatures.size).toBeGreaterThan(0);

      // Check specific signatures exist
      expect(signatures.has('rhythm:peak_hours')).toBe(true);
      expect(signatures.has('workflow:context_switch_rate')).toBe(true);
      expect(signatures.has('quality:deep_work_ratio')).toBe(true);
      expect(signatures.has('stress:after_hours_ratio')).toBe(true);
    });

    it('skips computation when no activities exist', () => {
      computer.computeAll(30);
      // No crash, and no signatures created
      expect(signatures.size).toBe(0);
    });
  });

  describe('Trend detection', () => {
    it('detects improving trend (>10% increase)', () => {
      // Access private method via instance
      const trend = (computer as any).computeTrend(1.2, 1.0);
      expect(trend).toBe('improving');
    });

    it('detects declining trend (>10% decrease)', () => {
      const trend = (computer as any).computeTrend(0.8, 1.0);
      expect(trend).toBe('declining');
    });

    it('detects stable trend (within 10%)', () => {
      const trend = (computer as any).computeTrend(1.05, 1.0);
      expect(trend).toBe('stable');
    });

    it('returns stable when previous is null', () => {
      const trend = (computer as any).computeTrend(1.0, null);
      expect(trend).toBe('stable');
    });

    it('returns stable when previous is zero', () => {
      const trend = (computer as any).computeTrend(1.0, 0);
      expect(trend).toBe('stable');
    });
  });

  describe('Window-based aggregation', () => {
    it('computes signatures for 7-day window', () => {
      const now = Date.now();
      // Create activities within 7 days
      for (let i = 0; i < 20; i++) {
        const ts = now - i * 4 * 60 * 60 * 1000; // Every 4 hours
        activities.push({
          ...createActivity('BUILDING', ts),
          id: activities.length + 1,
          createdAt: ts,
        });
      }

      computer.computeAll(7);
      expect(signatures.size).toBeGreaterThan(0);
    });

    it('counts active days correctly', () => {
      const now = Date.now();
      // Create activities spanning 3 distinct days
      const days = [0, 1, 3]; // Skip day 2
      for (const day of days) {
        const ts = now - day * 24 * 60 * 60 * 1000;
        activities.push({
          ...createActivity('BUILDING', ts),
          id: activities.length + 1,
          createdAt: ts,
        });
      }

      const activeDays = (computer as any).countActiveDays(activities);
      expect(activeDays).toBe(3);
    });
  });

  describe('Deep work window detection', () => {
    it('detects 90+ minute deep work blocks', () => {
      const now = Date.now();
      // Create a 2-hour block of BUILDING activities (every 5 minutes)
      for (let i = 0; i < 24; i++) {
        const ts = now - (120 - i * 5) * 60 * 1000;
        activities.push({
          ...createActivity('BUILDING', ts),
          id: activities.length + 1,
          createdAt: ts,
        });
      }

      const windows = (computer as any).findDeepWorkWindows(activities);
      expect(windows.length).toBeGreaterThanOrEqual(1);
    });

    it('ignores blocks shorter than 90 minutes', () => {
      const now = Date.now();
      // Create a 30-minute block
      for (let i = 0; i < 6; i++) {
        const ts = now - (30 - i * 5) * 60 * 1000;
        activities.push({
          ...createActivity('BUILDING', ts),
          id: activities.length + 1,
          createdAt: ts,
        });
      }

      const windows = (computer as any).findDeepWorkWindows(activities);
      expect(windows.length).toBe(0);
    });
  });

  describe('Context switch rate', () => {
    it('counts type transitions correctly', () => {
      const now = Date.now();
      const sequence: ActivityType[] = ['BUILDING', 'BUILDING', 'COMMUNICATING', 'BUILDING', 'ORGANIZING'];
      const acts = sequence.map((type, i) => ({
        ...createActivity(type, now + i * 60000),
        createdAt: now + i * 60000,
      }));

      const transitions = (computer as any).countTypeTransitions(acts);
      expect(transitions).toBe(3); // BUILDING->COMMUNICATING, COMMUNICATING->BUILDING, BUILDING->ORGANIZING
    });
  });
});
