import { describe, it, expect, beforeEach } from 'vitest';
import { PrivacyFilter } from '../privacy/privacyFilter';
import type { DeepContextEngineConfig } from '../types';
import { DEFAULT_ENGINE_CONFIG } from '../types';

function makeConfig(overrides: Partial<DeepContextEngineConfig> = {}): DeepContextEngineConfig {
  return { ...DEFAULT_ENGINE_CONFIG, ...overrides };
}

describe('PrivacyFilter', () => {
  let filter: PrivacyFilter;

  beforeEach(() => {
    filter = new PrivacyFilter(makeConfig());
  });

  // ==========================================================================
  // App Exclusion
  // ==========================================================================

  describe('shouldCapture', () => {
    it('blocks password managers', () => {
      expect(filter.shouldCapture('1Password', 'Vault')).toBe(false);
      expect(filter.shouldCapture('LastPass', 'My Vault')).toBe(false);
      expect(filter.shouldCapture('Bitwarden', 'All Items')).toBe(false);
    });

    it('blocks banking apps', () => {
      expect(filter.shouldCapture('Chase Mobile', 'Accounts')).toBe(false);
      expect(filter.shouldCapture('Wells Fargo', 'Dashboard')).toBe(false);
      expect(filter.shouldCapture('Banking App', 'Balance')).toBe(false);
    });

    it('blocks medical/health apps', () => {
      expect(filter.shouldCapture('Medical Records', 'Patient')).toBe(false);
      expect(filter.shouldCapture('MyChart', 'Messages')).toBe(false);
    });

    it('blocks Keychain Access', () => {
      expect(filter.shouldCapture('Keychain Access', 'login')).toBe(false);
    });

    it('allows normal apps', () => {
      expect(filter.shouldCapture('Visual Studio Code', 'index.ts')).toBe(true);
      expect(filter.shouldCapture('Google Chrome', 'GitHub')).toBe(true);
      expect(filter.shouldCapture('Slack', '#general')).toBe(true);
      expect(filter.shouldCapture('Mail', 'Inbox')).toBe(true);
    });

    it('blocks private browser windows', () => {
      expect(filter.shouldCapture('Safari', 'Private Browsing - Google')).toBe(false);
      expect(filter.shouldCapture('Google Chrome', 'Incognito - New Tab')).toBe(false);
      expect(filter.shouldCapture('Firefox', 'Private Window - Search')).toBe(false);
    });

    it('allows non-private browser windows', () => {
      expect(filter.shouldCapture('Safari', 'Apple - Google Search')).toBe(true);
      expect(filter.shouldCapture('Google Chrome', 'GitHub - Trending')).toBe(true);
    });

    it('respects user-configured excluded apps', () => {
      const customFilter = new PrivacyFilter(makeConfig({
        excludedApps: ['Tinder', 'Personal App'],
      }));
      expect(customFilter.shouldCapture('Tinder', 'Messages')).toBe(false);
      expect(customFilter.shouldCapture('Personal App', 'Notes')).toBe(false);
      expect(customFilter.shouldCapture('Slack', '#work')).toBe(true);
    });
  });

  // ==========================================================================
  // Domain Exclusion
  // ==========================================================================

  describe('domain exclusion', () => {
    it('excludes configured domains', () => {
      const customFilter = new PrivacyFilter(makeConfig({
        excludedDomains: ['facebook.com', 'instagram.com'],
      }));
      expect(customFilter.shouldCapture('Chrome', 'Facebook', 'https://www.facebook.com/feed')).toBe(false);
      expect(customFilter.shouldCapture('Chrome', 'Instagram', 'https://instagram.com/explore')).toBe(false);
      expect(customFilter.shouldCapture('Chrome', 'GitHub', 'https://github.com')).toBe(true);
    });

    it('handles subdomain matching', () => {
      const customFilter = new PrivacyFilter(makeConfig({
        excludedDomains: ['example.com'],
      }));
      expect(customFilter.shouldCapture('Chrome', 'Sub', 'https://sub.example.com/page')).toBe(false);
      expect(customFilter.shouldCapture('Chrome', 'Other', 'https://notexample.com/page')).toBe(true);
    });

    it('handles invalid URLs gracefully', () => {
      const customFilter = new PrivacyFilter(makeConfig({
        excludedDomains: ['example.com'],
      }));
      // Invalid URL should not crash and should not be excluded
      expect(customFilter.shouldCapture('Chrome', 'Page', 'not-a-url')).toBe(true);
    });
  });

  // ==========================================================================
  // Time Window Exclusion
  // ==========================================================================

  describe('time window exclusion', () => {
    // Note: These tests depend on the current time, which makes them potentially flaky.
    // In production, you'd mock Date.now(). For Phase 1, we test the basic structure.

    it('accepts capture when no time windows configured', () => {
      expect(filter.shouldCapture('Code', 'index.ts')).toBe(true);
    });
  });

  // ==========================================================================
  // PII Stripping
  // ==========================================================================

  describe('stripPII', () => {
    it('strips email addresses', () => {
      const text = 'Send to john@example.com and jane.doe@company.org';
      const sanitized = filter.stripPII(text);
      expect(sanitized).not.toContain('john@example.com');
      expect(sanitized).not.toContain('jane.doe@company.org');
      expect(sanitized).toContain('[email]');
    });

    it('strips credit card numbers', () => {
      const text = 'Card: 4532 1234 5678 9012';
      const sanitized = filter.stripPII(text);
      expect(sanitized).not.toContain('4532 1234 5678 9012');
      expect(sanitized).toContain('[card]');
    });

    it('strips SSN-like patterns', () => {
      const text = 'SSN: 123-45-6789';
      const sanitized = filter.stripPII(text);
      expect(sanitized).not.toContain('123-45-6789');
      expect(sanitized).toContain('[ssn]');
    });

    it('strips IP addresses', () => {
      const text = 'Server at 192.168.1.100';
      const sanitized = filter.stripPII(text);
      expect(sanitized).not.toContain('192.168.1.100');
      expect(sanitized).toContain('[ip]');
    });

    it('strips long hex tokens', () => {
      const text = 'API key: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
      const sanitized = filter.stripPII(text);
      expect(sanitized).toContain('[token]');
    });

    it('strips Bearer tokens', () => {
      const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.token';
      const sanitized = filter.stripPII(text);
      expect(sanitized).toContain('Bearer [token]');
    });

    it('preserves non-PII text', () => {
      const text = 'Meeting with the team about the roadmap.';
      const sanitized = filter.stripPII(text);
      expect(sanitized).toBe(text);
    });
  });

  // ==========================================================================
  // Config Updates
  // ==========================================================================

  describe('updateConfig', () => {
    it('updates excluded apps', () => {
      filter.updateConfig({ excludedApps: ['NewApp'] });
      expect(filter.shouldCapture('NewApp', 'Window')).toBe(false);
    });

    it('updates excluded domains', () => {
      filter.updateConfig({ excludedDomains: ['blocked.com'] });
      expect(filter.shouldCapture('Chrome', 'Page', 'https://blocked.com')).toBe(false);
    });
  });
});
