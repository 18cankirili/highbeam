// FILE: backend/src/db/connection.ts
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export function createDb(filepath: string): Database.Database {
  const dir = path.dirname(filepath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(filepath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}
