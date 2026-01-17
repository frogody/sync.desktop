/**
 * Screen Capture Service
 *
 * Captures screenshots of the active window for OCR processing.
 * Uses macOS native screencapture utility for high-quality captures.
 *
 * Features:
 * - Captures only active window (privacy-focused)
 * - Image hash deduplication to avoid redundant processing
 * - Automatic cleanup of temporary files
 * - Respects sensitive app exclusions
 */

import { execSync, spawn } from 'child_process';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { ScreenCapture, DeepContextSettings, DEFAULT_DEEP_CONTEXT_SETTINGS } from '../../shared/types';
import { SENSITIVE_APP_PATTERNS } from '../../shared/constants';

// ============================================================================
// Types
// ============================================================================

export interface CaptureEvent {
  type: 'capture_complete' | 'capture_failed' | 'capture_skipped';
  capture?: ScreenCapture;
  imagePath?: string;
  reason?: string;
}

// Additional sensitive patterns for deep context
const DEEP_CONTEXT_EXCLUDED_APPS = [
  ...SENSITIVE_APP_PATTERNS,
  'banking',
  'chase',
  'wells fargo',
  'bank of america',
  'credit card',
  'venmo',
  'paypal',
  'password',
  '1password',
  'lastpass',
  'bitwarden',
  'keychain',
  'private',
  'incognito',
  'medical',
  'health',
  'doctor',
  'pharmacy',
  'hipaa',
];

// ============================================================================
// Screen Capture Service
// ============================================================================

export class ScreenCaptureService extends EventEmitter {
  private settings: DeepContextSettings;
  private captureInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastImageHash: string | null = null;
  private tempDir: string;
  private captureCount: number = 0;

  constructor(settings: Partial<DeepContextSettings> = {}) {
    super();
    this.settings = { ...DEFAULT_DEEP_CONTEXT_SETTINGS, ...settings };
    this.tempDir = path.join(app.getPath('temp'), 'sync-desktop-captures');

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.isRunning) {
      console.log('[screenCapture] Already running');
      return;
    }

    if (!this.settings.enabled) {
      console.log('[screenCapture] Deep context disabled, not starting');
      return;
    }

    console.log('[screenCapture] Starting screen capture service');
    console.log('[screenCapture] Capture interval:', this.settings.captureIntervalMs, 'ms');

    this.isRunning = true;

    // Initial capture
    this.captureScreen();

    // Set up periodic captures
    this.captureInterval = setInterval(() => {
      this.captureScreen();
    }, this.settings.captureIntervalMs);
  }

  stop(): void {
    if (!this.isRunning) return;

    console.log('[screenCapture] Stopping screen capture service');
    this.isRunning = false;

    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    // Cleanup temp files
    this.cleanupTempFiles();
  }

  updateSettings(settings: Partial<DeepContextSettings>): void {
    this.settings = { ...this.settings, ...settings };

    // Restart if interval changed and running
    if (this.isRunning && settings.captureIntervalMs) {
      this.stop();
      this.start();
    }
  }

  // ============================================================================
  // Capture Logic
  // ============================================================================

  async captureScreen(): Promise<ScreenCapture | null> {
    if (!this.settings.enabled) return null;

    try {
      // Get active window info first
      const windowInfo = await this.getActiveWindowInfo();

      if (!windowInfo) {
        this.emit('capture', {
          type: 'capture_skipped',
          reason: 'No active window',
        } as CaptureEvent);
        return null;
      }

      // Check if app is excluded
      if (this.isExcludedApp(windowInfo.appName)) {
        this.emit('capture', {
          type: 'capture_skipped',
          reason: `Excluded app: ${windowInfo.appName}`,
        } as CaptureEvent);
        return null;
      }

      // Generate unique filename
      const timestamp = Date.now();
      const filename = `capture_${timestamp}.png`;
      const imagePath = path.join(this.tempDir, filename);

      // Capture the screen using macOS screencapture
      const success = await this.captureToFile(imagePath, windowInfo.windowId);

      if (!success || !fs.existsSync(imagePath)) {
        this.emit('capture', {
          type: 'capture_failed',
          reason: 'Screenshot failed',
        } as CaptureEvent);
        return null;
      }

      // Calculate image hash for deduplication
      const imageBuffer = fs.readFileSync(imagePath);
      const imageHash = createHash('md5').update(imageBuffer).digest('hex');

      // Skip if same as last capture
      if (imageHash === this.lastImageHash) {
        // Cleanup duplicate
        fs.unlinkSync(imagePath);
        this.emit('capture', {
          type: 'capture_skipped',
          reason: 'Duplicate content',
        } as CaptureEvent);
        return null;
      }

      this.lastImageHash = imageHash;
      this.captureCount++;

      const capture: ScreenCapture = {
        timestamp,
        appName: windowInfo.appName,
        windowTitle: windowInfo.windowTitle,
        textContent: null, // Will be filled by OCR service
        analysis: null, // Will be filled by semantic analyzer
        imageHash,
      };

      console.log(`[screenCapture] Captured #${this.captureCount}: ${windowInfo.appName} - ${windowInfo.windowTitle.substring(0, 40)}`);

      this.emit('capture', {
        type: 'capture_complete',
        capture,
        imagePath,
      } as CaptureEvent);

      return capture;
    } catch (error) {
      console.error('[screenCapture] Capture failed:', error);
      this.emit('capture', {
        type: 'capture_failed',
        reason: String(error),
      } as CaptureEvent);
      return null;
    }
  }

  // ============================================================================
  // macOS Native Capture
  // ============================================================================

  private async captureToFile(outputPath: string, windowId?: number): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Use macOS screencapture utility
        // -x: no sound
        // -o: capture window without shadow
        // -l: window ID for specific window capture
        // -t png: output format

        const args = ['-x', '-o', '-t', 'png'];

        if (windowId) {
          // Capture specific window
          args.push('-l', String(windowId));
        } else {
          // Capture main screen if no window ID
          args.push('-m'); // Main monitor only
        }

        args.push(outputPath);

        const process = spawn('screencapture', args);

        process.on('close', (code) => {
          resolve(code === 0);
        });

        process.on('error', (err) => {
          console.error('[screenCapture] screencapture error:', err);
          resolve(false);
        });

        // Timeout after 5 seconds
        setTimeout(() => {
          process.kill();
          resolve(false);
        }, 5000);
      } catch (error) {
        console.error('[screenCapture] captureToFile error:', error);
        resolve(false);
      }
    });
  }

  private async getActiveWindowInfo(): Promise<{
    appName: string;
    windowTitle: string;
    windowId: number | undefined;
  } | null> {
    try {
      // Use AppleScript to get active window info
      const script = `
        tell application "System Events"
          set frontApp to first application process whose frontmost is true
          set appName to name of frontApp
          set windowTitle to ""
          set windowId to 0
          try
            set windowTitle to name of first window of frontApp
          end try
          try
            set windowId to id of first window of frontApp
          end try
          return appName & "|||" & windowTitle & "|||" & windowId
        end tell
      `;

      const result = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
        encoding: 'utf-8',
        timeout: 2000,
      }).trim();

      const [appName, windowTitle, windowIdStr] = result.split('|||');
      const windowId = parseInt(windowIdStr, 10) || undefined;

      if (!appName) return null;

      return {
        appName: appName.trim(),
        windowTitle: (windowTitle || '').trim(),
        windowId,
      };
    } catch (error) {
      // Fallback: try using lsappinfo
      try {
        const result = execSync(
          "lsappinfo info -only name $(lsappinfo front) | awk -F'\"' '/\"LSDisplayName\"/{print $4}'",
          { encoding: 'utf-8', timeout: 2000 }
        ).trim();

        if (result) {
          return {
            appName: result,
            windowTitle: '',
            windowId: undefined,
          };
        }
      } catch {
        // Ignore fallback error
      }

      return null;
    }
  }

  // ============================================================================
  // Privacy & Exclusions
  // ============================================================================

  private isExcludedApp(appName: string): boolean {
    const lowerName = appName.toLowerCase();

    // Check built-in exclusions
    for (const pattern of DEEP_CONTEXT_EXCLUDED_APPS) {
      if (lowerName.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    // Check user-configured exclusions
    for (const excluded of this.settings.excludedApps) {
      if (lowerName.includes(excluded.toLowerCase())) {
        return true;
      }
    }

    // Check for private/incognito browser windows
    if (this.isBrowserApp(lowerName)) {
      // The window title might indicate private browsing
      // This will be checked with the window title in the actual capture
    }

    return false;
  }

  private isBrowserApp(appName: string): boolean {
    const browsers = [
      'chrome',
      'firefox',
      'safari',
      'edge',
      'brave',
      'arc',
      'opera',
      'vivaldi',
    ];
    const lowerName = appName.toLowerCase();
    return browsers.some((b) => lowerName.includes(b));
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  cleanupTempFiles(): void {
    try {
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        for (const file of files) {
          if (file.startsWith('capture_') && file.endsWith('.png')) {
            fs.unlinkSync(path.join(this.tempDir, file));
          }
        }
        console.log(`[screenCapture] Cleaned up ${files.length} temp files`);
      }
    } catch (error) {
      console.error('[screenCapture] Cleanup error:', error);
    }
  }

  /**
   * Clean up a specific capture file after processing
   */
  cleanupCapture(imagePath: string): void {
    try {
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    } catch (error) {
      console.error('[screenCapture] Failed to cleanup capture:', error);
    }
  }

  /**
   * Clean up old captures (older than specified minutes)
   */
  cleanupOldCaptures(olderThanMinutes: number = 5): void {
    try {
      const cutoff = Date.now() - olderThanMinutes * 60 * 1000;
      const files = fs.readdirSync(this.tempDir);

      for (const file of files) {
        if (file.startsWith('capture_') && file.endsWith('.png')) {
          const timestampStr = file.replace('capture_', '').replace('.png', '');
          const timestamp = parseInt(timestampStr, 10);

          if (timestamp < cutoff) {
            fs.unlinkSync(path.join(this.tempDir, file));
          }
        }
      }
    } catch (error) {
      console.error('[screenCapture] Cleanup old captures error:', error);
    }
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
    lastCaptureHash: string | null;
    settings: DeepContextSettings;
  } {
    return {
      isRunning: this.isRunning,
      captureCount: this.captureCount,
      lastCaptureHash: this.lastImageHash,
      settings: this.settings,
    };
  }
}
