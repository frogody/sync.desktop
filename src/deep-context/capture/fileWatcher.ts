/**
 * File Watcher Service
 *
 * Monitors common document directories for file changes.
 * Detects file creates, modifications, and renames to produce
 * document_interaction events.
 *
 * Uses Node.js fs.watch for lightweight directory monitoring.
 * Watches directories, not individual files.
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { FileChangeEvent, DeepContextEngineConfig } from '../types';

// ============================================================================
// Constants
// ============================================================================

// Debounce interval to coalesce rapid file change notifications
const DEBOUNCE_MS = 1000;

// Extensions we care about (skip binaries, caches, etc.)
const TRACKED_EXTENSIONS = new Set([
  // Documents
  '.md', '.txt', '.rtf', '.doc', '.docx', '.pdf', '.odt',
  // Spreadsheets
  '.csv', '.xlsx', '.xls', '.numbers', '.ods',
  // Presentations
  '.pptx', '.ppt', '.key',
  // Code
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.swift',
  '.java', '.kt', '.rb', '.php', '.c', '.cpp', '.h', '.hpp',
  '.css', '.scss', '.html', '.json', '.yaml', '.yml', '.toml',
  '.sql', '.sh', '.zsh', '.bash',
  // Design
  '.fig', '.sketch', '.psd', '.ai', '.svg',
  // Images (document context only)
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
]);

// Directories and patterns to ignore
const IGNORED_PATTERNS = [
  'node_modules',
  '.git',
  '.DS_Store',
  'Thumbs.db',
  '.Trash',
  '__pycache__',
  '.cache',
  '.tmp',
  '~$', // Office temp files
];

// ============================================================================
// File Watcher Service
// ============================================================================

export class FileWatcherService extends EventEmitter {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private isRunning: boolean = false;
  private config: DeepContextEngineConfig;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private eventCount: number = 0;

  constructor(config: DeepContextEngineConfig) {
    super();
    this.config = config;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.isRunning) {
      console.log('[fileWatcher] Already running');
      return;
    }

    if (!this.config.fileWatcherEnabled) {
      console.log('[fileWatcher] File watcher disabled');
      return;
    }

    console.log('[fileWatcher] Starting file watcher');

    this.isRunning = true;

    // Get directories to watch
    const directories = this.getWatchDirectories();

    for (const dir of directories) {
      this.watchDirectory(dir);
    }

    console.log(`[fileWatcher] Watching ${this.watchers.size} directories`);
  }

  stop(): void {
    if (!this.isRunning) return;

    console.log('[fileWatcher] Stopping file watcher');
    this.isRunning = false;

    // Close all watchers
    for (const [dir, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();

    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  // ============================================================================
  // Directory Watching
  // ============================================================================

  private getWatchDirectories(): string[] {
    if (this.config.watchedDirectories.length > 0) {
      return this.config.watchedDirectories.filter((d) => fs.existsSync(d));
    }

    // Default: watch common user directories
    const homeDir = app.getPath('home');
    const defaults = [
      path.join(homeDir, 'Desktop'),
      path.join(homeDir, 'Documents'),
      path.join(homeDir, 'Downloads'),
    ];

    return defaults.filter((d) => fs.existsSync(d));
  }

  private watchDirectory(dirPath: string): void {
    if (this.watchers.has(dirPath)) return;

    try {
      const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        this.handleFileChange(eventType, filename, dirPath);
      });

      watcher.on('error', (error) => {
        console.error(`[fileWatcher] Error watching ${dirPath}:`, error);
        // Remove and potentially re-add
        this.watchers.delete(dirPath);
      });

      this.watchers.set(dirPath, watcher);
      console.log(`[fileWatcher] Watching: ${dirPath}`);
    } catch (error) {
      console.error(`[fileWatcher] Failed to watch ${dirPath}:`, error);
    }
  }

  // ============================================================================
  // File Change Handling
  // ============================================================================

  private handleFileChange(eventType: string, filename: string, baseDir: string): void {
    // Ignore patterns
    if (this.shouldIgnore(filename)) return;

    // Check extension
    const ext = path.extname(filename).toLowerCase();
    if (!TRACKED_EXTENSIONS.has(ext)) return;

    const fullPath = path.join(baseDir, filename);

    // Debounce: coalesce rapid changes to the same file
    const debounceKey = fullPath;
    const existingTimer = this.debounceTimers.get(debounceKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.debounceTimers.set(
      debounceKey,
      setTimeout(() => {
        this.debounceTimers.delete(debounceKey);
        this.emitFileEvent(eventType, filename, fullPath, baseDir, ext);
      }, DEBOUNCE_MS)
    );
  }

  private emitFileEvent(
    eventType: string,
    filename: string,
    fullPath: string,
    baseDir: string,
    extension: string
  ): void {
    // Determine the specific event type
    let fileEventType: FileChangeEvent['eventType'];

    if (eventType === 'rename') {
      // 'rename' can mean created, deleted, or renamed
      if (fs.existsSync(fullPath)) {
        fileEventType = 'created';
      } else {
        fileEventType = 'deleted';
      }
    } else {
      fileEventType = 'modified';
    }

    const event: FileChangeEvent = {
      timestamp: Date.now(),
      eventType: fileEventType,
      filePath: fullPath,
      fileName: path.basename(filename),
      directory: baseDir,
      extension,
    };

    this.eventCount++;

    console.log(
      `[fileWatcher] ${fileEventType}: ${event.fileName} (${extension})`
    );

    this.emit('fileChange', event);
  }

  // ============================================================================
  // Filtering
  // ============================================================================

  private shouldIgnore(filename: string): boolean {
    const lower = filename.toLowerCase();

    for (const pattern of IGNORED_PATTERNS) {
      if (lower.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    // Ignore hidden files
    if (path.basename(filename).startsWith('.')) {
      return true;
    }

    return false;
  }

  // ============================================================================
  // Status
  // ============================================================================

  isActive(): boolean {
    return this.isRunning;
  }

  getStats(): {
    isRunning: boolean;
    watchedDirectories: number;
    eventCount: number;
  } {
    return {
      isRunning: this.isRunning,
      watchedDirectories: this.watchers.size,
      eventCount: this.eventCount,
    };
  }
}
