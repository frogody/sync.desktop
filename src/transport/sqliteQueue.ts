import path from 'path';
import os from 'os';
import fs from 'fs';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const DB_DIR = path.join(os.homedir(), '.sync-desktop');
const DB_PATH = path.join(DB_DIR, 'transport_queue.db');

export type QueueItem = { id: string; created_at: number; payload: string };

export class SQLiteQueue {
  private db: Database.Database;
  constructor(dbPath = DB_PATH) {
    // Only create directory if not using in-memory database
    if (dbPath !== ':memory:' && !fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.exec(`CREATE TABLE IF NOT EXISTS queue (id TEXT PRIMARY KEY, created_at INTEGER, payload TEXT);`);
  }

  enqueue(payload: object) {
    const id = uuidv4();
    const stmt = this.db.prepare('INSERT INTO queue (id, created_at, payload) VALUES (?, ?, ?)');
    stmt.run(id, Date.now(), JSON.stringify(payload));
    return id;
  }

  peek(n = 100): QueueItem[] {
    const stmt = this.db.prepare('SELECT id, created_at, payload FROM queue ORDER BY created_at LIMIT ?');
    const rows = stmt.all(n) as any[];
    return rows.map(r => ({ id: r.id, created_at: r.created_at, payload: r.payload }));
  }

  remove(id: string) {
    const stmt = this.db.prepare('DELETE FROM queue WHERE id = ?');
    stmt.run(id);
  }

  size() {
    const row = this.db.prepare('SELECT COUNT(1) as c FROM queue').get() as any;
    return row.c;
  }

  clearAll() {
    const stmt = this.db.prepare('DELETE FROM queue');
    stmt.run();
  }

  close() {
    this.db.close();
  }
}
