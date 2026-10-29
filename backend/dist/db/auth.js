import { createDb } from './connection.js';
import { config } from '../config.js';
import path from 'path';
function rowToUser(row) {
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        isOnline: row.is_online === 1,
        createdAt: row.created_at,
    };
}
function rowToUserWithPassword(row) {
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        passwordHash: row.password_hash,
        isOnline: row.is_online === 1,
        createdAt: row.created_at,
    };
}
function rowToSession(row) {
    return {
        id: row.id,
        userId: row.user_id,
        token: row.token,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
    };
}
export class AuthDB {
    db;
    constructor(dbPath) {
        const filepath = dbPath || path.join(config.DB_PATH, 'auth.db');
        this.db = createDb(filepath);
        this.migrate();
    }
    migrate() {
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
    createUser(id, username, email, passwordHash) {
        const stmt = this.db.prepare(`
      INSERT INTO users (id, username, email, password_hash)
      VALUES (?, ?, ?, ?)
    `);
        stmt.run(id, username, email, passwordHash);
        return this.findUserById(id);
    }
    findUserByUsername(username) {
        const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
        const row = stmt.get(username);
        return row ? rowToUserWithPassword(row) : undefined;
    }
    findUserByEmail(email) {
        const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
        const row = stmt.get(email);
        return row ? rowToUser(row) : undefined;
    }
    findUserById(id) {
        const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
        const row = stmt.get(id);
        return row ? rowToUser(row) : undefined;
    }
    setOnline(userId, isOnline) {
        const stmt = this.db.prepare('UPDATE users SET is_online = ? WHERE id = ?');
        stmt.run(isOnline ? 1 : 0, userId);
    }
    createSession(id, userId, token, expiresAt) {
        const stmt = this.db.prepare(`
      INSERT INTO sessions (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
    `);
        stmt.run(id, userId, token, expiresAt);
    }
    findSessionByToken(token) {
        const stmt = this.db.prepare('SELECT * FROM sessions WHERE token = ?');
        const row = stmt.get(token);
        return row ? rowToSession(row) : undefined;
    }
    deleteSession(token) {
        const stmt = this.db.prepare('DELETE FROM sessions WHERE token = ?');
        stmt.run(token);
    }
    deleteUserSessions(userId) {
        const stmt = this.db.prepare('DELETE FROM sessions WHERE user_id = ?');
        stmt.run(userId);
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=auth.js.map