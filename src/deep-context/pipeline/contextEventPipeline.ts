/**
 * Context Event Pipeline
 *
 * Orchestrator that connects capture sources to the event store.
 * Flow: capture → privacy filter → event classifier → store
 *
 * Handles:
 * - Accessibility captures (every 15s)
 * - File system changes (on change)
 * - Deduplication via content hashing
 * - Error isolation (one failed capture doesn't stop others)
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { AccessibilityCaptureService } from '../capture/accessibilityCapture';
import { FileWatcherService } from '../capture/fileWatcher';
import { PrivacyFilter } from '../privacy/privacyFilter';
import { EventClassifier } from './eventClassifier';
import { ContextEventStore } from '../store/contextEventStore';
import type {
  ContextEvent,
  AccessibilityCaptureResult,
  FileChangeEvent,
  DeepContextEngineConfig,
} from '../types';

// ============================================================================
// Pipeline Events
// ============================================================================

export interface PipelineEvent {
  type: 'event_stored' | 'event_filtered' | 'event_duplicate' | 'error';
  event?: ContextEvent;
  reason?: string;
}

// ============================================================================
// Context Event Pipeline
// ============================================================================

export class ContextEventPipeline extends EventEmitter {
  private accessibilityCapture: AccessibilityCaptureService;
  private fileWatcher: FileWatcherService;
  private privacyFilter: PrivacyFilter;
  private classifier: EventClassifier;
  private store: ContextEventStore;
  private config: DeepContextEngineConfig;

  private isRunning: boolean = false;
  private lastContentHash: string | null = null;
  private processedCount: number = 0;
  private filteredCount: number = 0;
  private duplicateCount: number = 0;
  private errorCount: number = 0;

  constructor(
    config: DeepContextEngineConfig,
    store: ContextEventStore,
  ) {
    super();

    this.config = config;
    this.store = store;
    this.privacyFilter = new PrivacyFilter(config);
    this.classifier = new EventClassifier();
    this.accessibilityCapture = new AccessibilityCaptureService(config);
    this.fileWatcher = new FileWatcherService(config);

    // Wire up capture events
    this.accessibilityCapture.on('capture', (result: AccessibilityCaptureResult) => {
      this.processAccessibilityCapture(result);
    });

    this.fileWatcher.on('fileChange', (event: FileChangeEvent) => {
      this.processFileChange(event);
    });
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.isRunning) return;

    console.log('[pipeline] Starting context event pipeline');
    this.isRunning = true;

    this.accessibilityCapture.start();
    this.fileWatcher.start();
  }

  stop(): void {
    if (!this.isRunning) return;

    console.log('[pipeline] Stopping context event pipeline');
    this.isRunning = false;

    this.accessibilityCapture.stop();
    this.fileWatcher.stop();
  }

  updateConfig(config: Partial<DeepContextEngineConfig>): void {
    this.config = { ...this.config, ...config };
    this.privacyFilter.updateConfig(config);
    this.accessibilityCapture.updateConfig(config);
  }

  // ============================================================================
  // Accessibility Capture Processing
  // ============================================================================

  private processAccessibilityCapture(capture: AccessibilityCaptureResult): void {
    try {
      // Step 1: Privacy filter
      if (!this.privacyFilter.shouldCapture(capture.appName, capture.windowTitle, capture.url)) {
        this.filteredCount++;
        this.emit('pipeline', {
          type: 'event_filtered',
          reason: `Excluded: ${capture.appName}`,
        } as PipelineEvent);
        return;
      }

      // Step 2: Deduplication
      const contentForHash = capture.visibleText || capture.focusedElementText || capture.windowTitle;
      const contentHash = this.hashContent(contentForHash);
      if (contentHash === this.lastContentHash) {
        this.duplicateCount++;
        this.emit('pipeline', {
          type: 'event_duplicate',
          reason: 'Same content as last capture',
        } as PipelineEvent);
        return;
      }
      this.lastContentHash = contentHash;

      // Step 3: Strip PII from text
      const sanitizedCapture: AccessibilityCaptureResult = {
        ...capture,
        visibleText: this.privacyFilter.stripPII(capture.visibleText),
        focusedElementText: this.privacyFilter.stripPII(capture.focusedElementText),
      };

      // Step 4: Classify
      const event = this.classifier.classifyCapture(sanitizedCapture);

      // Step 5: Apply privacy level from config
      event.privacyLevel = this.config.privacyLevel;

      // Step 6: Store
      const id = this.store.insert(event);
      event.id = id;

      this.processedCount++;

      this.emit('pipeline', {
        type: 'event_stored',
        event,
      } as PipelineEvent);
    } catch (error) {
      this.errorCount++;
      console.error('[pipeline] Error processing accessibility capture:', error);
      this.emit('pipeline', {
        type: 'error',
        reason: String(error),
      } as PipelineEvent);
    }
  }

  // ============================================================================
  // File Change Processing
  // ============================================================================

  private processFileChange(fileEvent: FileChangeEvent): void {
    try {
      // Step 1: Privacy filter (use file path as context)
      if (!this.privacyFilter.shouldCapture('Finder', fileEvent.fileName)) {
        this.filteredCount++;
        return;
      }

      // Step 2: Classify
      const event = this.classifier.classifyFileEvent(fileEvent);

      // Step 3: Apply privacy level
      event.privacyLevel = this.config.privacyLevel;

      // Step 4: Store
      const id = this.store.insert(event);
      event.id = id;

      this.processedCount++;

      this.emit('pipeline', {
        type: 'event_stored',
        event,
      } as PipelineEvent);
    } catch (error) {
      this.errorCount++;
      console.error('[pipeline] Error processing file change:', error);
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private hashContent(text: string): string {
    if (!text) return '';
    return createHash('md5').update(text.substring(0, 1000)).digest('hex');
  }

  // ============================================================================
  // Status
  // ============================================================================

  isActive(): boolean {
    return this.isRunning;
  }

  getStats(): {
    isRunning: boolean;
    processedCount: number;
    filteredCount: number;
    duplicateCount: number;
    errorCount: number;
    accessibilityStats: ReturnType<AccessibilityCaptureService['getStats']>;
    fileWatcherStats: ReturnType<FileWatcherService['getStats']>;
  } {
    return {
      isRunning: this.isRunning,
      processedCount: this.processedCount,
      filteredCount: this.filteredCount,
      duplicateCount: this.duplicateCount,
      errorCount: this.errorCount,
      accessibilityStats: this.accessibilityCapture.getStats(),
      fileWatcherStats: this.fileWatcher.getStats(),
    };
  }
}
