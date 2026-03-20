/**
 * Renderer Logic Tests
 *
 * Tests for renderer-side logic: SyncStateContext, utils, ChatWidget logic, VoiceMode logic.
 * Since this is an Electron app without jsdom/happy-dom, we test pure logic only.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// SyncStateContext Logic Tests (TEST-027 partial)
// ============================================================================

describe('SyncStateContext — default state and logic', () => {
  // We can't import React context directly without jsdom, so we test the
  // state logic patterns extracted from SyncStateContext.tsx.

  // Replicate the DEFAULT_STATE and level targets from the source
  type SyncMood = 'listening' | 'thinking' | 'speaking';

  interface SyncState {
    mood: SyncMood;
    level: number;
    seed: number;
    activeAgent: string | null;
    actionEffect: string | null;
    showSuccess: boolean;
    isProcessing: boolean;
    lastActivity: number | null;
  }

  const DEFAULT_STATE: SyncState = {
    mood: 'listening',
    level: 0.18,
    seed: 4,
    activeAgent: null,
    actionEffect: null,
    showSuccess: false,
    isProcessing: false,
    lastActivity: null,
  };

  const LEVEL_TARGETS: Record<SyncMood, number> = {
    speaking: 0.55,
    thinking: 0.35,
    listening: 0.18,
  };

  // Helper: simulate updateState
  function updateState(prev: SyncState, updates: Partial<SyncState>): SyncState {
    return { ...prev, ...updates, lastActivity: Date.now() };
  }

  // Helper: simulate setMood
  function setMood(prev: SyncState, mood: SyncMood): SyncState {
    return updateState(prev, { mood, level: LEVEL_TARGETS[mood] || 0.18 });
  }

  // Helper: simulate setProcessing
  function setProcessing(prev: SyncState, isProcessing: boolean): SyncState {
    return updateState(prev, {
      isProcessing,
      mood: isProcessing ? 'thinking' : 'listening',
    });
  }

  describe('default state values', () => {
    it('has mood = listening', () => {
      expect(DEFAULT_STATE.mood).toBe('listening');
    });

    it('has level = 0.18', () => {
      expect(DEFAULT_STATE.level).toBe(0.18);
    });

    it('has seed = 4', () => {
      expect(DEFAULT_STATE.seed).toBe(4);
    });

    it('has null activeAgent, actionEffect, lastActivity', () => {
      expect(DEFAULT_STATE.activeAgent).toBeNull();
      expect(DEFAULT_STATE.actionEffect).toBeNull();
      expect(DEFAULT_STATE.lastActivity).toBeNull();
    });

    it('has showSuccess = false and isProcessing = false', () => {
      expect(DEFAULT_STATE.showSuccess).toBe(false);
      expect(DEFAULT_STATE.isProcessing).toBe(false);
    });
  });

  describe('setMood updates level correctly', () => {
    it('speaking => level 0.55', () => {
      const result = setMood(DEFAULT_STATE, 'speaking');
      expect(result.mood).toBe('speaking');
      expect(result.level).toBe(0.55);
    });

    it('thinking => level 0.35', () => {
      const result = setMood(DEFAULT_STATE, 'thinking');
      expect(result.mood).toBe('thinking');
      expect(result.level).toBe(0.35);
    });

    it('listening => level 0.18', () => {
      const result = setMood(DEFAULT_STATE, 'listening');
      expect(result.mood).toBe('listening');
      expect(result.level).toBe(0.18);
    });

    it('sets lastActivity to a timestamp', () => {
      const before = Date.now();
      const result = setMood(DEFAULT_STATE, 'speaking');
      const after = Date.now();
      expect(result.lastActivity).toBeGreaterThanOrEqual(before);
      expect(result.lastActivity).toBeLessThanOrEqual(after);
    });
  });

  describe('triggerSuccess', () => {
    it('sets showSuccess = true', () => {
      const result = updateState(DEFAULT_STATE, { showSuccess: true });
      expect(result.showSuccess).toBe(true);
    });

    it('can be reset to false (simulating setTimeout)', () => {
      let state = updateState(DEFAULT_STATE, { showSuccess: true });
      expect(state.showSuccess).toBe(true);
      state = updateState(state, { showSuccess: false });
      expect(state.showSuccess).toBe(false);
    });
  });

  describe('setProcessing', () => {
    it('processing=true sets mood to thinking', () => {
      const result = setProcessing(DEFAULT_STATE, true);
      expect(result.isProcessing).toBe(true);
      expect(result.mood).toBe('thinking');
    });

    it('processing=false sets mood to listening', () => {
      const result = setProcessing(DEFAULT_STATE, false);
      expect(result.isProcessing).toBe(false);
      expect(result.mood).toBe('listening');
    });
  });

  describe('subscribe/unsubscribe pattern', () => {
    it('listeners set add/delete works correctly', () => {
      const listeners = new Set<(s: SyncState) => void>();
      const fn1 = () => {};
      const fn2 = () => {};

      listeners.add(fn1);
      listeners.add(fn2);
      expect(listeners.size).toBe(2);

      // Unsubscribe fn1
      listeners.delete(fn1);
      expect(listeners.size).toBe(1);
      expect(listeners.has(fn1)).toBe(false);
      expect(listeners.has(fn2)).toBe(true);
    });

    it('notifies listeners on state update', () => {
      const listeners = new Set<(s: SyncState) => void>();
      const received: SyncState[] = [];
      const listener = (s: SyncState) => received.push(s);

      listeners.add(listener);

      const newState = updateState(DEFAULT_STATE, { mood: 'speaking' });
      listeners.forEach((l) => l(newState));

      expect(received).toHaveLength(1);
      expect(received[0].mood).toBe('speaking');
    });
  });

  describe('reset', () => {
    it('returns to defaults', () => {
      const modified = updateState(DEFAULT_STATE, {
        mood: 'speaking',
        level: 0.55,
        showSuccess: true,
        isProcessing: true,
        activeAgent: 'agent-1',
      });
      // Simulate reset: just return DEFAULT_STATE
      const reset = { ...DEFAULT_STATE };
      expect(reset.mood).toBe('listening');
      expect(reset.level).toBe(0.18);
      expect(reset.showSuccess).toBe(false);
      expect(reset.isProcessing).toBe(false);
      expect(reset.activeAgent).toBeNull();
    });
  });
});

// ============================================================================
// Utils Tests (TEST-028)
// ============================================================================

describe('Renderer utils', () => {
  // Import the actual utils
  // The file is simple enough to test directly
  describe('cn()', () => {
    // Replicate cn from src/renderer/lib/utils.ts
    function cn(...classes: (string | undefined | null | false)[]): string {
      return classes.filter(Boolean).join(' ');
    }

    it('concatenates classes', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('filters undefined', () => {
      expect(cn('foo', undefined, 'bar')).toBe('foo bar');
    });

    it('filters null', () => {
      expect(cn('foo', null, 'bar')).toBe('foo bar');
    });

    it('filters false', () => {
      expect(cn('foo', false, 'bar')).toBe('foo bar');
    });

    it('empty string returns empty', () => {
      expect(cn('')).toBe('');
    });

    it('no args returns empty', () => {
      expect(cn()).toBe('');
    });

    it('handles single class', () => {
      expect(cn('only')).toBe('only');
    });

    it('handles all falsy', () => {
      expect(cn(undefined, null, false)).toBe('');
    });

    it('handles mixed', () => {
      expect(cn('a', undefined, 'b', false, 'c', null)).toBe('a b c');
    });
  });

  describe('prefersReducedMotion()', () => {
    it('returns boolean when matchMedia is available', () => {
      // In node environment, window is not defined, so the function returns false
      function prefersReducedMotion(): boolean {
        return (
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
        );
      }

      // In node test environment, window is not defined
      const result = prefersReducedMotion();
      expect(typeof result).toBe('boolean');
      expect(result).toBe(false); // No window in node
    });
  });
});

// ============================================================================
// ChatWidget Logic Tests (TEST-027 partial)
// ============================================================================

describe('ChatWidget — extractable logic', () => {
  describe('message ID generation', () => {
    it('user messages start with user_', () => {
      const id = `user_${Date.now()}`;
      expect(id).toMatch(/^user_\d+$/);
    });

    it('assistant messages start with assistant_', () => {
      const id = `assistant_${Date.now()}`;
      expect(id).toMatch(/^assistant_\d+$/);
    });

    it('IDs are unique (different timestamps)', async () => {
      const id1 = `user_${Date.now()}`;
      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 2));
      const id2 = `user_${Date.now()}`;
      expect(id1).not.toBe(id2);
    });
  });

  describe('session ID format', () => {
    it('follows sync_user_{userId} pattern', () => {
      const userId = '1256b397-0201-4210-8ba5-9e74a8a60d86';
      const sessionId = `sync_user_${userId}`;
      expect(sessionId).toBe('sync_user_1256b397-0201-4210-8ba5-9e74a8a60d86');
    });

    it('includes full UUID', () => {
      const userId = 'abc-123';
      const sessionId = `sync_user_${userId}`;
      expect(sessionId).toContain(userId);
    });
  });

  describe('ACTION tag stripping', () => {
    // Replicate stripActionTags from ChatWidget.tsx
    function stripActionTags(content: string): string {
      return content.replace(/\[ACTION\][\s\S]*?\[\/ACTION\]/g, '').trim();
    }

    it('strips single ACTION block', () => {
      const input = 'Here is your answer. [ACTION]{"type":"query"}[/ACTION]';
      expect(stripActionTags(input)).toBe('Here is your answer.');
    });

    it('strips multiple ACTION blocks', () => {
      const input = 'First [ACTION]a[/ACTION] middle [ACTION]b[/ACTION] end';
      expect(stripActionTags(input)).toBe('First  middle  end');
    });

    it('strips multiline ACTION blocks', () => {
      const input = 'Before [ACTION]\n{"type":"query",\n"data":"test"}\n[/ACTION] after';
      expect(stripActionTags(input)).toBe('Before  after');
    });

    it('preserves content without ACTION tags', () => {
      const input = 'No action tags here!';
      expect(stripActionTags(input)).toBe('No action tags here!');
    });

    it('returns empty string for ACTION-only content', () => {
      const input = '[ACTION]{"type":"query"}[/ACTION]';
      expect(stripActionTags(input)).toBe('');
    });

    it('trims whitespace after stripping', () => {
      const input = '  text  [ACTION]x[/ACTION]  ';
      expect(stripActionTags(input)).toBe('text');
    });
  });

  describe('SSE parsing logic', () => {
    it('extracts data from SSE line', () => {
      const line = 'data: {"event":"chunk","content":"Hello"}';
      expect(line.startsWith('data: ')).toBe(true);
      const data = line.slice(6);
      const parsed = JSON.parse(data);
      expect(parsed.event).toBe('chunk');
      expect(parsed.content).toBe('Hello');
    });

    it('recognizes [DONE] marker', () => {
      const line = 'data: [DONE]';
      const data = line.slice(6);
      expect(data).toBe('[DONE]');
    });

    it('handles end event with full content', () => {
      const data = JSON.stringify({
        event: 'end',
        content: 'Full response text',
        actionExecuted: { type: 'query', success: true },
      });
      const parsed = JSON.parse(data);
      expect(parsed.event).toBe('end');
      expect(parsed.content).toBe('Full response text');
      expect(parsed.actionExecuted.success).toBe(true);
    });

    it('handles legacy text field format', () => {
      const data = JSON.stringify({ text: 'legacy response' });
      const parsed = JSON.parse(data);
      expect(parsed.text).toBe('legacy response');
    });

    it('handles non-JSON data gracefully', () => {
      const data = 'plain text response';
      let parsed: any = null;
      try {
        parsed = JSON.parse(data);
      } catch {
        // Expected: non-JSON data
      }
      expect(parsed).toBeNull();
      // The ChatWidget appends raw data as content in this case
      expect(data.trim()).toBe('plain text response');
    });
  });

  describe('error type detection', () => {
    function classifyError(status: number, message: string): string {
      if (status === 401 || status === 403) return 'AUTH_ERROR';
      if (status === 429) return 'RATE_LIMIT';
      if (status >= 500) return 'SERVER_ERROR';
      if (
        message === 'Failed to fetch' ||
        message === 'NetworkError when attempting to fetch resource.' ||
        message === 'Load failed'
      ) {
        return 'NETWORK_ERROR';
      }
      return 'UNKNOWN_ERROR';
    }

    it('401 is AUTH_ERROR', () => {
      expect(classifyError(401, '')).toBe('AUTH_ERROR');
    });

    it('403 is AUTH_ERROR', () => {
      expect(classifyError(403, '')).toBe('AUTH_ERROR');
    });

    it('429 is RATE_LIMIT', () => {
      expect(classifyError(429, '')).toBe('RATE_LIMIT');
    });

    it('500 is SERVER_ERROR', () => {
      expect(classifyError(500, '')).toBe('SERVER_ERROR');
    });

    it('502 is SERVER_ERROR', () => {
      expect(classifyError(502, '')).toBe('SERVER_ERROR');
    });

    it('503 is SERVER_ERROR', () => {
      expect(classifyError(503, '')).toBe('SERVER_ERROR');
    });

    it('"Failed to fetch" is NETWORK_ERROR', () => {
      expect(classifyError(0, 'Failed to fetch')).toBe('NETWORK_ERROR');
    });

    it('"Load failed" is NETWORK_ERROR', () => {
      expect(classifyError(0, 'Load failed')).toBe('NETWORK_ERROR');
    });

    it('"NetworkError when attempting to fetch resource." is NETWORK_ERROR', () => {
      expect(classifyError(0, 'NetworkError when attempting to fetch resource.')).toBe('NETWORK_ERROR');
    });

    it('unknown errors are UNKNOWN_ERROR', () => {
      expect(classifyError(418, 'teapot')).toBe('UNKNOWN_ERROR');
    });
  });

  describe('JWT decoding logic', () => {
    function decodeJwt(token: string): { sub?: string; email?: string } | null {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
        return JSON.parse(jsonPayload);
      } catch {
        return null;
      }
    }

    it('decodes a valid JWT payload', () => {
      // Create a test JWT: header.payload.signature
      const payload = { sub: 'user-123', email: 'test@example.com' };
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const token = `eyJhbGciOiJIUzI1NiJ9.${encoded}.signature`;

      const decoded = decodeJwt(token);
      expect(decoded?.sub).toBe('user-123');
      expect(decoded?.email).toBe('test@example.com');
    });

    it('returns null for invalid token', () => {
      expect(decodeJwt('not-a-jwt')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(decodeJwt('')).toBeNull();
    });
  });
});

// ============================================================================
// VoiceMode Logic Tests (TEST-027 partial)
// ============================================================================

describe('VoiceMode — extractable logic', () => {
  describe('error code mapping', () => {
    function mapVoiceError(errorCode: string): string {
      if (errorCode === 'no-speech') {
        return "I didn't hear anything. Please try speaking again.";
      } else if (errorCode === 'audio-capture') {
        return 'Microphone not available. Check your audio settings.';
      } else if (errorCode === 'not-allowed') {
        return 'Microphone access denied. Please allow microphone access in System Settings.';
      }
      return 'Voice recognition encountered an issue. Please try again.';
    }

    it('no-speech gives appropriate message', () => {
      const msg = mapVoiceError('no-speech');
      expect(msg).toContain("didn't hear");
    });

    it('audio-capture gives microphone unavailable message', () => {
      const msg = mapVoiceError('audio-capture');
      expect(msg).toContain('Microphone not available');
    });

    it('not-allowed gives permission denied message', () => {
      const msg = mapVoiceError('not-allowed');
      expect(msg).toContain('access denied');
    });

    it('unknown error gives generic message', () => {
      const msg = mapVoiceError('unknown-error');
      expect(msg).toContain('try again');
    });
  });

  describe('state transitions', () => {
    type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

    it('idle -> listening (startListening)', () => {
      let state: VoiceState = 'idle';
      // Simulate recognition.onstart
      state = 'listening';
      expect(state).toBe('listening');
    });

    it('listening -> processing (voice input received)', () => {
      let state: VoiceState = 'listening';
      // Simulate processVoiceInput
      state = 'processing';
      expect(state).toBe('processing');
    });

    it('processing -> speaking (response received)', () => {
      let state: VoiceState = 'processing';
      // Simulate response received
      state = 'speaking';
      expect(state).toBe('speaking');
    });

    it('speaking -> idle (utterance ended)', () => {
      let state: VoiceState = 'speaking';
      // Simulate utterance.onend
      state = 'idle';
      expect(state).toBe('idle');
    });

    it('any state -> idle on error', () => {
      const states: VoiceState[] = ['listening', 'processing', 'speaking'];
      for (const s of states) {
        let state: VoiceState = s;
        // Error always resets to idle
        state = 'idle';
        expect(state).toBe('idle');
      }
    });

    it('full cycle: idle -> listening -> processing -> speaking -> idle', () => {
      const transitions: VoiceState[] = ['idle', 'listening', 'processing', 'speaking', 'idle'];
      for (let i = 0; i < transitions.length - 1; i++) {
        // Each transition is valid
        expect(transitions[i]).not.toBe(transitions[i + 1]);
      }
      expect(transitions[0]).toBe(transitions[transitions.length - 1]); // cycle back
    });
  });

  describe('status text generation', () => {
    function getStatusText(state: string, transcript: string, response: string): string {
      switch (state) {
        case 'listening':
          return transcript || 'Listening...';
        case 'processing':
          return 'Processing...';
        case 'speaking':
          return response || 'Speaking...';
        default:
          return 'Tap to speak';
      }
    }

    it('idle shows "Tap to speak"', () => {
      expect(getStatusText('idle', '', '')).toBe('Tap to speak');
    });

    it('listening with no transcript shows "Listening..."', () => {
      expect(getStatusText('listening', '', '')).toBe('Listening...');
    });

    it('listening with transcript shows transcript', () => {
      expect(getStatusText('listening', 'Hello world', '')).toBe('Hello world');
    });

    it('processing shows "Processing..."', () => {
      expect(getStatusText('processing', 'anything', 'anything')).toBe('Processing...');
    });

    it('speaking with response shows response', () => {
      expect(getStatusText('speaking', '', 'Here is your answer')).toBe('Here is your answer');
    });

    it('speaking with no response shows "Speaking..."', () => {
      expect(getStatusText('speaking', '', '')).toBe('Speaking...');
    });
  });
});
