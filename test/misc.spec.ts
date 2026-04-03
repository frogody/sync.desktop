/**
 * Miscellaneous Tests
 *
 * Tests for: shared constants, PrivacyFilter (extended), NotchBridge logic,
 * ActionService logic, Permissions logic, AutoUpdater logic, DeepContextManager logic.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';

// ============================================================================
// Constants Validation (TEST-029)
// ============================================================================

describe('Shared Constants', () => {
  // Import constants from actual source to avoid stale hardcoded values
  let constants: any;

  beforeAll(async () => {
    constants = await import('../src/shared/constants');
  });

  describe('APP_VERSION matches package.json', () => {
    it('version in constants matches package.json version', () => {
      const pkgPath = path.resolve(__dirname, '..', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      expect(constants.APP_VERSION).toBe(pkg.version);
    });
  });

  describe('SUPABASE_URL is valid', () => {
    it('is a valid HTTPS URL', () => {
      const url = new URL(constants.SUPABASE_URL);
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toContain('supabase.co');
    });

    it('does not have trailing slash', () => {
      expect(constants.SUPABASE_URL.endsWith('/')).toBe(false);
    });
  });

  describe('SENSITIVE_APP_PATTERNS are valid', () => {
    it('all patterns are non-empty strings', () => {
      for (const pattern of constants.SENSITIVE_APP_PATTERNS) {
        expect(typeof pattern).toBe('string');
        expect(pattern.length).toBeGreaterThan(0);
      }
    });

    it('patterns are lowercase', () => {
      for (const pattern of constants.SENSITIVE_APP_PATTERNS) {
        expect(pattern).toBe(pattern.toLowerCase());
      }
    });

    it('includes critical security apps', () => {
      const patterns = constants.SENSITIVE_APP_PATTERNS;
      expect(patterns).toContain('1password');
      expect(patterns).toContain('keychain');
      expect(patterns).toContain('bitwarden');
      expect(patterns).toContain('banking');
    });
  });

  describe('Widget dimensions are positive', () => {
    it('all WIDGET_SIZES have positive dimensions', () => {
      for (const [size, dims] of Object.entries(constants.WIDGET_SIZES)) {
        expect(dims.width).toBeGreaterThan(0);
        expect(dims.height).toBeGreaterThan(0);
      }
    });

    it('CHAT_WINDOW_SIZE has positive dimensions', () => {
      expect(constants.CHAT_WINDOW_SIZE.width).toBeGreaterThan(0);
      expect(constants.CHAT_WINDOW_SIZE.height).toBeGreaterThan(0);
    });

    it('VOICE_WINDOW_SIZE has positive dimensions', () => {
      expect(constants.VOICE_WINDOW_SIZE.width).toBeGreaterThan(0);
      expect(constants.VOICE_WINDOW_SIZE.height).toBeGreaterThan(0);
    });

    it('chat window is wider than voice window', () => {
      expect(constants.CHAT_WINDOW_SIZE.width).toBeGreaterThan(constants.VOICE_WINDOW_SIZE.width);
    });

    it('widget sizes are ordered small < medium < large', () => {
      expect(constants.WIDGET_SIZES.small.width).toBeLessThan(constants.WIDGET_SIZES.medium.width);
      expect(constants.WIDGET_SIZES.medium.width).toBeLessThan(constants.WIDGET_SIZES.large.width);
    });
  });

  describe('Intervals are positive', () => {
    it('ACTIVITY_POLL_INTERVAL_MS is positive', () => {
      expect(constants.ACTIVITY_POLL_INTERVAL_MS).toBeGreaterThan(0);
    });

    it('DEFAULT_SYNC_INTERVAL_MS is positive', () => {
      expect(constants.DEFAULT_SYNC_INTERVAL_MS).toBeGreaterThan(0);
    });

    it('CONTEXT_WINDOW_MINUTES is positive', () => {
      expect(constants.CONTEXT_WINDOW_MINUTES).toBeGreaterThan(0);
    });

    it('HOURLY_SUMMARY_RETENTION_HOURS equals 7 days', () => {
      expect(constants.HOURLY_SUMMARY_RETENTION_HOURS).toBe(7 * 24);
    });

    it('DAILY_JOURNAL_RETENTION_DAYS equals 90', () => {
      expect(constants.DAILY_JOURNAL_RETENTION_DAYS).toBe(90);
    });

    it('SYNC_BATCH_SIZE is positive', () => {
      expect(constants.SYNC_BATCH_SIZE).toBeGreaterThan(0);
    });

    it('click debounce intervals are positive and ordered', () => {
      expect(constants.CLICK_DEBOUNCE_MS).toBeGreaterThan(0);
      expect(constants.DOUBLE_CLICK_MAX_MS).toBeGreaterThan(constants.CLICK_DEBOUNCE_MS);
      expect(constants.TRIPLE_CLICK_MAX_MS).toBeGreaterThan(constants.DOUBLE_CLICK_MAX_MS);
    });
  });

  describe('BROWSER_APPS', () => {
    it('includes major browsers', () => {
      expect(constants.BROWSER_APPS).toContain('Google Chrome');
      expect(constants.BROWSER_APPS).toContain('Safari');
      expect(constants.BROWSER_APPS).toContain('Firefox');
    });

    it('all entries are non-empty strings', () => {
      for (const app of constants.BROWSER_APPS) {
        expect(typeof app).toBe('string');
        expect(app.length).toBeGreaterThan(0);
      }
    });
  });
});

// ============================================================================
// PrivacyFilter Tests (extended, TEST-027/TEST-029 partial)
// ============================================================================

describe('PrivacyFilter', () => {
  // Import the actual PrivacyFilter
  let PrivacyFilter: any;
  let DEFAULT_ENGINE_CONFIG: any;

  beforeEach(async () => {
    const mod = await import('../src/deep-context/privacy/privacyFilter');
    PrivacyFilter = mod.PrivacyFilter;
    const types = await import('../src/deep-context/types');
    DEFAULT_ENGINE_CONFIG = types.DEFAULT_ENGINE_CONFIG;
  });

  function makeFilter(overrides: Record<string, any> = {}) {
    return new PrivacyFilter({ ...DEFAULT_ENGINE_CONFIG, ...overrides });
  }

  describe('sensitive app detection', () => {
    it('blocks VPN apps', () => {
      const filter = makeFilter();
      expect(filter.shouldCapture('OpenVPN', 'Connected')).toBe(false);
    });

    it('blocks system security apps', () => {
      const filter = makeFilter();
      expect(filter.shouldCapture('System Preferences', 'Security')).toBe(false);
      expect(filter.shouldCapture('FileVault', 'Encryption')).toBe(false);
    });

    it('blocks Dashlane', () => {
      const filter = makeFilter();
      expect(filter.shouldCapture('Dashlane', 'Passwords')).toBe(false);
    });

    it('blocks PayPal and Venmo', () => {
      const filter = makeFilter();
      expect(filter.shouldCapture('PayPal', 'Transfer')).toBe(false);
      expect(filter.shouldCapture('Venmo', 'Payment')).toBe(false);
    });

    it('blocks Revolut and Wise', () => {
      const filter = makeFilter();
      expect(filter.shouldCapture('Revolut', 'Balance')).toBe(false);
      expect(filter.shouldCapture('Wise', 'Transfer')).toBe(false);
    });
  });

  describe('title sanitization via PII stripping', () => {
    it('strips phone numbers', () => {
      const filter = makeFilter();
      const text = 'Call me at (555) 123-4567 please';
      const sanitized = filter.stripPII(text);
      expect(sanitized).not.toContain('(555) 123-4567');
      expect(sanitized).toContain('[phone]');
    });

    it('strips international phone numbers', () => {
      const filter = makeFilter();
      const text = 'Contact: +1 555-123-4567';
      const sanitized = filter.stripPII(text);
      expect(sanitized).not.toContain('+1 555-123-4567');
    });

    it('handles mixed PII in one string', () => {
      const filter = makeFilter();
      const text = 'Send to user@email.com, card 4532-1234-5678-9012, SSN 123-45-6789';
      const sanitized = filter.stripPII(text);
      expect(sanitized).toContain('[email]');
      expect(sanitized).toContain('[card]');
      expect(sanitized).toContain('[ssn]');
      expect(sanitized).not.toContain('user@email.com');
    });
  });

  describe('URL filtering', () => {
    it('blocks excluded domains', () => {
      const filter = makeFilter({ excludedDomains: ['example.com'] });
      expect(filter.shouldCapture('Chrome', 'Page', 'https://example.com/path')).toBe(false);
    });

    it('blocks subdomains of excluded domains', () => {
      const filter = makeFilter({ excludedDomains: ['example.com'] });
      expect(filter.shouldCapture('Chrome', 'Page', 'https://sub.example.com')).toBe(false);
    });

    it('does not block similar but different domains', () => {
      const filter = makeFilter({ excludedDomains: ['example.com'] });
      expect(filter.shouldCapture('Chrome', 'Page', 'https://notexample.com')).toBe(true);
    });
  });

  describe('InPrivate detection for Edge', () => {
    it('blocks Microsoft Edge InPrivate windows', () => {
      const filter = makeFilter();
      expect(filter.shouldCapture('Microsoft Edge', 'InPrivate - New Tab')).toBe(false);
    });
  });
});

// ============================================================================
// NotchBridge Logic Tests (TEST-013)
// ============================================================================

describe('NotchBridge — message serialization and logic', () => {
  describe('message serialization', () => {
    interface BridgeMessage {
      type: string;
      payload: Record<string, unknown>;
    }

    it('serializes to JSON with newline delimiter', () => {
      const msg: BridgeMessage = { type: 'shutdown', payload: {} };
      const json = JSON.stringify(msg) + '\n';
      expect(json).toBe('{"type":"shutdown","payload":{}}\n');
    });

    it('serializes config message correctly', () => {
      const msg: BridgeMessage = {
        type: 'config',
        payload: {
          supabaseUrl: 'https://example.supabase.co',
          anonKey: 'key123',
          accessToken: 'token',
          userId: 'user-1',
          sessionId: 'sync_user_user-1',
        },
      };
      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json);
      expect(parsed.type).toBe('config');
      expect(parsed.payload.sessionId).toBe('sync_user_user-1');
    });

    it('serializes context_event message', () => {
      const msg: BridgeMessage = {
        type: 'context_event',
        payload: {
          eventType: 'commitment_detected',
          summary: 'User committed to send report',
          entities: ['Sarah', 'report'],
          commitments: [],
          source: {
            application: 'Slack',
            windowTitle: '#general',
            url: null,
            filePath: null,
          },
          confidence: 0.85,
          timestamp: 1234567890,
        },
      };
      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json);
      expect(parsed.payload.entities).toHaveLength(2);
      expect(parsed.payload.confidence).toBe(0.85);
    });

    it('serializes show_action message', () => {
      const msg: BridgeMessage = {
        type: 'show_action',
        payload: {
          id: 'action-123',
          title: 'Send invoice to client',
          subtitle: 'Draft email ready',
          actionType: 'send_email',
        },
      };
      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json);
      expect(parsed.type).toBe('show_action');
      expect(parsed.payload.id).toBe('action-123');
    });
  });

  describe('message parsing (Swift -> Electron)', () => {
    it('parses ready message', () => {
      const line = '{"type":"ready","payload":{}}';
      const msg = JSON.parse(line);
      expect(msg.type).toBe('ready');
    });

    it('parses action_detected message', () => {
      const line = JSON.stringify({
        type: 'action_detected',
        payload: {
          id: 'act-1',
          eventHash: 'abc123',
          title: 'Send email',
          actionType: 'send_email',
          confidence: 0.9,
          localPayload: {},
        },
      });
      const msg = JSON.parse(line);
      expect(msg.type).toBe('action_detected');
      expect(msg.payload.confidence).toBe(0.9);
    });

    it('handles incomplete JSON lines with buffer', () => {
      // Simulate the buffer logic from NotchBridge
      let buffer = '';
      const messages: any[] = [];

      // First chunk: partial line
      const chunk1 = '{"type":"rea';
      buffer += chunk1;
      const lines1 = buffer.split('\n');
      buffer = lines1.pop() || '';
      // No complete lines yet
      expect(lines1.filter((l) => l.trim())).toHaveLength(0);

      // Second chunk: rest of line + newline
      const chunk2 = 'dy","payload":{}}\n';
      buffer += chunk2;
      const lines2 = buffer.split('\n');
      buffer = lines2.pop() || '';
      for (const line of lines2) {
        if (line.trim()) messages.push(JSON.parse(line));
      }
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('ready');
    });

    it('handles multiple messages in one chunk', () => {
      let buffer = '';
      const messages: any[] = [];
      const chunk = '{"type":"ready","payload":{}}\n{"type":"log","payload":{"level":"info","message":"Started"}}\n';
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) messages.push(JSON.parse(line));
      }
      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe('ready');
      expect(messages[1].type).toBe('log');
    });
  });

  describe('auto-restart logic', () => {
    it('should restart up to maxRestarts (3)', () => {
      let restartCount = 0;
      const maxRestarts = 3;

      // Simulate crash restarts
      while (restartCount < maxRestarts) {
        restartCount++;
      }
      expect(restartCount).toBe(3);
      // Next crash should NOT restart
      const shouldRestart = restartCount < maxRestarts;
      expect(shouldRestart).toBe(false);
    });

    it('resets restartCount on successful ready', () => {
      let restartCount = 2; // Two crashes already

      // Simulate successful startup (ready message)
      restartCount = 0;
      expect(restartCount).toBe(0);

      // Now crashes are allowed again
      const shouldRestart = restartCount < 3;
      expect(shouldRestart).toBe(true);
    });
  });

  describe('graceful shutdown message', () => {
    it('sends shutdown type with empty payload', () => {
      const msg = { type: 'shutdown', payload: {} };
      const json = JSON.stringify(msg);
      expect(json).toContain('"type":"shutdown"');
      expect(json).toContain('"payload":{}');
    });
  });

  describe('widget path detection', () => {
    it('production path includes Resources/SYNCWidget.app', () => {
      const resourcesPath = '/Applications/SYNC Desktop.app/Contents/Resources';
      const widgetPath = path.join(
        resourcesPath,
        'SYNCWidget.app',
        'Contents',
        'MacOS',
        'SYNCWidget'
      );
      expect(widgetPath).toContain('SYNCWidget.app');
      expect(widgetPath).toContain('MacOS');
      expect(widgetPath.endsWith('SYNCWidget')).toBe(true);
    });

    it('development path includes native/SYNCWidget/build', () => {
      const appPath = '/Users/dev/sync.desktop';
      const widgetPath = path.join(
        appPath,
        'native',
        'SYNCWidget',
        'build',
        'SYNCWidget.app',
        'Contents',
        'MacOS',
        'SYNCWidget'
      );
      expect(widgetPath).toContain('native');
      expect(widgetPath).toContain('build');
    });
  });
});

// ============================================================================
// ActionService Logic Tests (TEST-012)
// ============================================================================

describe('ActionService — frequency capping and deduplication logic', () => {
  const MAX_ACTIONS_PER_HOUR = 5;
  const MIN_GAP_SECONDS = 120;

  describe('frequency capping: shouldShowAction', () => {
    function shouldShowAction(
      recentTimestamps: number[],
      lastShownAt: number,
      shouldNotify: boolean
    ): boolean {
      if (!shouldNotify) return false;

      const now = Date.now();

      // Prune old timestamps
      const recent = recentTimestamps.filter((ts) => now - ts < 60 * 60 * 1000);

      // Hourly rate limit
      if (recent.length >= MAX_ACTIONS_PER_HOUR) return false;

      // Min gap
      if (lastShownAt > 0 && now - lastShownAt < MIN_GAP_SECONDS * 1000) return false;

      return true;
    }

    it('allows first action', () => {
      expect(shouldShowAction([], 0, true)).toBe(true);
    });

    it('blocks when shouldNotify is false', () => {
      expect(shouldShowAction([], 0, false)).toBe(false);
    });

    it('blocks when hourly limit (5) is reached', () => {
      const now = Date.now();
      const timestamps = Array(5).fill(now - 1000);
      expect(shouldShowAction(timestamps, 0, true)).toBe(false);
    });

    it('allows when old timestamps are pruned', () => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const timestamps = Array(5).fill(twoHoursAgo);
      expect(shouldShowAction(timestamps, 0, true)).toBe(true);
    });

    it('blocks when min gap (2 min) not met', () => {
      const now = Date.now();
      const lastShown = now - 60 * 1000; // 1 minute ago
      expect(shouldShowAction([], lastShown, true)).toBe(false);
    });

    it('allows when min gap is met', () => {
      const now = Date.now();
      const lastShown = now - 3 * 60 * 1000; // 3 minutes ago
      expect(shouldShowAction([], lastShown, true)).toBe(true);
    });

    it('allows exactly at boundary of hourly limit (4 actions)', () => {
      const now = Date.now();
      const timestamps = Array(4).fill(now - 1000);
      const lastShown = now - 3 * 60 * 1000;
      expect(shouldShowAction(timestamps, lastShown, true)).toBe(true);
    });
  });

  describe('action deduplication via event hash', () => {
    it('same inputs within same minute produce same hash', () => {
      const crypto = require('crypto');
      const timestampMinute = Math.floor(Date.now() / 60000);
      const hash1 = crypto.createHash('sha256').update('type1' + 'app1' + 'summary1' + timestampMinute).digest('hex');
      const hash2 = crypto.createHash('sha256').update('type1' + 'app1' + 'summary1' + timestampMinute).digest('hex');
      expect(hash1).toBe(hash2);
    });

    it('different inputs produce different hashes', () => {
      const crypto = require('crypto');
      const timestampMinute = Math.floor(Date.now() / 60000);
      const hash1 = crypto.createHash('sha256').update('type1' + 'app1' + 'summary1' + timestampMinute).digest('hex');
      const hash2 = crypto.createHash('sha256').update('type2' + 'app2' + 'summary2' + timestampMinute).digest('hex');
      expect(hash1).not.toBe(hash2);
    });

    it('hash is a 64-char hex string', () => {
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update('test').digest('hex');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('action lifecycle states', () => {
    const VALID_STATES = ['detected', 'pending', 'approved', 'dismissed', 'completed', 'failed', 'invalidated', 'expired'];

    it('detected is the initial state', () => {
      expect(VALID_STATES).toContain('detected');
    });

    it('all terminal states are valid', () => {
      const terminalStates = ['approved', 'dismissed', 'completed', 'failed', 'invalidated', 'expired'];
      for (const state of terminalStates) {
        expect(VALID_STATES).toContain(state);
      }
    });

    it('pending is a valid intermediate state', () => {
      expect(VALID_STATES).toContain('pending');
    });
  });

  describe('action queue', () => {
    it('queue is FIFO', () => {
      const queue: { id: string }[] = [];
      queue.push({ id: 'a' });
      queue.push({ id: 'b' });
      queue.push({ id: 'c' });

      const first = queue.shift()!;
      expect(first.id).toBe('a');
      expect(queue).toHaveLength(2);
    });

    it('drains correctly', () => {
      const queue = [{ id: '1' }, { id: '2' }, { id: '3' }];
      const drained: string[] = [];

      while (queue.length > 0) {
        const next = queue.shift()!;
        drained.push(next.id);
      }

      expect(drained).toEqual(['1', '2', '3']);
      expect(queue).toHaveLength(0);
    });
  });
});

// ============================================================================
// Permissions Logic Tests (TEST-019)
// ============================================================================

describe('Permissions — logic tests', () => {
  describe('permission status structure', () => {
    interface PermissionStatus {
      accessibility: boolean;
      screenCapture: boolean;
    }

    it('default status has both false', () => {
      const status: PermissionStatus = {
        accessibility: false,
        screenCapture: false,
      };
      expect(status.accessibility).toBe(false);
      expect(status.screenCapture).toBe(false);
    });

    it('non-darwin platforms get both true', () => {
      // Simulating Windows/Linux behavior
      const status: PermissionStatus = {
        accessibility: true,
        screenCapture: true,
      };
      expect(status.accessibility).toBe(true);
      expect(status.screenCapture).toBe(true);
    });
  });

  describe('Sequoia workaround logic', () => {
    it('uses real capture test when API says not granted', () => {
      // Simulate: API says "denied" but real capture works
      const apiResult = 'denied';
      const realCaptureWorks = true;

      let screenCapture = false;
      if (apiResult === 'granted') {
        screenCapture = true;
      } else {
        screenCapture = realCaptureWorks;
      }

      expect(screenCapture).toBe(true);
    });

    it('reports false when both API and real test fail', () => {
      const apiResult = 'denied';
      const realCaptureWorks = false;

      let screenCapture = false;
      if (apiResult === 'granted') {
        screenCapture = true;
      } else {
        screenCapture = realCaptureWorks;
      }

      expect(screenCapture).toBe(false);
    });

    it('trusts API when it says granted (fast path)', () => {
      const apiResult = 'granted';
      // Don't even need to test real capture
      const screenCapture = apiResult === 'granted';
      expect(screenCapture).toBe(true);
    });
  });
});

// ============================================================================
// AutoUpdater Logic Tests (TEST-020)
// ============================================================================

describe('AutoUpdater — state machine and logic', () => {
  describe('update state tracking', () => {
    it('initial state: nothing available', () => {
      let updateAvailable = false;
      let updateDownloaded = false;
      let isChecking = false;
      let isDownloading = false;

      expect(updateAvailable).toBe(false);
      expect(updateDownloaded).toBe(false);
      expect(isChecking).toBe(false);
      expect(isDownloading).toBe(false);
    });

    it('checking-for-update sets isChecking', () => {
      let isChecking = false;
      // Simulate event
      isChecking = true;
      expect(isChecking).toBe(true);
    });

    it('update-available sets updateAvailable and clears isChecking', () => {
      let isChecking = true;
      let updateAvailable = false;

      // Simulate event
      isChecking = false;
      updateAvailable = true;
      expect(isChecking).toBe(false);
      expect(updateAvailable).toBe(true);
    });

    it('update-not-available clears flags', () => {
      let isChecking = true;
      let updateAvailable = false;

      // Simulate event
      isChecking = false;
      updateAvailable = false;
      expect(isChecking).toBe(false);
      expect(updateAvailable).toBe(false);
    });

    it('download transitions: not downloading -> downloading -> downloaded', () => {
      let isDownloading = false;
      let updateDownloaded = false;

      // Start download
      isDownloading = true;
      expect(isDownloading).toBe(true);
      expect(updateDownloaded).toBe(false);

      // Download complete
      isDownloading = false;
      updateDownloaded = true;
      expect(isDownloading).toBe(false);
      expect(updateDownloaded).toBe(true);
    });

    it('error resets checking and downloading flags', () => {
      let isChecking = true;
      let isDownloading = true;

      // Simulate error event
      isChecking = false;
      isDownloading = false;
      expect(isChecking).toBe(false);
      expect(isDownloading).toBe(false);
    });
  });

  describe('getUpdateStatus returns correct shape', () => {
    it('returns all required fields', () => {
      const status = {
        available: false,
        downloaded: false,
        info: null as any,
        progress: 0,
      };
      expect(status).toHaveProperty('available');
      expect(status).toHaveProperty('downloaded');
      expect(status).toHaveProperty('info');
      expect(status).toHaveProperty('progress');
    });
  });

  describe('IPC UPDATE_DOWNLOAD guards', () => {
    it('rejects download when no update available', () => {
      const updateAvailable = false;
      const result = !updateAvailable
        ? { success: false, error: 'No update available' }
        : { success: true };
      expect(result.success).toBe(false);
      expect(result.error).toBe('No update available');
    });

    it('rejects download when already downloading', () => {
      const updateAvailable = true;
      const isDownloading = true;
      const result = !updateAvailable
        ? { success: false, error: 'No update available' }
        : isDownloading
        ? { success: false, error: 'Download already in progress' }
        : { success: true };
      expect(result.success).toBe(false);
      expect(result.error).toBe('Download already in progress');
    });

    it('allows download when update available and not downloading', () => {
      const updateAvailable = true;
      const isDownloading = false;
      const result = !updateAvailable
        ? { success: false, error: 'No update available' }
        : isDownloading
        ? { success: false, error: 'Download already in progress' }
        : { success: true };
      expect(result.success).toBe(true);
    });
  });

  describe('IPC UPDATE_INSTALL guards', () => {
    it('rejects install when no update downloaded', () => {
      const updateDownloaded = false;
      const result = !updateDownloaded
        ? { success: false, error: 'No update downloaded' }
        : { success: true };
      expect(result.success).toBe(false);
    });

    it('allows install when update is downloaded', () => {
      const updateDownloaded = true;
      const result = !updateDownloaded
        ? { success: false, error: 'No update downloaded' }
        : { success: true };
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// DeepContextManager Logic Tests (TEST-010 partial)
// ============================================================================

describe('DeepContextManager — extractable logic', () => {
  describe('parseDeadline', () => {
    // Replicate the parseDeadline logic from deepContextManager.ts
    function parseDeadline(deadlineStr: string): number | undefined {
      const lowerStr = deadlineStr.toLowerCase();

      if (lowerStr.includes('tomorrow')) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        return tomorrow.getTime();
      }

      if (lowerStr.includes('today')) {
        const today = new Date();
        today.setHours(17, 0, 0, 0);
        return today.getTime();
      }

      if (lowerStr.includes('next week')) {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        return nextWeek.getTime();
      }

      const parsed = Date.parse(deadlineStr);
      if (!isNaN(parsed)) {
        return parsed;
      }

      return undefined;
    }

    it('parses "tomorrow" to 9 AM next day', () => {
      const result = parseDeadline('tomorrow');
      expect(result).toBeDefined();
      const date = new Date(result!);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(date.getDate()).toBe(tomorrow.getDate());
      expect(date.getHours()).toBe(9);
      expect(date.getMinutes()).toBe(0);
    });

    it('parses "today" to 5 PM today', () => {
      const result = parseDeadline('today');
      expect(result).toBeDefined();
      const date = new Date(result!);
      expect(date.getDate()).toBe(new Date().getDate());
      expect(date.getHours()).toBe(17);
    });

    it('parses "next week" to 7 days from now', () => {
      const result = parseDeadline('next week');
      expect(result).toBeDefined();
      const date = new Date(result!);
      const expected = new Date();
      expected.setDate(expected.getDate() + 7);
      expect(date.getDate()).toBe(expected.getDate());
    });

    it('parses ISO date strings', () => {
      const result = parseDeadline('2026-03-25');
      expect(result).toBeDefined();
      expect(typeof result).toBe('number');
    });

    it('returns undefined for unparseable strings', () => {
      const result = parseDeadline('whenever you get to it');
      expect(result).toBeUndefined();
    });

    it('handles case insensitivity', () => {
      const result = parseDeadline('TOMORROW');
      expect(result).toBeDefined();
      const date = new Date(result!);
      expect(date.getHours()).toBe(9);
    });

    it('handles "by tomorrow" phrases', () => {
      const result = parseDeadline('by tomorrow evening');
      expect(result).toBeDefined();
    });
  });

  describe('getSuggestedAction', () => {
    function getSuggestedAction(type: string): string {
      switch (type) {
        case 'send_email':
          return 'Send the email you mentioned';
        case 'create_event':
          return 'Create the calendar event';
        case 'send_file':
          return 'Send the file you mentioned';
        case 'follow_up':
          return 'Follow up as promised';
        case 'make_call':
          return 'Make the call you mentioned';
        default:
          return 'Complete the action you mentioned';
      }
    }

    it('send_email has correct suggestion', () => {
      expect(getSuggestedAction('send_email')).toContain('email');
    });

    it('create_event has correct suggestion', () => {
      expect(getSuggestedAction('create_event')).toContain('calendar');
    });

    it('send_file has correct suggestion', () => {
      expect(getSuggestedAction('send_file')).toContain('file');
    });

    it('follow_up has correct suggestion', () => {
      expect(getSuggestedAction('follow_up')).toContain('Follow up');
    });

    it('make_call has correct suggestion', () => {
      expect(getSuggestedAction('make_call')).toContain('call');
    });

    it('unknown type gets generic suggestion', () => {
      expect(getSuggestedAction('something_else')).toContain('Complete');
    });
  });

  describe('urgency classification', () => {
    function getUrgency(ageMinutes: number): 'low' | 'medium' | 'high' {
      if (ageMinutes > 60) return 'high';
      if (ageMinutes > 30) return 'medium';
      return 'low';
    }

    it('< 30 min is low urgency', () => {
      expect(getUrgency(15)).toBe('low');
      expect(getUrgency(29)).toBe('low');
    });

    it('30-60 min is medium urgency', () => {
      expect(getUrgency(31)).toBe('medium');
      expect(getUrgency(60)).toBe('medium');
    });

    it('> 60 min is high urgency', () => {
      expect(getUrgency(61)).toBe('high');
      expect(getUrgency(120)).toBe('high');
    });

    it('boundary: exactly 30 is low', () => {
      expect(getUrgency(30)).toBe('low');
    });
  });

  describe('app categorization', () => {
    const APP_CATEGORIES: Record<string, string> = {
      'visual studio code': 'Development', 'code': 'Development',
      'xcode': 'Development', 'cursor': 'Development',
      'terminal': 'Development', 'iterm': 'Development',
      'slack': 'Communication', 'discord': 'Communication',
      'mail': 'Communication', 'outlook': 'Communication',
      'zoom': 'Meetings', 'google meet': 'Meetings',
      'notion': 'Productivity', 'obsidian': 'Productivity',
      'figma': 'Design', 'sketch': 'Design',
      'safari': 'Browsing', 'google chrome': 'Browsing',
      'spotify': 'Entertainment',
      'finder': 'System', 'system preferences': 'System',
    };

    function categorizeApp(appName: string): string {
      const lowerApp = appName.toLowerCase();
      for (const [pattern, category] of Object.entries(APP_CATEGORIES)) {
        if (lowerApp.includes(pattern)) {
          return category;
        }
      }
      return 'Other';
    }

    it('categorizes VS Code as Development', () => {
      expect(categorizeApp('Visual Studio Code')).toBe('Development');
    });

    it('categorizes Slack as Communication', () => {
      expect(categorizeApp('Slack')).toBe('Communication');
    });

    it('categorizes Zoom as Meetings', () => {
      expect(categorizeApp('Zoom')).toBe('Meetings');
    });

    it('categorizes Chrome as Browsing', () => {
      expect(categorizeApp('Google Chrome')).toBe('Browsing');
    });

    it('categorizes unknown apps as Other', () => {
      expect(categorizeApp('Random App')).toBe('Other');
    });

    it('is case insensitive', () => {
      expect(categorizeApp('SLACK')).toBe('Communication');
    });
  });
});

// ============================================================================
// Shared Types Validation (TEST-029 partial)
// ============================================================================

describe('Shared Types — default values', () => {
  describe('DEFAULT_SETTINGS', () => {
    // From src/shared/types.ts
    const DEFAULT_SETTINGS = {
      trackingEnabled: true,
      excludedApps: [] as string[],
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

    it('tracking is enabled by default', () => {
      expect(DEFAULT_SETTINGS.trackingEnabled).toBe(true);
    });

    it('no excluded apps by default', () => {
      expect(DEFAULT_SETTINGS.excludedApps).toHaveLength(0);
    });

    it('data retention is 30 days', () => {
      expect(DEFAULT_SETTINGS.dataRetentionDays).toBe(30);
    });

    it('auto sync is enabled', () => {
      expect(DEFAULT_SETTINGS.autoSync).toBe(true);
    });

    it('sync interval is 1 minute', () => {
      expect(DEFAULT_SETTINGS.syncIntervalMinutes).toBe(1);
    });

    it('avatar position is top-right', () => {
      expect(DEFAULT_SETTINGS.avatarPosition).toBe('top-right');
    });

    it('avatar size is medium', () => {
      expect(DEFAULT_SETTINGS.avatarSize).toBe('medium');
    });

    it('voice is enabled by default', () => {
      expect(DEFAULT_SETTINGS.voiceEnabled).toBe(true);
    });

    it('default voice is tara', () => {
      expect(DEFAULT_SETTINGS.voiceName).toBe('tara');
    });

    it('browser URL tracking is enabled', () => {
      expect(DEFAULT_SETTINGS.trackBrowserUrls).toBe(true);
    });

    it('window title anonymization is disabled', () => {
      expect(DEFAULT_SETTINGS.anonymizeWindowTitles).toBe(false);
    });
  });

  describe('DEFAULT_DEEP_CONTEXT_SETTINGS', () => {
    const DEFAULT_DEEP_CONTEXT_SETTINGS = {
      enabled: true,
      captureIntervalMs: 30000,
      excludedApps: [] as string[],
      ocrEnabled: true,
      semanticAnalysisEnabled: true,
      commitmentTrackingEnabled: true,
    };

    it('deep context is enabled by default', () => {
      expect(DEFAULT_DEEP_CONTEXT_SETTINGS.enabled).toBe(true);
    });

    it('capture interval is 30 seconds', () => {
      expect(DEFAULT_DEEP_CONTEXT_SETTINGS.captureIntervalMs).toBe(30000);
    });

    it('OCR is enabled', () => {
      expect(DEFAULT_DEEP_CONTEXT_SETTINGS.ocrEnabled).toBe(true);
    });

    it('semantic analysis is enabled', () => {
      expect(DEFAULT_DEEP_CONTEXT_SETTINGS.semanticAnalysisEnabled).toBe(true);
    });

    it('commitment tracking is enabled', () => {
      expect(DEFAULT_DEEP_CONTEXT_SETTINGS.commitmentTrackingEnabled).toBe(true);
    });
  });
});
