import { createDb } from './connection.js';
import { config } from '../config.js';
import path from 'path';
function rowToMessage(row) {
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
    db;
    constructor(dbPath) {
        const filepath = dbPath || path.join(config.DB_PATH, 'messages.db');
        this.db = createDb(filepath);
        this.migrate();
    }
    migrate() {
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
    createMessage(id, channelId, authorId, content) {
        const stmt = this.db.prepare(`
      INSERT INTO messages (id, channel_id, author_id, content, created_at)
      VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    `);
        stmt.run(id, channelId, authorId, content);
        return this.findMessageById(id);
    }
    findMessageById(id) {
        const stmt = this.db.prepare(`
      SELECT rowid, id, channel_id, author_id, content, is_deleted, created_at, updated_at
      FROM messages
      WHERE id = ?
    `);
        const row = stmt.get(id);
        return row ? rowToMessage(row) : undefined;
    }
    getMessagesByChannel(channelId, cursor, limit = 50) {
        const cappedLimit = Math.min(Math.max(limit, 1), 100);
        const fetchLimit = cappedLimit + 1; // Fetch limit + 1 to detect if next page exists
        let rows;
        if (cursor) {
            const cursorRowId = parseInt(cursor, 10);
            const stmt = this.db.prepare(`
        SELECT rowid, id, channel_id, author_id, content, is_deleted, created_at, updated_at
        FROM messages
        WHERE channel_id = ? AND rowid < ?
        ORDER BY rowid DESC
        LIMIT ?
      `);
            rows = stmt.all(channelId, cursorRowId, fetchLimit);
        }
        else {
            const stmt = this.db.prepare(`
        SELECT rowid, id, channel_id, author_id, content, is_deleted, created_at, updated_at
        FROM messages
        WHERE channel_id = ?
        ORDER BY rowid DESC
        LIMIT ?
      `);
            rows = stmt.all(channelId, fetchLimit);
        }
        const hasMore = rows.length > cappedLimit;
        const slicedRows = hasMore ? rows.slice(0, cappedLimit) : rows;
        const nextCursor = hasMore && slicedRows.length > 0
            ? String(slicedRows[slicedRows.length - 1].rowid)
            : null;
        return {
            messages: slicedRows.map(rowToMessage),
            nextCursor,
        };
    }
    updateMessage(id, content) {
        const stmt = this.db.prepare(`
      UPDATE messages
      SET content = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND is_deleted = 0
    `);
        const result = stmt.run(content, id);
        if (result.changes === 0)
            return undefined;
        return this.findMessageById(id);
    }
    softDeleteMessage(id) {
        const stmt = this.db.prepare(`
      UPDATE messages
      SET is_deleted = 1, content = '[deleted]', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?
    `);
        stmt.run(id);
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=messages.js.map