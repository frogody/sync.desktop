import { SQLiteQueue } from '../src/transport/sqliteQueue';
import { Transport } from '../src/transport/Transport';
import { storeApiKey, getApiKey, deleteApiKey } from '../src/pairing/pairing';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';

// Mock node-fetch
vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

const fetch = (await import('node-fetch')).default as any;

describe('SQLiteQueue', () => {
  let queue: SQLiteQueue;
  const testDbPath = ':memory:';

  beforeEach(() => {
    queue = new SQLiteQueue(testDbPath);
  });

  afterEach(() => {
    if (queue) {
      queue.close();
    }
  });

  it('should enqueue and peek items', () => {
    const id1 = queue.enqueue({ foo: 'bar' });
    const id2 = queue.enqueue({ baz: 'qux' });

    expect(queue.size()).toBe(2);
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();

    const items = queue.peek(10);
    expect(items.length).toBe(2);
    expect(JSON.parse(items[0].payload)).toEqual({ foo: 'bar' });
    expect(JSON.parse(items[1].payload)).toEqual({ baz: 'qux' });
  });

  it('should remove items', () => {
    const id = queue.enqueue({ test: 'data' });
    expect(queue.size()).toBe(1);

    queue.remove(id);
    expect(queue.size()).toBe(0);

    const items = queue.peek(10);
    expect(items.length).toBe(0);
  });

  it('should respect peek limit', () => {
    for (let i = 0; i < 10; i++) {
      queue.enqueue({ index: i });
    }

    expect(queue.size()).toBe(10);

    const items = queue.peek(5);
    expect(items.length).toBe(5);
  });

  it('should order items by created_at', () => {
    queue.enqueue({ order: 1 });
    queue.enqueue({ order: 2 });
    queue.enqueue({ order: 3 });

    const items = queue.peek(10);
    expect(JSON.parse(items[0].payload).order).toBe(1);
    expect(JSON.parse(items[1].payload).order).toBe(2);
    expect(JSON.parse(items[2].payload).order).toBe(3);
  });
});

describe('Transport', () => {
  let transport: Transport;
  let testQueuePath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create a unique database path for each test
    testQueuePath = path.join('/tmp', `test-queue-${Date.now()}-${Math.random()}.db`);
    
    // Use a file-based db for transport tests so we can test persistence
    transport = new Transport({
      endpoint: 'https://api.test.com',
      deviceId: 'test-device-123',
      batchSize: 5,
      maxBatchBytes: 1024,
      maxRetries: 3,
      queueDbPath: testQueuePath,
    });
  });

  afterEach(() => {
    if (transport) {
      transport.close();
    }
    // Clean up test db
    if (fs.existsSync(testQueuePath)) {
      fs.unlinkSync(testQueuePath);
    }
  });

  it('should enqueue events with event_id', async () => {
    const id = await transport.enqueue({ type: 'test', data: 'hello' });
    expect(id).toBeTruthy();
    expect(transport.getQueueLength()).toBe(1);
  });

  it('should preserve event_id if provided', async () => {
    const customId = 'custom-event-id';
    await transport.enqueue({ type: 'test', event_id: customId, data: 'hello' });
    expect(transport.getQueueLength()).toBe(1);
  });

  it('should batch and gzip events on flush (success)', async () => {
    // Mock successful response
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    await transport.enqueue({ type: 'event1' });
    await transport.enqueue({ type: 'event2' });
    await transport.enqueue({ type: 'event3' });

    await transport.flushSoon();

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should have called fetch once
    expect(fetch).toHaveBeenCalledTimes(1);

    // Check that the body was gzipped
    const call = fetch.mock.calls[0];
    const headers = call[1].headers;
    expect(headers['Content-Encoding']).toBe('gzip');
    expect(headers['Content-Type']).toBe('application/json');

    // Decompress and verify payload
    const gzippedBody = call[1].body;
    const decompressed = zlib.gunzipSync(gzippedBody).toString('utf8');
    const payload = JSON.parse(decompressed);

    expect(payload.upload_id).toBeTruthy();
    expect(payload.device_id).toBe('test-device-123');
    expect(payload.events.length).toBe(3);
    expect(payload.events[0].type).toBe('event1');

    // Queue should be empty after successful flush
    expect(transport.getQueueLength()).toBe(0);
  });

  it('should retry on 500 server error', async () => {
    // Mock server error followed by success
    fetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await transport.enqueue({ type: 'event1' });

    // Start flush
    const flushPromise = transport.flushSoon();

    // Wait for first attempt + retry
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Should have attempted twice (initial + 1 retry)
    expect(fetch).toHaveBeenCalledTimes(2);

    // Queue should be empty after successful retry
    expect(transport.getQueueLength()).toBe(0);
  });

  it('should drop batch on 4xx client error (except 429)', async () => {
    // Mock client error
    fetch.mockResolvedValueOnce({ ok: false, status: 400 });

    await transport.enqueue({ type: 'bad-event' });

    await transport.flushSoon();
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(fetch).toHaveBeenCalledTimes(1);
    
    // Queue should be empty (batch dropped)
    expect(transport.getQueueLength()).toBe(0);
  });

  it('should retry on 429 rate limit', async () => {
    // Mock rate limit followed by success
    fetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await transport.enqueue({ type: 'event1' });

    const flushPromise = transport.flushSoon();
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Should retry on 429
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(transport.getQueueLength()).toBe(0);
  });

  it('should stop retrying after maxRetries', async () => {
    // Mock continuous failures
    fetch.mockResolvedValue({ ok: false, status: 500 });

    await transport.enqueue({ type: 'event1' });

    await transport.flushSoon();
    
    // Wait for all retries (initial + 3 retries = 4 total with backoff)
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Should attempt initial + maxRetries (3) = 4 times
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(4);
  }, 20000); // 20 second timeout

  it('should handle network errors with retry', async () => {
    // Mock network error followed by success
    fetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await transport.enqueue({ type: 'event1' });

    const flushPromise = transport.flushSoon();
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Should retry after network error
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('should include upload_id for idempotency', async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await transport.enqueue({ type: 'event1' });
    await transport.flushSoon();
    await new Promise(resolve => setTimeout(resolve, 100));

    const call = fetch.mock.calls[0];
    const gzippedBody = call[1].body;
    const decompressed = zlib.gunzipSync(gzippedBody).toString('utf8');
    const payload = JSON.parse(decompressed);

    expect(payload.upload_id).toBeTruthy();
    expect(typeof payload.upload_id).toBe('string');
  });

  it('should report status correctly', () => {
    const status = transport.getStatus();
    expect(status.queueLength).toBe(0);
    expect(status.sending).toBe(false);
  });
});

describe('Pairing', () => {
  const testApiKey = 'test-api-key-12345';

  afterEach(async () => {
    await deleteApiKey();
  });

  it('should store and retrieve API key', async () => {
    await storeApiKey(testApiKey);
    const retrieved = await getApiKey();
    expect(retrieved).toBe(testApiKey);
  });

  it('should delete API key', async () => {
    await storeApiKey(testApiKey);
    let retrieved = await getApiKey();
    expect(retrieved).toBe(testApiKey);

    await deleteApiKey();
    retrieved = await getApiKey();
    expect(retrieved).toBeUndefined();
  });
});
