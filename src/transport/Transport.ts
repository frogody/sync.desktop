import zlib from 'zlib';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { SQLiteQueue } from './sqliteQueue';
import { getApiKey } from '../pairing/pairing';

export type TransportOptions = {
  endpoint: string;
  deviceId: string;
  batchSize?: number; // events
  maxBatchBytes?: number; // bytes
  maxRetries?: number;
  clientVersion?: string;
  queueDbPath?: string; // optional path for queue database
};

export type TransportStatus = {
  queueLength: number;
  sending: boolean;
  lastError?: string;
};

export class Transport {
  private queue: SQLiteQueue;
  private opts: TransportOptions;
  private sending = false;
  private retryCount = 0;
  private lastError?: string;

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

  async enqueue(event: object): Promise<string> {
    // Ensure event has event_id for idempotency
    const e: any = { ...event };
    if (!e.event_id) {
      e.event_id = uuidv4();
    }
    return this.queue.enqueue(e);
  }

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

  async forceFlush(): Promise<void> {
    return this.flushSoon();
  }

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

  private _calculateBackoff(retryCount: number): number {
    // Exponential backoff: 2^retryCount * 1000ms + jitter
    const baseDelay = Math.pow(2, retryCount) * 1000;
    const jitter = Math.random() * 1000;
    return Math.min(baseDelay + jitter, 60000); // Cap at 60 seconds
  }

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

  getQueueLength(): number {
    return this.queue.size();
  }

  getStatus(): TransportStatus {
    return {
      queueLength: this.getQueueLength(),
      sending: this.sending,
      lastError: this.lastError,
    };
  }

  close(): void {
    this.queue.close();
  }
}
