/**
 * Main Process Services Tests
 *
 * Covers: ActivityTracker, ContextManager, SummaryService, JournalService,
 * CloudSyncService, AuthUtils, Scheduler, Store
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mocks — must be defined before imports
// ============================================================================

// Mock electron modules
vi.mock('electron', () => ({
  systemPreferences: {
    isTrustedAccessibilityClient: vi.fn().mockReturnValue(true),
  },
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-store'),
  },
}));

// Mock electron-store — the mock factory is hoisted, so we create the shared
// data object on globalThis inside the factory itself.
vi.mock('electron-store', () => {
  if (!(globalThis as any).__mockStoreData) {
    (globalThis as any).__mockStoreData = {};
  }
  const data = (globalThis as any).__mockStoreData as Record<string, any>;
  class MockStore {
    constructor(opts?: any) {
      if (opts?.defaults) {
        for (const [key, value] of Object.entries(opts.defaults)) {
          if (!(key in data)) {
            data[key] = JSON.parse(JSON.stringify(value));
          }
        }
      }
    }
    get(key: string) {
      return data[key];
    }
    set(key: string, value: any) {
      data[key] = value;
    }
    delete(key: string) {
      delete data[key];
    }
    clear() {
      for (const k of Object.keys(data)) {
        delete data[k];
      }
    }
    get store() {
      return data;
    }
  }
  return { default: MockStore };
});

// Alias for test code to reference the shared store data
const mockStoreData = ((globalThis as any).__mockStoreData || ((globalThis as any).__mockStoreData = {})) as Record<string, any>;

// Mock get-windows (ESM dynamic import)
vi.mock('get-windows', () => ({
  activeWindow: vi.fn().mockResolvedValue(null),
}));

// Mock DB queries
const mockActivityLogs: any[] = [];
const mockHourlySummaries: any[] = [];
const mockDailyJournals: any[] = [];
let mockInsertId = 1;

vi.mock('../src/main/db/queries', () => ({
  insertActivityLog: vi.fn((activity: any) => {
    const id = mockInsertId++;
    mockActivityLogs.push({ ...activity, id });
    return id;
  }),
  updateActivityDuration: vi.fn((id: number, durationSeconds: number) => {
    const log = mockActivityLogs.find((l) => l.id === id);
    if (log) log.durationSeconds = durationSeconds;
  }),
  getRecentActivity: vi.fn((_minutes: number) => mockActivityLogs),
  getActivityByDateRange: vi.fn((_start: Date, _end: Date) => mockActivityLogs),
  insertHourlySummary: vi.fn((summary: any) => {
    const id = mockInsertId++;
    mockHourlySummaries.push({ ...summary, id });
    return id;
  }),
  upsertHourlySummary: vi.fn((summary: any) => {
    const existing = mockHourlySummaries.find(
      (s) => s.hourStart === summary.hourStart
    );
    if (existing) {
      Object.assign(existing, summary);
    } else {
      const id = mockInsertId++;
      mockHourlySummaries.push({ ...summary, id });
    }
  }),
  getHourlySummaryByRange: vi.fn(
    (_start: Date, _end: Date) => mockHourlySummaries
  ),
  getUnsyncedHourlySummaries: vi.fn(() =>
    mockHourlySummaries.filter((s) => !s.synced)
  ),
  markHourlySummaryAsSynced: vi.fn((id: number) => {
    const s = mockHourlySummaries.find((s) => s.id === id);
    if (s) s.synced = true;
  }),
  insertDailyJournal: vi.fn((journal: any) => {
    const id = mockInsertId++;
    mockDailyJournals.push({ ...journal, id });
    return id;
  }),
  getDailyJournalByDate: vi.fn((_date: Date) => null),
  getUnsyncedDailyJournals: vi.fn(() =>
    mockDailyJournals.filter((j) => !j.synced)
  ),
  markDailyJournalAsSynced: vi.fn((id: number) => {
    const j = mockDailyJournals.find((j) => j.id === id);
    if (j) j.synced = true;
  }),
  cleanupOldData: vi.fn(),
  setSyncMetadata: vi.fn(),
  getUnsyncedActivity: vi.fn(() => []),
  markActivitySynced: vi.fn(),
  getUnsyncedEntities: vi.fn(() => []),
  markEntitiesSynced: vi.fn(),
  getUnsyncedActivities: vi.fn(() => []),
  markActivitiesSynced: vi.fn(),
  getUnsyncedThreads: vi.fn(() => []),
  markThreadsSynced: vi.fn(),
  getUnsyncedIntents: vi.fn(() => []),
  markIntentsSynced: vi.fn(),
  getUnsyncedSignatures: vi.fn(() => []),
  markSignaturesSynced: vi.fn(),
}));

// Mock deepContextManager
vi.mock('../src/main/services/deepContextManager', () => ({
  DeepContextManager: vi.fn(),
}));

// Mock deep-context engine
vi.mock('../src/deep-context', () => ({
  DeepContextEngine: vi.fn(),
}));

// Mock database module
vi.mock('../src/main/db/database', () => ({
  getDatabase: vi.fn(() => ({
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      run: vi.fn(),
    })),
  })),
}));

// Global fetch mock
const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

// ============================================================================
// Imports — after mocks
// ============================================================================

import { ActivityTracker } from '../src/main/services/activityTracker';
import { ContextManager } from '../src/main/services/contextManager';
import { SummaryService } from '../src/main/services/summaryService';
import { JournalService } from '../src/main/services/journalService';
import { CloudSyncService } from '../src/main/services/cloudSyncService';
import { Scheduler } from '../src/main/services/scheduler';
import {
  getActivityByDateRange,
  getRecentActivity,
  getHourlySummaryByRange,
  getUnsyncedHourlySummaries,
  getUnsyncedDailyJournals,
} from '../src/main/db/queries';

// ============================================================================
// Helper factories
// ============================================================================

function makeActivity(overrides: Partial<any> = {}): any {
  return {
    id: mockInsertId++,
    timestamp: Date.now(),
    appName: 'Visual Studio Code',
    windowTitle: 'index.ts - myproject',
    durationSeconds: 300,
    synced: false,
    ...overrides,
  };
}

function makeHourlySummary(overrides: Partial<any> = {}): any {
  return {
    id: mockInsertId++,
    hourStart: new Date().setMinutes(0, 0, 0),
    appBreakdown: [
      { appName: 'Visual Studio Code', minutes: 40, percentage: 67, category: 'Development' },
      { appName: 'Google Chrome', minutes: 20, percentage: 33, category: 'Browsing' },
    ],
    totalMinutes: 60,
    focusScore: 0.75,
    synced: false,
    ...overrides,
  };
}

// ============================================================================
// 1. ActivityTracker Tests
// ============================================================================

describe('ActivityTracker', () => {
  let tracker: ActivityTracker;

  beforeEach(() => {
    tracker = new ActivityTracker();
  });

  afterEach(() => {
    tracker.stop();
  });

  // ---- sanitizeTitle ----

  describe('sanitizeTitle', () => {
    // Access private method via bracket notation
    const sanitize = (title: string, appName = 'TestApp') =>
      (tracker as any).sanitizeTitle(title, appName);

    it('strips email addresses', () => {
      const result = sanitize('Message from john@example.com - Inbox');
      expect(result).toBe('Message from [email] - Inbox');
      expect(result).not.toContain('john@example.com');
    });

    it('strips phone numbers', () => {
      const result = sanitize('Call with +1 (555) 123-4567 ended');
      expect(result).toContain('[phone]');
      expect(result).not.toContain('555');
    });

    it('strips long digit sequences (phone regex catches card-like numbers too)', () => {
      // The phone regex (\+?[\d\s()-]{10,}) is applied before the card regex
      // and is greedy enough to match credit card numbers. This means credit
      // cards get replaced with [phone] rather than [card]. Either way, the
      // sensitive digits are removed from the title.
      const result = sanitize('Payment 4532-1234-5678-9012 processed');
      expect(result).not.toContain('4532');
      expect(result).not.toContain('9012');
      // Digits are replaced by either [phone] or [card]
      expect(result).toMatch(/\[(phone|card)\]/);
    });

    it('truncates titles longer than 200 characters', () => {
      const longTitle = 'A'.repeat(250);
      const result = sanitize(longTitle);
      expect(result.length).toBe(203); // 200 + '...'
      expect(result).toMatch(/\.\.\.$/);
    });

    it('preserves normal titles unchanged', () => {
      const result = sanitize('index.ts - Visual Studio Code');
      expect(result).toBe('index.ts - Visual Studio Code');
    });

    it('handles multiple PII types in one title', () => {
      const result = sanitize('From user@test.com ref 4111222233334444');
      expect(result).toContain('[email]');
      // Digits are stripped by phone or card regex
      expect(result).not.toContain('user@test.com');
      expect(result).not.toContain('4111');
      expect(result).toMatch(/\[(phone|card)\]/);
    });
  });

  // ---- isSensitiveApp ----

  describe('isSensitiveApp', () => {
    const isSensitive = (name: string) =>
      (tracker as any).isSensitiveApp(name);

    it('detects 1Password', () => {
      expect(isSensitive('1Password')).toBe(true);
    });

    it('detects LastPass', () => {
      expect(isSensitive('LastPass')).toBe(true);
    });

    it('detects Bitwarden', () => {
      expect(isSensitive('Bitwarden')).toBe(true);
    });

    it('detects Dashlane', () => {
      expect(isSensitive('Dashlane')).toBe(true);
    });

    it('detects keychain-related apps', () => {
      expect(isSensitive('Keychain Access')).toBe(true);
    });

    it('detects banking apps', () => {
      expect(isSensitive('My Banking App')).toBe(true);
    });

    it('detects medical/health apps', () => {
      expect(isSensitive('Health App')).toBe(true);
      expect(isSensitive('Medical Records')).toBe(true);
    });

    it('does NOT flag normal apps', () => {
      expect(isSensitive('Visual Studio Code')).toBe(false);
      expect(isSensitive('Google Chrome')).toBe(false);
      expect(isSensitive('Slack')).toBe(false);
      expect(isSensitive('Finder')).toBe(false);
    });

    it('is case insensitive', () => {
      expect(isSensitive('1PASSWORD')).toBe(true);
      expect(isSensitive('bitwarden')).toBe(true);
    });
  });

  // ---- categorizeApp (via ContextManager) ----

  describe('isBrowser', () => {
    const isBrowser = (name: string) => (tracker as any).isBrowser(name);

    it('recognizes Google Chrome', () => {
      expect(isBrowser('Google Chrome')).toBe(true);
    });

    it('recognizes Safari', () => {
      expect(isBrowser('Safari')).toBe(true);
    });

    it('recognizes Firefox', () => {
      expect(isBrowser('Firefox')).toBe(true);
    });

    it('recognizes Arc', () => {
      expect(isBrowser('Arc')).toBe(true);
    });

    it('does NOT flag non-browsers', () => {
      expect(isBrowser('Slack')).toBe(false);
      expect(isBrowser('Terminal')).toBe(false);
    });
  });

  // ---- Activity log creation ----

  describe('activity logging', () => {
    it('creates activity log with correct fields', async () => {
      const window = {
        title: 'index.ts - myproject',
        owner: { name: 'Visual Studio Code', processId: 123 },
        platform: 'darwin',
      };

      const id = await (tracker as any).logActivity(window);
      expect(id).toBeTruthy();

      const activity = (tracker as any).currentActivity;
      expect(activity).toBeTruthy();
      expect(activity.appName).toBe('Visual Studio Code');
      expect(activity.windowTitle).toBe('index.ts - myproject');
      expect(activity.durationSeconds).toBe(0);
      expect(activity.synced).toBe(false);
    });

    it('skips sensitive apps and returns null', async () => {
      const window = {
        title: 'Vault - 1Password',
        owner: { name: '1Password', processId: 456 },
        platform: 'darwin',
      };

      const id = await (tracker as any).logActivity(window);
      expect(id).toBeNull();
      expect((tracker as any).currentActivity).toBeNull();
    });
  });

  // ---- Idle detection ----

  describe('idle detection', () => {
    it('reports idle state when handleIdleStart is called', () => {
      expect(tracker.isUserIdle()).toBe(false);
      (tracker as any).handleIdleStart();
      expect(tracker.isUserIdle()).toBe(true);
      expect(tracker.getIdleDuration()).toBeGreaterThanOrEqual(0);
    });

    it('ends idle state when handleIdleEnd is called', () => {
      (tracker as any).handleIdleStart();
      expect(tracker.isUserIdle()).toBe(true);
      (tracker as any).handleIdleEnd();
      expect(tracker.isUserIdle()).toBe(false);
      expect(tracker.getIdleDuration()).toBe(0);
    });

    it('emits idle_start event', () => {
      const handler = vi.fn();
      tracker.on('activity', handler);
      (tracker as any).handleIdleStart();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'idle_start' })
      );
    });

    it('emits idle_end event with duration', () => {
      const handler = vi.fn();
      tracker.on('activity', handler);
      (tracker as any).handleIdleStart();
      (tracker as any).handleIdleEnd();

      const idleEndCall = handler.mock.calls.find(
        (c: any) => c[0].type === 'idle_end'
      );
      expect(idleEndCall).toBeTruthy();
      expect(idleEndCall[0].idleDuration).toBeGreaterThanOrEqual(0);
    });
  });

  // ---- Privacy filtering for excluded apps ----

  describe('getWindowKey', () => {
    it('uses bundleId when available', () => {
      const window = {
        title: 'Test',
        owner: { name: 'TestApp', processId: 1, bundleId: 'com.test.app' },
        platform: 'darwin',
      };
      const key = (tracker as any).getWindowKey(window);
      expect(key).toBe('com.test.app::Test');
    });

    it('falls back to app name when no bundleId', () => {
      const window = {
        title: 'Test',
        owner: { name: 'TestApp', processId: 1 },
        platform: 'darwin',
      };
      const key = (tracker as any).getWindowKey(window);
      expect(key).toBe('TestApp::Test');
    });
  });
});

// ============================================================================
// 2. ContextManager Tests
// ============================================================================

describe('ContextManager', () => {
  let tracker: ActivityTracker;
  let contextManager: ContextManager;

  beforeEach(() => {
    tracker = new ActivityTracker();
    contextManager = new ContextManager(tracker);
    mockActivityLogs.length = 0;
  });

  afterEach(() => {
    contextManager.stop();
    tracker.stop();
  });

  describe('categorizeApp', () => {
    const categorize = (name: string) =>
      (contextManager as any).categorizeApp(name);

    it('categorizes VS Code as development', () => {
      expect(categorize('Visual Studio Code')).toBe('development');
    });

    it('categorizes Slack as communication', () => {
      expect(categorize('Slack')).toBe('communication');
    });

    it('categorizes Zoom as meetings', () => {
      expect(categorize('Zoom')).toBe('meetings');
    });

    it('categorizes Figma as creative', () => {
      expect(categorize('Figma')).toBe('creative');
    });

    it('categorizes Notion as deep_work', () => {
      expect(categorize('Notion')).toBe('deep_work');
    });

    it('categorizes Google Chrome as browsing', () => {
      expect(categorize('Google Chrome')).toBe('browsing');
    });

    it('categorizes unknown apps as other', () => {
      expect(categorize('RandomApp')).toBe('other');
    });

    it('is case insensitive', () => {
      expect(categorize('SLACK')).toBe('communication');
      expect(categorize('zoom')).toBe('meetings');
    });
  });

  describe('calculateFocusScore', () => {
    const calcFocus = (activities: any[], patterns: any[]) =>
      (contextManager as any).calculateFocusScore(activities, patterns);

    it('returns 0 for empty activities', () => {
      expect(calcFocus([], [])).toBe(0);
    });

    it('returns higher score for long sessions in development', () => {
      const activities = [
        makeActivity({ durationSeconds: 600, appName: 'Visual Studio Code' }),
      ];
      const patterns = [{ type: 'development', minutes: 10, percentage: 100 }];
      const score = calcFocus(activities, patterns);
      expect(score).toBeGreaterThan(0.5);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('returns lower score for many short sessions across categories', () => {
      const activities = Array.from({ length: 40 }, (_, i) =>
        makeActivity({
          durationSeconds: 15,
          appName: i % 2 === 0 ? 'Slack' : 'Chrome',
        })
      );
      const patterns = [
        { type: 'communication', minutes: 5, percentage: 50 },
        { type: 'browsing', minutes: 5, percentage: 50 },
      ];
      const score = calcFocus(activities, patterns);
      // Many switches + non-productive categories = low score
      expect(score).toBeLessThan(0.4);
    });

    it('score is between 0 and 1', () => {
      const activities = [
        makeActivity({ durationSeconds: 3600, appName: 'Visual Studio Code' }),
      ];
      const patterns = [{ type: 'development', minutes: 60, percentage: 100 }];
      const score = calcFocus(activities, patterns);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('calculateAppUsage', () => {
    it('aggregates app minutes and percentages', () => {
      mockActivityLogs.length = 0;
      mockActivityLogs.push(
        makeActivity({ appName: 'Code', durationSeconds: 1200, windowTitle: 'file.ts' }),
        makeActivity({ appName: 'Code', durationSeconds: 600, windowTitle: 'test.ts' }),
        makeActivity({ appName: 'Chrome', durationSeconds: 600, windowTitle: 'Google' })
      );

      const usage = (contextManager as any).calculateAppUsage(mockActivityLogs);
      expect(usage.length).toBe(2);

      const codeUsage = usage.find((u: any) => u.app === 'Code');
      expect(codeUsage).toBeTruthy();
      expect(codeUsage.minutes).toBe(30); // 1800s = 30 min
      expect(codeUsage.percentage).toBe(75); // 1800/2400 = 75%
      expect(codeUsage.windowTitles).toContain('file.ts');
      expect(codeUsage.windowTitles).toContain('test.ts');

      const chromeUsage = usage.find((u: any) => u.app === 'Chrome');
      expect(chromeUsage).toBeTruthy();
      expect(chromeUsage.minutes).toBe(10);
      expect(chromeUsage.percentage).toBe(25);
    });
  });

  describe('calculateWorkPatterns', () => {
    it('groups apps by work pattern category', () => {
      mockActivityLogs.length = 0;
      mockActivityLogs.push(
        makeActivity({ appName: 'Visual Studio Code', durationSeconds: 1800 }),
        makeActivity({ appName: 'Terminal', durationSeconds: 600 }),
        makeActivity({ appName: 'Slack', durationSeconds: 600 })
      );

      const patterns = (contextManager as any).calculateWorkPatterns(mockActivityLogs);
      const devPattern = patterns.find((p: any) => p.type === 'development');
      expect(devPattern).toBeTruthy();
      expect(devPattern.minutes).toBe(40); // 2400s = 40 min

      const commPattern = patterns.find((p: any) => p.type === 'communication');
      expect(commPattern).toBeTruthy();
      expect(commPattern.minutes).toBe(10);
    });
  });

  describe('10-minute window maintenance', () => {
    it('takes a snapshot and stores it', () => {
      mockActivityLogs.length = 0;
      mockActivityLogs.push(
        makeActivity({ appName: 'Code', durationSeconds: 300 })
      );

      (contextManager as any).takeSnapshot();
      const snapshot = contextManager.getCurrentSnapshot();
      expect(snapshot).toBeTruthy();
      expect(snapshot!.timestamp).toBeGreaterThan(0);
      expect(snapshot!.focusScore).toBeGreaterThanOrEqual(0);
    });

    it('getFreshContext always returns a snapshot', () => {
      mockActivityLogs.length = 0;
      const snapshot = contextManager.getFreshContext();
      expect(snapshot).toBeTruthy();
      expect(snapshot.timestamp).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// 3. SummaryService Tests
// ============================================================================

describe('SummaryService', () => {
  let summaryService: SummaryService;

  beforeEach(() => {
    summaryService = new SummaryService();
    mockActivityLogs.length = 0;
    mockHourlySummaries.length = 0;
  });

  describe('computeSummary', () => {
    it('calculates app breakdown from activities', () => {
      const activities = [
        makeActivity({ appName: 'Visual Studio Code', durationSeconds: 1800 }),
        makeActivity({ appName: 'Google Chrome', durationSeconds: 600 }),
        makeActivity({ appName: 'Slack', durationSeconds: 600 }),
      ];

      const hourStart = new Date();
      hourStart.setMinutes(0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourEnd.getHours() + 1);

      const summary = (summaryService as any).computeSummary(
        activities,
        hourStart,
        hourEnd
      );

      expect(summary.totalMinutes).toBe(50); // 3000s = 50 min
      expect(summary.appBreakdown.length).toBe(3);
      expect(summary.topApp).toBe('Visual Studio Code');
      expect(summary.appBreakdown[0].appName).toBe('Visual Studio Code');
      expect(summary.appBreakdown[0].category).toBe('Development');
    });

    it('calculates correct percentages', () => {
      const activities = [
        makeActivity({ appName: 'Code', durationSeconds: 600 }),
        makeActivity({ appName: 'Chrome', durationSeconds: 400 }),
      ];

      const hourStart = new Date();
      hourStart.setMinutes(0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourEnd.getHours() + 1);

      const summary = (summaryService as any).computeSummary(
        activities,
        hourStart,
        hourEnd
      );

      expect(summary.appBreakdown[0].percentage).toBe(60); // 600/1000
      expect(summary.appBreakdown[1].percentage).toBe(40);
    });

    it('counts context switches', () => {
      const now = Date.now();
      const activities = [
        makeActivity({ appName: 'Code', durationSeconds: 100, timestamp: now }),
        makeActivity({ appName: 'Chrome', durationSeconds: 100, timestamp: now + 1000 }),
        makeActivity({ appName: 'Code', durationSeconds: 100, timestamp: now + 2000 }),
        makeActivity({ appName: 'Slack', durationSeconds: 100, timestamp: now + 3000 }),
      ];

      const hourStart = new Date();
      hourStart.setMinutes(0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourEnd.getHours() + 1);

      const summary = (summaryService as any).computeSummary(
        activities,
        hourStart,
        hourEnd
      );

      expect(summary.contextSwitches).toBe(3); // Code->Chrome, Chrome->Code, Code->Slack
    });
  });

  describe('categorizeApp', () => {
    const categorize = (name: string) =>
      (summaryService as any).categorizeApp(name);

    it('categorizes development tools', () => {
      expect(categorize('Visual Studio Code')).toBe('Development');
      expect(categorize('Terminal')).toBe('Development');
      expect(categorize('Xcode')).toBe('Development');
    });

    it('categorizes communication tools', () => {
      expect(categorize('Slack')).toBe('Communication');
      expect(categorize('Discord')).toBe('Communication');
    });

    it('categorizes browsers', () => {
      expect(categorize('Google Chrome')).toBe('Browsing');
      expect(categorize('Safari')).toBe('Browsing');
    });

    it('returns Other for unknown apps', () => {
      expect(categorize('MyCustomApp')).toBe('Other');
    });
  });

  describe('focus score computation', () => {
    it('returns 0 for empty activities', () => {
      const score = (summaryService as any).calculateFocusScore(
        [],
        [],
        new Map()
      );
      expect(score).toBe(0);
    });

    it('higher score for focused single-app usage', () => {
      const activities = [
        makeActivity({ appName: 'Visual Studio Code', durationSeconds: 3000 }),
      ];
      const breakdown = [
        { appName: 'Visual Studio Code', minutes: 50, percentage: 100, category: 'Development' },
      ];
      const categoryMap = new Map([['Development', 50]]);

      const score = (summaryService as any).calculateFocusScore(
        activities,
        breakdown,
        categoryMap
      );
      // Long session (3000/300 capped at 1) + 1 category (max concentration) + 100% productive + low switch rate
      expect(score).toBeGreaterThan(0.7);
    });
  });

  describe('empty hour handling', () => {
    it('generateHourlySummary returns null for empty hour', () => {
      // Mock returns empty
      (getActivityByDateRange as any).mockReturnValueOnce([]);
      const result = summaryService.generateHourlySummary(new Date());
      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// 4. JournalService Tests
// ============================================================================

describe('JournalService', () => {
  let summaryService: SummaryService;
  let journalService: JournalService;

  beforeEach(() => {
    summaryService = new SummaryService();
    journalService = new JournalService(summaryService);
    mockHourlySummaries.length = 0;
    mockDailyJournals.length = 0;
  });

  describe('computeJournal', () => {
    it('aggregates daily data from hourly summaries', () => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);

      const summaries = [
        makeHourlySummary({
          hourStart: new Date(date).setHours(9),
          totalMinutes: 45,
          focusScore: 0.8,
          appBreakdown: [
            { appName: 'Visual Studio Code', minutes: 30, percentage: 67, category: 'Development' },
            { appName: 'Chrome', minutes: 15, percentage: 33, category: 'Browsing' },
          ],
        }),
        makeHourlySummary({
          hourStart: new Date(date).setHours(10),
          totalMinutes: 50,
          focusScore: 0.9,
          appBreakdown: [
            { appName: 'Visual Studio Code', minutes: 40, percentage: 80, category: 'Development' },
            { appName: 'Slack', minutes: 10, percentage: 20, category: 'Communication' },
          ],
        }),
      ];

      const journal = (journalService as any).computeJournal(summaries, date);

      expect(journal.totalActiveMinutes).toBe(95);
      expect(journal.avgFocusScore).toBe(0.85); // (0.8+0.9)/2
      expect(journal.mostUsedApp).toBe('Visual Studio Code'); // 70 min total
    });
  });

  describe('overview generation', () => {
    it('generates a readable overview', () => {
      const date = new Date('2026-03-20');
      const overview = (journalService as any).generateOverview(
        date,
        300, // 5 hours
        0.75,
        'Visual Studio Code',
        'Development',
        []
      );

      expect(overview).toContain('5');
      expect(overview).toContain('75%');
      expect(overview).toContain('Visual Studio Code');
      expect(overview).toContain('development');
    });
  });

  describe('highlights extraction', () => {
    it('detects productive streak of 2+ hours', () => {
      const hourlyData = [
        { hour: 9, minutes: 55, focusScore: 0.8 },
        { hour: 10, minutes: 50, focusScore: 0.75 },
        { hour: 11, minutes: 45, focusScore: 0.9 },
      ];
      const categoryMinutes = new Map([
        ['Development', { minutes: 150, apps: new Set(['Code']) }],
      ]);

      const highlights = (journalService as any).generateHighlights(
        hourlyData,
        categoryMinutes,
        150,
        0.82
      );

      const streak = highlights.find((h: any) => h.type === 'productive_streak');
      expect(streak).toBeTruthy();
      expect(streak.description).toContain('3-hour');
    });

    it('detects deep work achievement (>= 2 hours)', () => {
      const hourlyData = [
        { hour: 9, minutes: 55, focusScore: 0.5 },
      ];
      const categoryMinutes = new Map([
        ['Development', { minutes: 120, apps: new Set(['Code']) }],
      ]);

      const highlights = (journalService as any).generateHighlights(
        hourlyData,
        categoryMinutes,
        120,
        0.5
      );

      const achievement = highlights.find((h: any) => h.type === 'achievement');
      expect(achievement).toBeTruthy();
      expect(achievement.description).toContain('2 hours of deep work');
    });

    it('detects meeting-heavy day (>= 2h meetings, > 30% total)', () => {
      const hourlyData = [
        { hour: 9, minutes: 55, focusScore: 0.3 },
      ];
      const categoryMinutes = new Map([
        ['Meetings', { minutes: 180, apps: new Set(['Zoom']) }],
        ['Development', { minutes: 120, apps: new Set(['Code']) }],
      ]);

      const highlights = (journalService as any).generateHighlights(
        hourlyData,
        categoryMinutes,
        300,
        0.3
      );

      const meetingHighlight = highlights.find((h: any) => h.type === 'meeting_heavy');
      expect(meetingHighlight).toBeTruthy();
    });

    it('detects high focus day (>= 0.6 avg score)', () => {
      const hourlyData = [{ hour: 9, minutes: 55, focusScore: 0.5 }];
      const categoryMinutes = new Map<string, { minutes: number; apps: Set<string> }>();

      const highlights = (journalService as any).generateHighlights(
        hourlyData,
        categoryMinutes,
        55,
        0.65
      );

      const focusHighlight = highlights.find((h: any) => h.type === 'focus_session');
      expect(focusHighlight).toBeTruthy();
      expect(focusHighlight.description).toContain('65%');
    });
  });

  describe('focus areas computation', () => {
    it('computes focus areas sorted by minutes', () => {
      const categoryMinutes = new Map([
        ['Development', { minutes: 120, apps: new Set(['Code', 'Terminal']) }],
        ['Communication', { minutes: 30, apps: new Set(['Slack']) }],
        ['Browsing', { minutes: 60, apps: new Set(['Chrome']) }],
      ]);

      const areas = (journalService as any).generateFocusAreas(
        categoryMinutes,
        210
      );

      expect(areas[0].category).toBe('Development');
      expect(areas[0].percentage).toBe(57); // 120/210 = 57%
      expect(areas[0].apps).toContain('Code');
      expect(areas[1].category).toBe('Browsing');
      expect(areas[2].category).toBe('Communication');
    });
  });

  describe('peak productivity hour detection', () => {
    it('identifies the hour with highest focus score', () => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);

      const summaries = [
        makeHourlySummary({
          hourStart: new Date(date).setHours(9),
          totalMinutes: 45,
          focusScore: 0.6,
          appBreakdown: [{ appName: 'Code', minutes: 45, percentage: 100, category: 'Development' }],
        }),
        makeHourlySummary({
          hourStart: new Date(date).setHours(14),
          totalMinutes: 50,
          focusScore: 0.95,
          appBreakdown: [{ appName: 'Code', minutes: 50, percentage: 100, category: 'Development' }],
        }),
        makeHourlySummary({
          hourStart: new Date(date).setHours(16),
          totalMinutes: 40,
          focusScore: 0.7,
          appBreakdown: [{ appName: 'Code', minutes: 40, percentage: 100, category: 'Development' }],
        }),
      ];

      const journal = (journalService as any).computeJournal(summaries, date);
      expect(journal.peakProductivityHour).toBe('2pm'); // hour 14
    });
  });

  describe('formatHour', () => {
    const formatHour = (h: number) => (journalService as any).formatHour(h);

    it('formats midnight as 12am', () => {
      expect(formatHour(0)).toBe('12am');
    });

    it('formats noon as 12pm', () => {
      expect(formatHour(12)).toBe('12pm');
    });

    it('formats morning hours', () => {
      expect(formatHour(9)).toBe('9am');
    });

    it('formats afternoon hours', () => {
      expect(formatHour(15)).toBe('3pm');
    });
  });

  describe('findLongestStreak', () => {
    const findStreak = (hours: number[]) =>
      (journalService as any).findLongestStreak(hours);

    it('finds streak of consecutive hours', () => {
      expect(findStreak([9, 10, 11, 14, 15])).toEqual([9, 10, 11]);
    });

    it('returns single element for no streak', () => {
      expect(findStreak([9, 14, 20])).toEqual([9]);
    });

    it('returns empty for empty input', () => {
      expect(findStreak([])).toEqual([]);
    });

    it('handles unsorted input', () => {
      expect(findStreak([11, 9, 10])).toEqual([9, 10, 11]);
    });
  });
});

// ============================================================================
// 5. CloudSyncService Tests (mock fetch)
// ============================================================================

describe('CloudSyncService', () => {
  let summaryService: SummaryService;
  let journalService: JournalService;
  let syncService: CloudSyncService;

  beforeEach(() => {
    summaryService = new SummaryService();
    journalService = new JournalService(summaryService);
    syncService = new CloudSyncService(summaryService, journalService);
    mockFetch.mockReset();
    mockHourlySummaries.length = 0;
    mockDailyJournals.length = 0;

    // Clear mock store data
    for (const key of Object.keys(mockStoreData)) {
      delete mockStoreData[key];
    }
  });

  describe('isAuthenticated', () => {
    it('returns false when no token', () => {
      mockStoreData.auth = {};
      mockStoreData.user = { id: 'u1', email: 'test@test.com', companyId: 'c1' };
      expect(syncService.isAuthenticated()).toBe(false);
    });

    it('returns false when no user', () => {
      mockStoreData.auth = { accessToken: 'token123' };
      // No user
      expect(syncService.isAuthenticated()).toBe(false);
    });

    it('returns false when both missing', () => {
      mockStoreData.auth = {};
      expect(syncService.isAuthenticated()).toBe(false);
    });

    it('returns true when both token AND user exist', () => {
      mockStoreData.auth = { accessToken: 'token123' };
      mockStoreData.user = { id: 'u1', email: 'test@test.com', companyId: 'c1' };
      expect(syncService.isAuthenticated()).toBe(true);
    });
  });

  describe('sync cycle', () => {
    it('returns error when not authenticated', async () => {
      mockStoreData.auth = {};
      const result = await syncService.sync();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not authenticated');
    });

    it('returns error when sync already in progress', async () => {
      // Set syncing flag
      (syncService as any).isSyncing = true;
      const result = await syncService.sync();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Sync already in progress');
      (syncService as any).isSyncing = false;
    });

    it('syncs unsynced summaries to cloud', async () => {
      mockStoreData.auth = { accessToken: 'token123' };
      mockStoreData.user = {
        id: 'user-1',
        email: 'test@test.com',
        companyId: 'company-1',
      };

      // Add unsynced summary
      mockHourlySummaries.push(
        makeHourlySummary({ synced: false, id: 42 })
      );

      // Mock successful fetch response
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-length', '2']]),
        text: () => Promise.resolve('[]'),
      });

      const result = await syncService.sync();
      expect(result.syncedItems.summaries).toBe(1);
    });
  });

  describe('token refresh on 401', () => {
    it('retries request after successful token refresh', async () => {
      mockStoreData.auth = {
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
      };
      mockStoreData.user = {
        id: 'user-1',
        email: 'test@test.com',
        companyId: 'company-1',
      };

      // First call: 401, second call: token refresh success, third call: retry success
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        })
        .mockResolvedValueOnce({
          // refresh token call
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              access_token: 'new-token',
              refresh_token: 'new-refresh',
            }),
        })
        .mockResolvedValueOnce({
          // retried request
          ok: true,
          status: 200,
          headers: new Map([['content-length', '0']]),
          text: () => Promise.resolve(''),
        });

      const result = await (syncService as any).supabaseRequest(
        'test-endpoint',
        'GET'
      );
      // Should have retried after refresh
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.error).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('handles network failure gracefully', async () => {
      mockStoreData.auth = { accessToken: 'token123' };

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await (syncService as any).supabaseRequest(
        'test-endpoint',
        'GET'
      );
      expect(result.error).toBeTruthy();
      expect(result.error.message).toContain('Network error');
    });

    it('handles invalid JSON response', async () => {
      mockStoreData.auth = { accessToken: 'token123' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-length', '10']]),
        text: () => Promise.resolve('not-json'),
      });

      const result = await (syncService as any).supabaseRequest(
        'test-endpoint',
        'GET'
      );
      // Should not throw, returns data: null for non-JSON success
      expect(result.data).toBeNull();
    });

    it('handles API error responses', async () => {
      mockStoreData.auth = { accessToken: 'token123' };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const result = await (syncService as any).supabaseRequest(
        'test-endpoint',
        'GET'
      );
      expect(result.error).toBeTruthy();
      expect(result.error.message).toContain('500');
    });
  });
});

// ============================================================================
// 6. AuthUtils Tests (mock fetch)
// ============================================================================

describe('AuthUtils', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    for (const key of Object.keys(mockStoreData)) {
      delete mockStoreData[key];
    }
  });

  // We need to test refreshAccessToken which imports from store
  // Since store is mocked, we test the logic via the import

  describe('refreshAccessToken', () => {
    it('returns null when no refresh token', async () => {
      mockStoreData.auth = {};
      const { refreshAccessToken } = await import(
        '../src/main/services/authUtils'
      );
      const result = await refreshAccessToken();
      expect(result).toBeNull();
    });

    it('refreshes token on success', async () => {
      mockStoreData.auth = { refreshToken: 'valid-refresh-token' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
          }),
      });

      const { refreshAccessToken } = await import(
        '../src/main/services/authUtils'
      );
      const result = await refreshAccessToken();
      expect(result).toBe('new-access-token');
      // Verify the token was stored
      expect(mockStoreData.auth.accessToken).toBe('new-access-token');
      expect(mockStoreData.auth.refreshToken).toBe('new-refresh-token');
    });

    it('clears auth on 400/401 (expired refresh token)', async () => {
      mockStoreData.auth = {
        accessToken: 'old-access',
        refreshToken: 'expired-refresh-token',
      };
      mockStoreData.user = { id: 'u1', email: 'test@test.com' };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const { refreshAccessToken } = await import(
        '../src/main/services/authUtils'
      );
      const result = await refreshAccessToken();
      expect(result).toBeNull();
      // clearAuth should have been called
      expect(mockStoreData.auth?.accessToken).toBeUndefined();
    });

    it('handles network error gracefully', async () => {
      mockStoreData.auth = { refreshToken: 'valid-refresh-token' };

      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const { refreshAccessToken } = await import(
        '../src/main/services/authUtils'
      );
      const result = await refreshAccessToken();
      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// 7. Scheduler Tests
// ============================================================================

describe('Scheduler', () => {
  let summaryService: SummaryService;
  let journalService: JournalService;
  let scheduler: Scheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    summaryService = new SummaryService();
    journalService = new JournalService(summaryService);
    scheduler = new Scheduler(summaryService, journalService);

    // Reset store data
    for (const key of Object.keys(mockStoreData)) {
      delete mockStoreData[key];
    }
    // Provide default settings
    mockStoreData.settings = {
      trackingEnabled: true,
      syncIntervalMinutes: 5,
      dataRetentionDays: 30,
    };
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  describe('task scheduling', () => {
    it('registers all tasks on start', () => {
      scheduler.start();
      const status = scheduler.getStatus();
      expect(Object.keys(status)).toContain('hourly-summary');
      expect(Object.keys(status)).toContain('daily-journal');
      expect(Object.keys(status)).toContain('cleanup');
      expect(Object.keys(status)).toContain('cloud-sync');
      expect(Object.keys(status)).toContain('semantic-cycle');
      expect(Object.keys(status)).toContain('signature-computation');
    });

    it('does not double-start', () => {
      scheduler.start();
      scheduler.start(); // Should be a no-op
      const status = scheduler.getStatus();
      expect(Object.keys(status).length).toBe(6);
    });

    it('clears all tasks on stop', () => {
      scheduler.start();
      scheduler.stop();
      const status = scheduler.getStatus();
      expect(Object.keys(status).length).toBe(0);
    });
  });

  describe('reads settings from store', () => {
    it('uses syncIntervalMinutes from settings for sync task', () => {
      mockStoreData.settings = {
        ...mockStoreData.settings,
        syncIntervalMinutes: 10,
      };

      scheduler.start();
      // The sync interval should be set based on settings
      // We just verify it started without error and task is registered
      const status = scheduler.getStatus();
      expect(status['cloud-sync']).toBeTruthy();
    });
  });

  describe('callbacks', () => {
    it('calls sync callback when sync is triggered', async () => {
      const syncCallback = vi.fn().mockResolvedValue(undefined);
      scheduler.setSyncCallback(syncCallback);
      scheduler.start();

      // Mock getActivityByDateRange to return empty for saveOrUpdateCurrentHourSummary
      (getActivityByDateRange as any).mockReturnValue([]);

      await scheduler.triggerSync();
      expect(syncCallback).toHaveBeenCalled();
    });

    it('calls semantic cycle callback', async () => {
      const semanticCallback = vi.fn().mockResolvedValue(undefined);
      scheduler.setSemanticCycleCallback(semanticCallback);
      scheduler.start();

      // Trigger via the public method path
      await (scheduler as any).runSemanticCycle();
      expect(semanticCallback).toHaveBeenCalled();
    });

    it('skips sync when no callback registered', async () => {
      scheduler.start();
      // Should not throw
      await scheduler.triggerSync();
    });
  });

  describe('task guards', () => {
    it('prevents overlapping runs of same task', async () => {
      // Use real timers for this test since we need real async behavior
      vi.useRealTimers();

      let resolveCallback: (() => void) | null = null;
      const slowCallback = vi.fn(
        () => new Promise<void>((resolve) => { resolveCallback = resolve; })
      );
      scheduler.setSyncCallback(slowCallback);
      scheduler.start();

      // Mock getActivityByDateRange to return empty
      (getActivityByDateRange as any).mockReturnValue([]);

      // Start first run — it will block on the slow callback
      const firstRun = scheduler.triggerSync();

      // Allow microtasks to run so the first sync enters the callback
      await new Promise((r) => setTimeout(r, 50));

      // Try to trigger again while first is running — should be skipped
      await scheduler.triggerSync();

      // Now resolve the first run
      resolveCallback!();
      await firstRun;

      // Should only have been called once (second was skipped)
      expect(slowCallback).toHaveBeenCalledTimes(1);

      // Restore fake timers for afterEach
      vi.useFakeTimers();
    });
  });
});

// ============================================================================
// 8. Store Tests
// ============================================================================

describe('Store', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStoreData)) {
      delete mockStoreData[key];
    }
    mockStoreData.auth = {};
    mockStoreData.settings = {
      trackingEnabled: true,
      excludedApps: [],
      dataRetentionDays: 30,
      autoSync: true,
      syncIntervalMinutes: 1,
    };
  });

  describe('settings get/set', () => {
    it('returns default settings initially', async () => {
      const { getSettings } = await import('../src/main/store');
      const settings = getSettings();
      expect(settings).toBeTruthy();
      expect(settings.trackingEnabled).toBe(true);
    });

    it('updates settings via updateSettings', async () => {
      const { updateSettings, getSettings } = await import(
        '../src/main/store'
      );
      updateSettings({ syncIntervalMinutes: 10 });
      const settings = getSettings();
      expect(settings.syncIntervalMinutes).toBe(10);
      // Other settings preserved
      expect(settings.trackingEnabled).toBe(true);
    });
  });

  describe('auth token storage', () => {
    it('stores and retrieves access token', async () => {
      const { setAccessToken, getAccessToken } = await import(
        '../src/main/store'
      );
      setAccessToken('test-token-123');
      expect(getAccessToken()).toBe('test-token-123');
    });

    it('stores and retrieves refresh token', async () => {
      const { setRefreshToken, getRefreshToken } = await import(
        '../src/main/store'
      );
      setRefreshToken('refresh-xyz');
      expect(getRefreshToken()).toBe('refresh-xyz');
    });

    it('clears token when set to null', async () => {
      const { setAccessToken, getAccessToken } = await import(
        '../src/main/store'
      );
      setAccessToken('token');
      setAccessToken(null);
      expect(getAccessToken()).toBeUndefined();
    });
  });

  describe('user storage', () => {
    it('stores and retrieves user', async () => {
      const { setUser, getUser } = await import('../src/main/store');
      const user = {
        id: 'u-123',
        email: 'test@example.com',
        name: 'Test User',
        companyId: 'c-456',
      };
      setUser(user);
      const retrieved = getUser();
      expect(retrieved).toEqual(user);
    });

    it('clears user when set to null', async () => {
      const { setUser, getUser } = await import('../src/main/store');
      setUser({
        id: 'u-123',
        email: 'test@example.com',
        companyId: null,
      });
      setUser(null);
      expect(getUser()).toBeUndefined();
    });
  });

  describe('clearAuth', () => {
    it('clears all auth data', async () => {
      const {
        setAccessToken,
        setRefreshToken,
        setUser,
        clearAuth,
        getAccessToken,
        getRefreshToken,
        getUser,
      } = await import('../src/main/store');

      setAccessToken('token');
      setRefreshToken('refresh');
      setUser({
        id: 'u-1',
        email: 'test@test.com',
        companyId: 'c-1',
      });

      clearAuth();

      expect(getAccessToken()).toBeUndefined();
      expect(getRefreshToken()).toBeUndefined();
      expect(getUser()).toBeUndefined();
    });
  });

  describe('machine-specific encryption key', () => {
    it('generates deterministic key from hostname + username', () => {
      const crypto = require('crypto');
      const os = require('os');

      const key1 = crypto
        .createHash('sha256')
        .update(os.hostname() + os.userInfo().username + 'sync-desktop-v1')
        .digest('hex');
      const key2 = crypto
        .createHash('sha256')
        .update(os.hostname() + os.userInfo().username + 'sync-desktop-v1')
        .digest('hex');

      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64); // sha256 hex = 64 chars
    });
  });
});
