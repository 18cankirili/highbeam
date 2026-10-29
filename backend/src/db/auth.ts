// FILE: backend/src/db/auth.ts
import type Database from 'better-sqlite3';
import { createDb } from './connection.js';
import { config } from '../config.js';
import type { User, UserWithPassword } from '../types.js';
import path from 'path';

interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  is_online: number;
  created_at: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    isOnline: row.is_online === 1,
    createdAt: row.created_at,
  };
}

function rowToUserWithPassword(row: UserRow): UserWithPassword {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    isOnline: row.is_online === 1,
    createdAt: row.created_at,
  };
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    token: row.token,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export class AuthDB {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const filepath = dbPath || path.join(config.DB_PATH, 'auth.db');
    this.db = createDb(filepath);
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        is_online INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    `);
  }

  createUser(id: string, username: string, email: string, passwordHash: string): User {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, username, email, password_hash)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, username, email, passwordHash);
    return this.findUserById(id)!;
  }

  findUserByUsername(username: string): UserWithPassword | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    const row = stmt.get(username) as UserRow | undefined;
    return row ? rowToUserWithPassword(row) : undefined;
  }

  findUserByEmail(email: string): User | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    const row = stmt.get(email) as UserRow | undefined;
    return row ? rowToUser(row) : undefined;
  }

  findUserById(id: string): User | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id) as UserRow | undefined;
    return row ? rowToUser(row) : undefined;
  }

  setOnline(userId: string, isOnline: boolean): void {
    const stmt = this.db.prepare('UPDATE users SET is_online = ? WHERE id = ?');
    stmt.run(isOnline ? 1 : 0, userId);
  }

  createSession(id: string, userId: string, token: string, expiresAt: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, userId, token, expiresAt);
  }

  findSessionByToken(token: string): Session | undefined {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE token = ?');
    const row = stmt.get(token) as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  deleteSession(token: string): void {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE token = ?');
    stmt.run(token);
  }

  deleteUserSessions(userId: string): void {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE user_id = ?');
    stmt.run(userId);
  }

  close(): void {
    this.db.close();
  }
}
