/**
 * Accessibility Capture Service
 *
 * Reads text content directly from macOS windows using Accessibility APIs
 * (via AppleScript/JXA). No screenshots or OCR required.
 *
 * Captures:
 * - Focused UI element text and role (AXValue, AXRole, AXTitle)
 * - Window title and app name
 * - Visible text content from text editors, email compose windows
 * - Browser URL from address bar accessibility element
 *
 * Requires macOS Accessibility permission to be granted.
 */

import { execSync } from 'child_process';
import { EventEmitter } from 'events';
import { systemPreferences } from 'electron';
import type { AccessibilityCaptureResult, DeepContextEngineConfig } from '../types';

// ============================================================================
// Constants
// ============================================================================

const MAX_TEXT_LENGTH = 5000;
const EXEC_TIMEOUT_MS = 3000;

// ============================================================================
// Accessibility Capture Service
// ============================================================================

export class AccessibilityCaptureService extends EventEmitter {
  private captureInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private config: DeepContextEngineConfig;
  private lastTextHash: string | null = null;
  private captureCount: number = 0;
  private consecutiveErrors: number = 0;

  constructor(config: DeepContextEngineConfig) {
    super();
    this.config = config;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.isRunning) {
      console.log('[accessibility] Already running');
      return;
    }

    if (!this.config.enabled) {
      console.log('[accessibility] Deep context disabled, not starting');
      return;
    }

    // Check accessibility permission — use false to avoid triggering the dialog
    if (process.platform === 'darwin') {
      const hasPermission = systemPreferences.isTrustedAccessibilityClient(false);
      if (!hasPermission) {
        console.log('[accessibility] No accessibility permission — skipping capture');
        return;
      }
    }

    console.log('[accessibility] Starting capture service');
    console.log('[accessibility] Capture interval:', this.config.captureIntervalMs, 'ms');

    this.isRunning = true;
    this.consecutiveErrors = 0;

    // Initial capture after a short delay
    setTimeout(() => this.capture(), 1000);

    // Set up periodic captures
    this.captureInterval = setInterval(() => {
      this.capture();
    }, this.config.captureIntervalMs);
  }

  stop(): void {
    if (!this.isRunning) return;

    console.log('[accessibility] Stopping capture service');
    this.isRunning = false;

    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }
  }

  updateConfig(config: Partial<DeepContextEngineConfig>): void {
    this.config = { ...this.config, ...config };

    if (this.isRunning && config.captureIntervalMs) {
      this.stop();
      this.start();
    }
  }

  // ============================================================================
  // Capture
  // ============================================================================

  async capture(): Promise<AccessibilityCaptureResult | null> {
    if (!this.isRunning) return null;

    try {
      // Get focused window info + accessible text via AppleScript
      const result = await this.readAccessibilityData();

      if (!result) {
        return null;
      }

      // Deduplicate: skip if same text as last capture
      const textHash = this.hashText(result.visibleText || result.focusedElementText || result.windowTitle);
      if (textHash === this.lastTextHash) {
        return null;
      }
      this.lastTextHash = textHash;

      this.captureCount++;
      this.consecutiveErrors = 0;

      console.log(
        `[accessibility] Captured #${this.captureCount}: ${result.appName} - ${result.windowTitle.substring(0, 40)}`
      );

      this.emit('capture', result);
      return result;
    } catch (error) {
      this.consecutiveErrors++;

      // Only log every 5th error to avoid log spam
      if (this.consecutiveErrors % 5 === 1) {
        console.error('[accessibility] Capture failed:', error);
      }

      // If too many consecutive errors, back off
      if (this.consecutiveErrors >= 20) {
        console.error('[accessibility] Too many errors, stopping capture');
        this.stop();
      }

      return null;
    }
  }

  // ============================================================================
  // macOS Accessibility API (via AppleScript)
  // ============================================================================

  private async readAccessibilityData(): Promise<AccessibilityCaptureResult | null> {
    if (process.platform !== 'darwin') {
      // TODO: Windows UI Automation support in Phase 2
      return null;
    }

    try {
      // Single AppleScript that reads everything we need
      const script = `
        tell application "System Events"
          set frontApp to first application process whose frontmost is true
          set appName to name of frontApp

          -- Get window title
          set windowTitle to ""
          try
            set windowTitle to name of first window of frontApp
          end try

          -- Get focused element info
          set focusedText to ""
          set focusedRole to ""
          try
            set focusedElement to focused UI element of frontApp
            set focusedRole to role of focusedElement as text
            try
              set focusedText to value of focusedElement as text
            end try
            if focusedText is "" then
              try
                set focusedText to description of focusedElement as text
              end try
            end if
            if focusedText is "" then
              try
                set focusedText to title of focusedElement as text
              end try
            end if
          end try

          -- Get visible text from the window (read first text area or text field)
          set visibleText to ""
          try
            set firstWindow to first window of frontApp
            -- Try to find a text area (editors, compose windows)
            try
              set allTextAreas to every text area of firstWindow
              if (count of allTextAreas) > 0 then
                set visibleText to value of first item of allTextAreas as text
              end if
            end try
            -- If no text area found, try text fields
            if visibleText is "" then
              try
                set allTextFields to every text field of firstWindow
                if (count of allTextFields) > 0 then
                  repeat with tf in allTextFields
                    set tfValue to value of tf as text
                    if length of tfValue > length of visibleText then
                      set visibleText to tfValue
                    end if
                  end repeat
                end if
              end try
            end if
            -- Try scroll areas (for apps like Safari, Chrome)
            if visibleText is "" then
              try
                set allScrollAreas to every scroll area of firstWindow
                if (count of allScrollAreas) > 0 then
                  set firstScroll to first item of allScrollAreas
                  try
                    set allInnerTextAreas to every text area of firstScroll
                    if (count of allInnerTextAreas) > 0 then
                      set visibleText to value of first item of allInnerTextAreas as text
                    end if
                  end try
                end if
              end try
            end if
          end try

          -- Truncate visibleText to avoid massive output
          if length of visibleText > 5000 then
            set visibleText to text 1 thru 5000 of visibleText
          end if

          -- Build output with delimiters
          return appName & "|||" & windowTitle & "|||" & focusedText & "|||" & focusedRole & "|||" & visibleText
        end tell
      `;

      const output = execSync(
        `osascript -e '${script.replace(/'/g, "'\"'\"'")}'`,
        {
          encoding: 'utf-8',
          timeout: EXEC_TIMEOUT_MS,
          maxBuffer: 1024 * 1024, // 1MB
        }
      ).trim();

      const [appName, windowTitle, focusedText, focusedRole, visibleText] = output.split('|||');

      if (!appName) return null;

      // Extract URL from browser window titles
      const url = this.extractUrlFromTitle(appName, windowTitle || '');

      return {
        timestamp: Date.now(),
        appName: appName.trim(),
        windowTitle: (windowTitle || '').trim(),
        focusedElementText: (focusedText || '').trim().substring(0, MAX_TEXT_LENGTH),
        focusedElementRole: (focusedRole || '').trim(),
        visibleText: (visibleText || '').trim().substring(0, MAX_TEXT_LENGTH),
        url,
      };
    } catch (error) {
      // Check if it's a timeout (user may be in a full-screen app that blocks AppleScript)
      if (error instanceof Error && error.message.includes('ETIMEDOUT')) {
        return null;
      }
      throw error;
    }
  }

  // ============================================================================
  // URL Extraction
  // ============================================================================

  private extractUrlFromTitle(appName: string, windowTitle: string): string | undefined {
    // Try to get URL from browser via AppleScript
    const lowerApp = appName.toLowerCase();
    const browsers: Record<string, string> = {
      'google chrome': 'Google Chrome',
      'chrome': 'Google Chrome',
      'safari': 'Safari',
      'firefox': 'Firefox',
      'arc': 'Arc',
      'brave browser': 'Brave Browser',
      'microsoft edge': 'Microsoft Edge',
    };

    let browserName: string | undefined;
    for (const [pattern, name] of Object.entries(browsers)) {
      if (lowerApp.includes(pattern)) {
        browserName = name;
        break;
      }
    }

    if (!browserName) return undefined;

    try {
      let urlScript: string;

      if (browserName === 'Safari') {
        urlScript = `tell application "Safari" to return URL of current tab of front window`;
      } else if (browserName === 'Arc') {
        // Arc doesn't have standard AppleScript support for URL
        // Fall back to extracting from window title
        return this.extractUrlFromWindowTitle(windowTitle);
      } else {
        // Chrome, Brave, Edge — Chromium-based
        urlScript = `tell application "${browserName}" to return URL of active tab of front window`;
      }

      const url = execSync(
        `osascript -e '${urlScript.replace(/'/g, "'\"'\"'")}'`,
        {
          encoding: 'utf-8',
          timeout: 1000,
        }
      ).trim();

      return url || undefined;
    } catch {
      // Browser URL extraction is best-effort
      return this.extractUrlFromWindowTitle(windowTitle);
    }
  }

  private extractUrlFromWindowTitle(title: string): string | undefined {
    // Some browsers include the URL or domain in the window title
    const urlMatch = title.match(/https?:\/\/[^\s]+/);
    if (urlMatch) return urlMatch[0];

    // Try to extract domain-like patterns (e.g., "example.com - Page Title")
    const domainMatch = title.match(/^([\w.-]+\.\w{2,})\s/);
    if (domainMatch) return `https://${domainMatch[1]}`;

    return undefined;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private hashText(text: string): string {
    if (!text) return '';
    // Simple hash for deduplication — not cryptographic
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 500); i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return String(hash);
  }

  // ============================================================================
  // Status
  // ============================================================================

  isActive(): boolean {
    return this.isRunning;
  }

  getStats(): {
    isRunning: boolean;
    captureCount: number;
    consecutiveErrors: number;
  } {
    return {
      isRunning: this.isRunning,
      captureCount: this.captureCount,
      consecutiveErrors: this.consecutiveErrors,
    };
  }
}
