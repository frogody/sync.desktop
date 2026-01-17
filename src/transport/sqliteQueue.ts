import path from 'path';
import os from 'os';
import fs from 'fs';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const DB_DIR = path.join(os.homedir(), '.sync-desktop');
const DB_PATH = path.join(DB_DIR, 'transport_queue.db');

export type QueueItem = { id: string; created_at: number; payload: string };

/**
 * SQLiteQueue - A persistent FIFO queue backed by SQLite
 * 
 * This queue provides durable storage for events/messages that need to survive
 * application restarts. All data is stored in a SQLite database in the user's
 * home directory (~/.sync-desktop/transport_queue.db).
 * 
 * @example
 * ```typescript
 * const queue = new SQLiteQueue();
 * 
 * // Add items to the queue
 * const id = queue.enqueue({ type: 'activity', data: 'user clicked button' });
 * 
 * // Peek at the next items (without removing)
 * const items = queue.peek(10);
 * 
 * // Process and remove items
 * items.forEach(item => {
 *   processItem(JSON.parse(item.payload));
 *   queue.remove(item.id);
 * });
 * 
 * // Check queue size
 * console.log(`Queue has ${queue.size()} items`);
 * 
 * // Clear all items
 * queue.clearAll();
 * 
 * // Always close when done
 * queue.close();
 * ```
 */
export class SQLiteQueue {
  private db: Database.Database;
  
  /**
   * Creates a new SQLiteQueue instance
   * 
   * @param dbPath - Optional custom database path. Defaults to ~/.sync-desktop/transport_queue.db
   */
  constructor(dbPath = DB_PATH) {
    // Only create directory if not using in-memory database
    if (dbPath !== ':memory:' && !fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.exec(`CREATE TABLE IF NOT EXISTS queue (id TEXT PRIMARY KEY, created_at INTEGER, payload TEXT);`);
  }

  /**
   * Add an item to the queue
   * 
   * @param payload - Object to enqueue (will be JSON stringified)
   * @returns Unique ID of the enqueued item
   */
  enqueue(payload: object) {
    const id = uuidv4();
    const stmt = this.db.prepare('INSERT INTO queue (id, created_at, payload) VALUES (?, ?, ?)');
    stmt.run(id, Date.now(), JSON.stringify(payload));
    return id;
  }

  /**
   * Retrieve the next N items from the queue (without removing them)
   * Items are returned in FIFO order (oldest first)
   * 
   * @param n - Maximum number of items to retrieve (default: 100)
   * @returns Array of queue items with id, created_at timestamp, and JSON payload
   */
  peek(n = 100): QueueItem[] {
    const stmt = this.db.prepare('SELECT id, created_at, payload FROM queue ORDER BY created_at LIMIT ?');
    const rows = stmt.all(n) as any[];
    return rows.map(r => ({ id: r.id, created_at: r.created_at, payload: r.payload }));
  }

  /**
   * Remove an item from the queue by ID
   * 
   * @param id - The unique ID of the item to remove
   */
  remove(id: string) {
    const stmt = this.db.prepare('DELETE FROM queue WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Get the current number of items in the queue
   * 
   * @returns Number of items in the queue
   */
  size() {
    const row = this.db.prepare('SELECT COUNT(1) as c FROM queue').get() as any;
    return row.c;
  }

  /**
   * Remove all items from the queue
   * 
   * WARNING: This operation is not reversible
   */
  clearAll() {
    const stmt = this.db.prepare('DELETE FROM queue');
    stmt.run();
  }

  /**
   * Close the database connection
   * 
   * Always call this when you're done with the queue to release resources
   */
  close() {
    this.db.close();
  }
}
