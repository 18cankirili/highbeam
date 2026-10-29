// FILE: backend/src/db/messages.ts
import type Database from 'better-sqlite3';
import { createDb } from './connection.js';
import { config } from '../config.js';
import type { Message } from '../types.js';
import path from 'path';

interface MessageRowWithRowId {
  rowid: number;
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  is_deleted: number;
  created_at: string;
  updated_at: string | null;
}

export interface PaginatedMessages {
  messages: Message[];
  nextCursor: string | null;
}

function rowToMessage(row: MessageRowWithRowId): Message {
  return {
    id: row.id,
    channelId: row.channel_id,
    authorId: row.author_id,
    content: row.content,
    isDeleted: row.is_deleted === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MessagesDB {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const filepath = dbPath || path.join(config.DB_PATH, 'messages.db');
    this.db = createDb(filepath);
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        content TEXT NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
      CREATE INDEX IF NOT EXISTS idx_messages_author_id ON messages(author_id);
    `);
  }

  createMessage(id: string, channelId: string, authorId: string, content: string): Message {
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, channel_id, author_id, content, created_at)
      VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    `);
    stmt.run(id, channelId, authorId, content);
    return this.findMessageById(id)!;
  }

  findMessageById(id: string): Message | undefined {
    const stmt = this.db.prepare(`
      SELECT rowid, id, channel_id, author_id, content, is_deleted, created_at, updated_at
      FROM messages
      WHERE id = ?
    `);
    const row = stmt.get(id) as MessageRowWithRowId | undefined;
    return row ? rowToMessage(row) : undefined;
  }

  getMessagesByChannel(
    channelId: string,
    cursor?: string,
    limit: number = 50
  ): PaginatedMessages {
    const cappedLimit = Math.min(Math.max(limit, 1), 100);
    const fetchLimit = cappedLimit + 1; // Fetch limit + 1 to detect if next page exists

    let rows: MessageRowWithRowId[];

    if (cursor) {
      const cursorRowId = parseInt(cursor, 10);
      const stmt = this.db.prepare(`
        SELECT rowid, id, channel_id, author_id, content, is_deleted, created_at, updated_at
        FROM messages
        WHERE channel_id = ? AND rowid < ?
        ORDER BY rowid DESC
        LIMIT ?
      `);
      rows = stmt.all(channelId, cursorRowId, fetchLimit) as MessageRowWithRowId[];
    } else {
      const stmt = this.db.prepare(`
        SELECT rowid, id, channel_id, author_id, content, is_deleted, created_at, updated_at
        FROM messages
        WHERE channel_id = ?
        ORDER BY rowid DESC
        LIMIT ?
      `);
      rows = stmt.all(channelId, fetchLimit) as MessageRowWithRowId[];
    }

    const hasMore = rows.length > cappedLimit;
    const slicedRows = hasMore ? rows.slice(0, cappedLimit) : rows;
    const nextCursor =
      hasMore && slicedRows.length > 0
        ? String(slicedRows[slicedRows.length - 1].rowid)
        : null;

    return {
      messages: slicedRows.map(rowToMessage),
      nextCursor,
    };
  }

  updateMessage(id: string, content: string): Message | undefined {
    const stmt = this.db.prepare(`
      UPDATE messages
      SET content = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND is_deleted = 0
    `);
    const result = stmt.run(content, id);
    if (result.changes === 0) return undefined;
    return this.findMessageById(id);
  }

  softDeleteMessage(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE messages
      SET is_deleted = 1, content = '[deleted]', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?
    `);
    stmt.run(id);
  }

  close(): void {
    this.db.close();
  }
}
