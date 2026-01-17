import zlib from 'zlib';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { SQLiteQueue } from './sqliteQueue';
import { getApiKey } from '../pairing/pairing';

/**
 * Configuration options for the Transport layer
 */
export type TransportOptions = {
  /** SYNC API endpoint base URL (e.g., 'https://app.isyncso.com') */
  endpoint: string;
  /** Unique device identifier */
  deviceId: string;
  /** Maximum number of events per batch (default: 200) */
  batchSize?: number;
  /** Maximum batch size in bytes before gzip (default: 512KB) */
  maxBatchBytes?: number;
  /** Maximum retry attempts on failure (default: 6) */
  maxRetries?: number;
  /** Client version identifier (default: '1.0.0') */
  clientVersion?: string;
  /** Optional custom path for queue database (mainly for testing) */
  queueDbPath?: string;
};

/**
 * Status information for the Transport layer
 */
export type TransportStatus = {
  /** Number of events waiting in the queue */
  queueLength: number;
  /** Whether a batch upload is currently in progress */
  sending: boolean;
  /** Last error message, if any */
  lastError?: string;
};

/**
 * Transport - Reliable, batched, and compressed event upload system
 * 
 * The Transport layer handles uploading activity events to the SYNC cloud with:
 * - **Persistent queue**: Events survive app restarts (SQLite)
 * - **Batching**: Groups events to reduce network requests
 * - **Compression**: Gzip compression to reduce bandwidth
 * - **Idempotency**: upload_id and event_id prevent duplicates
 * - **Retry logic**: Exponential backoff with jitter for failures
 * - **Error handling**: Smart retry vs. drop decisions based on HTTP status
 * 
 * @example
 * ```typescript
 * import { Transport } from './transport/Transport';
 * import { storeApiKey } from './pairing/pairing';
 * 
 * // First, store the device API key (obtained from app.isyncso.com)
 * await storeApiKey('your-device-api-key');
 * 
 * // Create transport instance
 * const transport = new Transport({
 *   endpoint: 'https://app.isyncso.com',
 *   deviceId: 'unique-device-id',
 *   batchSize: 200,
 *   maxRetries: 6,
 * });
 * 
 * // Enqueue events (stored persistently)
 * await transport.enqueue({ 
 *   type: 'activity',
 *   app: 'Chrome',
 *   timestamp: Date.now(),
 * });
 * 
 * // Trigger upload (batches, compresses, and sends)
 * await transport.flushSoon();
 * 
 * // Check status
 * const status = transport.getStatus();
 * console.log(`Queue: ${status.queueLength}, Sending: ${status.sending}`);
 * 
 * // Force immediate flush
 * await transport.forceFlush();
 * 
 * // Clean up when done
 * transport.close();
 * ```
 * 
 * ## Retry Behavior
 * 
 * - **5xx errors & network failures**: Retry with exponential backoff (2s, 4s, 8s, 16s, 32s, 60s max)
 * - **429 rate limit**: Retry with backoff
 * - **4xx errors (except 429)**: Drop batch to prevent stuck queue
 * - **Max retries exceeded**: Stop and log error
 * 
 * ## Batch Upload Format
 * 
 * The upload endpoint receives a gzipped JSON payload:
 * ```json
 * {
 *   "upload_id": "unique-batch-id",
 *   "device_id": "device-123",
 *   "client_version": "1.0.0",
 *   "events": [
 *     { "event_id": "evt-1", "type": "activity", ... },
 *     { "event_id": "evt-2", "type": "activity", ... }
 *   ]
 * }
 * ```
 */
export class Transport {
  private queue: SQLiteQueue;
  private opts: TransportOptions;
  private sending = false;
  private retryCount = 0;
  private lastError?: string;

  /**
   * Creates a new Transport instance
   * 
   * @param opts - Transport configuration options
   */
  /**
   * Creates a new Transport instance
   * 
   * @param opts - Transport configuration options
   */
  constructor(opts: TransportOptions) {
    this.opts = {
      batchSize: 200,
      maxBatchBytes: 512 * 1024,
      maxRetries: 6,
      clientVersion: '1.0.0',
      ...opts,
    };
    this.queue = new SQLiteQueue(opts.queueDbPath);
  }

  /**
   * Add an event to the persistent queue
   * 
   * Events are stored locally in SQLite and will be uploaded on the next flush.
   * Each event receives a unique event_id for idempotency.
   * 
   * @param event - Event object to enqueue (will be JSON stringified)
   * @returns Unique ID of the queued event
   */
  async enqueue(event: object): Promise<string> {
    // Ensure event has event_id for idempotency
    const e: any = { ...event };
    if (!e.event_id) {
      e.event_id = uuidv4();
    }
    return this.queue.enqueue(e);
  }

  /**
   * Trigger a batch upload of queued events
   * 
   * This method:
   * 1. Groups events into batches (up to batchSize and maxBatchBytes)
   * 2. Compresses each batch with gzip
   * 3. Uploads to the SYNC API with authentication
   * 4. Handles retries for failures with exponential backoff
   * 5. Removes successfully uploaded events from the queue
   * 
   * If another flush is already in progress, this call returns immediately.
   * 
   * @returns Promise that resolves when the flush completes (or fails)
   */
  async flushSoon(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    this.lastError = undefined;

    try {
      while (this.queue.size() > 0) {
        const items = this.queue.peek(this.opts.batchSize!);
        if (items.length === 0) break;

        // Parse events and check batch size
        const events = items.map(i => JSON.parse(i.payload));
        
        // Build batch metadata
        const upload_id = uuidv4();
        const payload = JSON.stringify({
          upload_id,
          device_id: this.opts.deviceId,
          client_version: this.opts.clientVersion,
          events,
        });

        // Check if batch exceeds max size
        if (Buffer.byteLength(payload, 'utf8') > this.opts.maxBatchBytes!) {
          // If single event is too large, drop it to avoid infinite loop
          if (items.length === 1) {
            console.warn('[transport] Single event exceeds maxBatchBytes, dropping');
            this.queue.remove(items[0].id);
            continue;
          }
          // Otherwise, reduce batch size and try again
          const halfBatch = this.queue.peek(Math.floor(items.length / 2));
          const halfEvents = halfBatch.map(i => JSON.parse(i.payload));
          const halfPayload = JSON.stringify({
            upload_id,
            device_id: this.opts.deviceId,
            client_version: this.opts.clientVersion,
            events: halfEvents,
          });
          const gz = zlib.gzipSync(Buffer.from(halfPayload, 'utf8'));
          const apiKey = await getApiKey();
          const res = await this._post(gz, apiKey);
          
          if (res.ok || res.status === 202) {
            // Remove processed items
            for (const it of halfBatch) {
              this.queue.remove(it.id);
            }
            this.retryCount = 0;
            continue;
          }
          
          // Handle errors
          await this._handleError(res.status, halfBatch);
          return;
        }

        // Send full batch
        const gz = zlib.gzipSync(Buffer.from(payload, 'utf8'));
        const apiKey = await getApiKey();
        const res = await this._post(gz, apiKey);

        if (res.ok || res.status === 202) {
          // Success - remove processed items
          for (const it of items) {
            this.queue.remove(it.id);
          }
          this.retryCount = 0;
          continue;
        }

        // Handle errors
        await this._handleError(res.status, items);
        return;
      }
    } catch (err: any) {
      // Network or other error - schedule retry with backoff
      this.lastError = err.message || 'Unknown error';
      this.retryCount++;
      
      if (this.retryCount <= this.opts.maxRetries!) {
        const delay = this._calculateBackoff(this.retryCount);
        console.warn(`[transport] Error: ${this.lastError}, retry ${this.retryCount}/${this.opts.maxRetries} in ${delay}ms`);
        setTimeout(() => {
          this.sending = false;
          this.flushSoon();
        }, delay);
      } else {
        console.error(`[transport] Max retries exceeded, stopping: ${this.lastError}`);
        this.retryCount = 0;
        this.sending = false;
      }
      return;
    }

    this.sending = false;
  }

  /**
   * Force an immediate flush of all queued events
   * 
   * This is an alias for flushSoon() - both methods trigger the same batch upload process.
   * 
   * @returns Promise that resolves when the flush completes
   */
  async forceFlush(): Promise<void> {
    return this.flushSoon();
  }

  /**
   * Handle HTTP error responses from the upload endpoint
   * 
   * @private
   * @param status - HTTP status code
   * @param items - Queue items that failed to upload
   */
  private async _handleError(status: number, items: any[]): Promise<void> {
    // 4xx client errors (except 429 rate limit) - drop batch to avoid stuck queue
    if (status >= 400 && status < 500 && status !== 429) {
      this.lastError = `Client error ${status}`;
      console.warn(`[transport] ${this.lastError}, dropping batch to prevent stuck queue`);
      for (const it of items) {
        this.queue.remove(it.id);
      }
      this.sending = false;
      return;
    }

    // 429 rate limit or 5xx server errors - retry with backoff
    this.lastError = `Server error ${status}`;
    this.retryCount++;
    
    if (this.retryCount <= this.opts.maxRetries!) {
      const delay = this._calculateBackoff(this.retryCount);
      console.warn(`[transport] ${this.lastError}, retry ${this.retryCount}/${this.opts.maxRetries} in ${delay}ms`);
      setTimeout(() => {
        this.sending = false;
        this.flushSoon();
      }, delay);
    } else {
      console.error(`[transport] Max retries exceeded, stopping: ${this.lastError}`);
      this.retryCount = 0;
      this.sending = false;
    }
  }

  /**
   * Calculate exponential backoff delay with jitter
   * 
   * @private
   * @param retryCount - Current retry attempt number (1-based)
   * @returns Delay in milliseconds (capped at 60 seconds)
   */
  private _calculateBackoff(retryCount: number): number {
    // Exponential backoff: 2^retryCount * 1000ms + jitter
    const baseDelay = Math.pow(2, retryCount) * 1000;
    const jitter = Math.random() * 1000;
    return Math.min(baseDelay + jitter, 60000); // Cap at 60 seconds
  }

  /**
   * Send a gzipped batch to the upload endpoint
   * 
   * @private
   * @param bodyBuffer - Gzipped request body
   * @param apiKey - Optional API key for authentication
   * @returns Fetch response
   */
  async _post(bodyBuffer: Buffer, apiKey?: string): Promise<any> {
    const headers: any = {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      'User-Agent': `sync.desktop/${this.opts.clientVersion}`,
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const url = `${this.opts.endpoint.replace(/\/$/, '')}/api/v1/devices/${this.opts.deviceId}/upload`;
    
    return fetch(url, {
      method: 'POST',
      headers,
      body: bodyBuffer,
    });
  }

  /**
   * Get the current number of events in the queue
   * 
   * @returns Number of pending events
   */
  getQueueLength(): number {
    return this.queue.size();
  }

  /**
   * Get the current status of the transport layer
   * 
   * @returns Status object with queue length, sending state, and last error
   */
  getStatus(): TransportStatus {
    return {
      queueLength: this.getQueueLength(),
      sending: this.sending,
      lastError: this.lastError,
    };
  }

  /**
   * Close the transport and release resources
   * 
   * Call this when shutting down the application
   */
  close(): void {
    this.queue.close();
  }
}
