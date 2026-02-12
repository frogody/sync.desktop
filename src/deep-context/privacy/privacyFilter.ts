/**
 * Privacy Filter
 *
 * Centralized privacy filtering for the deep context system.
 * All monitoring is opt-in and transparent. Raw screen content
 * never leaves the device — only structured events sync.
 *
 * Features:
 * - App exclusion (sensitive apps, password managers, banking)
 * - Domain exclusion (configurable)
 * - Time window exclusion (e.g., "don't capture after 6 PM")
 * - PII stripping (emails, phone numbers, card numbers, SSNs)
 * - Private/incognito browser window detection
 */

import { SENSITIVE_APP_PATTERNS, BROWSER_APPS } from '../../shared/constants';
import type { DeepContextEngineConfig } from '../types';

// ============================================================================
// Extended Sensitive Patterns
// ============================================================================

const SENSITIVE_APP_PATTERNS_EXTENDED = [
  // From shared constants
  ...SENSITIVE_APP_PATTERNS,
  // Banking & finance
  'banking',
  'chase',
  'wells fargo',
  'bank of america',
  'credit card',
  'venmo',
  'paypal',
  'zelle',
  'wise',
  'revolut',
  // Password managers
  '1password',
  'lastpass',
  'bitwarden',
  'dashlane',
  'keepass',
  'keychain',
  // Medical / health
  'medical',
  'health',
  'doctor',
  'pharmacy',
  'hipaa',
  'mychart',
  // Privacy indicators
  'private',
  'incognito',
  'vpn',
  // System / security
  'system preferences',
  'system settings',
  'security',
  'filevault',
];

const PRIVATE_WINDOW_PATTERNS = [
  'private browsing',
  'incognito',
  'inprivate',
  'private window',
  'private tab',
];

// ============================================================================
// Privacy Filter Class
// ============================================================================

export class PrivacyFilter {
  private excludedApps: Set<string>;
  private excludedDomains: Set<string>;
  private excludedTimeWindows: { start: number; end: number }[];

  constructor(config: DeepContextEngineConfig) {
    this.excludedApps = new Set(
      config.excludedApps.map((a) => a.toLowerCase())
    );
    this.excludedDomains = new Set(
      config.excludedDomains.map((d) => d.toLowerCase())
    );
    this.excludedTimeWindows = config.excludedTimeWindows.map((tw) => ({
      start: this.parseTimeToMinutes(tw.start),
      end: this.parseTimeToMinutes(tw.end),
    }));
  }

  // ============================================================================
  // Main Filter Check
  // ============================================================================

  /**
   * Check if we should capture data from this application/window.
   * Returns false if the app/window should be excluded.
   */
  shouldCapture(
    appName: string,
    windowTitle: string,
    url?: string
  ): boolean {
    const lowerApp = appName.toLowerCase();
    const lowerTitle = windowTitle.toLowerCase();

    // Check built-in sensitive app patterns
    if (this.isSensitiveApp(lowerApp)) {
      return false;
    }

    // Check user-configured excluded apps
    if (this.isUserExcludedApp(lowerApp)) {
      return false;
    }

    // Check for private/incognito browser windows
    if (this.isPrivateWindow(lowerApp, lowerTitle)) {
      return false;
    }

    // Check excluded domains (for browser URLs)
    if (url && this.isExcludedDomain(url)) {
      return false;
    }

    // Check time windows
    if (this.isExcludedTimeWindow()) {
      return false;
    }

    return true;
  }

  // ============================================================================
  // App Exclusion Checks
  // ============================================================================

  private isSensitiveApp(lowerAppName: string): boolean {
    return SENSITIVE_APP_PATTERNS_EXTENDED.some((pattern) =>
      lowerAppName.includes(pattern.toLowerCase())
    );
  }

  private isUserExcludedApp(lowerAppName: string): boolean {
    for (const excluded of this.excludedApps) {
      if (lowerAppName.includes(excluded)) {
        return true;
      }
    }
    return false;
  }

  private isPrivateWindow(lowerAppName: string, lowerTitle: string): boolean {
    // Check if this is a browser app
    const isBrowser = BROWSER_APPS.some(
      (browser) => lowerAppName.includes(browser.toLowerCase())
    );

    if (!isBrowser) return false;

    // Check window title for private browsing indicators
    return PRIVATE_WINDOW_PATTERNS.some((pattern) =>
      lowerTitle.includes(pattern)
    );
  }

  // ============================================================================
  // Domain Exclusion
  // ============================================================================

  private isExcludedDomain(url: string): boolean {
    if (this.excludedDomains.size === 0) return false;

    try {
      const hostname = new URL(url).hostname.toLowerCase();
      for (const domain of this.excludedDomains) {
        if (hostname === domain || hostname.endsWith('.' + domain)) {
          return true;
        }
      }
    } catch {
      // Invalid URL, don't exclude
    }

    return false;
  }

  // ============================================================================
  // Time Window Exclusion
  // ============================================================================

  private isExcludedTimeWindow(): boolean {
    if (this.excludedTimeWindows.length === 0) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const window of this.excludedTimeWindows) {
      if (window.start <= window.end) {
        // Normal range (e.g., 18:00 - 23:00)
        if (currentMinutes >= window.start && currentMinutes <= window.end) {
          return true;
        }
      } else {
        // Overnight range (e.g., 22:00 - 06:00)
        if (currentMinutes >= window.start || currentMinutes <= window.end) {
          return true;
        }
      }
    }

    return false;
  }

  private parseTimeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  }

  // ============================================================================
  // PII Stripping
  // ============================================================================

  /**
   * Strip personally identifiable information from text.
   * Replaces sensitive patterns with placeholder tokens.
   */
  stripPII(text: string): string {
    let sanitized = text;

    // Email addresses
    sanitized = sanitized.replace(
      /[\w.-]+@[\w.-]+\.\w+/g,
      '[email]'
    );

    // Credit card numbers (4 groups of 4 digits) — BEFORE phone pattern
    sanitized = sanitized.replace(
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
      '[card]'
    );

    // SSN-like patterns (XXX-XX-XXXX) — BEFORE phone pattern
    sanitized = sanitized.replace(
      /\b\d{3}-\d{2}-\d{4}\b/g,
      '[ssn]'
    );

    // IP addresses — BEFORE phone pattern
    sanitized = sanitized.replace(
      /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
      '[ip]'
    );

    // Phone numbers (various formats) — more specific pattern
    sanitized = sanitized.replace(
      /(?:\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g,
      '[phone]'
    );

    // API keys / tokens (long hex or base64 strings)
    sanitized = sanitized.replace(
      /\b[a-fA-F0-9]{32,}\b/g,
      '[token]'
    );

    // Bearer tokens
    sanitized = sanitized.replace(
      /Bearer\s+[A-Za-z0-9._-]+/gi,
      'Bearer [token]'
    );

    return sanitized;
  }

  // ============================================================================
  // Configuration Updates
  // ============================================================================

  updateConfig(config: Partial<DeepContextEngineConfig>): void {
    if (config.excludedApps) {
      this.excludedApps = new Set(
        config.excludedApps.map((a) => a.toLowerCase())
      );
    }
    if (config.excludedDomains) {
      this.excludedDomains = new Set(
        config.excludedDomains.map((d) => d.toLowerCase())
      );
    }
    if (config.excludedTimeWindows) {
      this.excludedTimeWindows = config.excludedTimeWindows.map((tw) => ({
        start: this.parseTimeToMinutes(tw.start),
        end: this.parseTimeToMinutes(tw.end),
      }));
    }
  }
}
