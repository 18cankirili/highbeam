import { createDb } from './connection.js';
import { config } from '../config.js';
import path from 'path';
function rowToGuild(row) {
    return {
        id: row.id,
        name: row.name,
        ownerId: row.owner_id,
        inviteCode: row.invite_code,
        createdAt: row.created_at,
    };
}
function rowToChannel(row) {
    return {
        id: row.id,
        guildId: row.guild_id,
        name: row.name,
        type: row.type || 'text',
        createdAt: row.created_at,
    };
}
function rowToRole(row) {
    return {
        id: row.id,
        guildId: row.guild_id,
        name: row.name,
        permissions: row.permissions,
        createdAt: row.created_at,
    };
}
function rowToMember(row) {
    return {
        id: row.id,
        guildId: row.guild_id,
        userId: row.user_id,
        roleId: row.role_id,
        joinedAt: row.joined_at,
    };
}
function rowToDMChannel(row) {
    return {
        id: row.id,
        user1Id: row.user1_id,
        user2Id: row.user2_id,
        createdAt: row.created_at,
    };
}
export class GuildsDB {
    db;
    constructor(dbPath) {
        const filepath = dbPath || path.join(config.DB_PATH, 'guilds.db');
        this.db = createDb(filepath);
        this.migrate();
    }
    migrate() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS guilds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        invite_code TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_guilds_invite_code ON guilds(invite_code);
      CREATE INDEX IF NOT EXISTS idx_guilds_owner_id ON guilds(owner_id);

      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text' CHECK(type IN ('text', 'voice')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_channels_guild_id ON channels(guild_id);

      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        permissions INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_roles_guild_id ON roles(guild_id);

      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        joined_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES roles(id),
        UNIQUE(guild_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_members_guild_id ON members(guild_id);
      CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);
      CREATE INDEX IF NOT EXISTS idx_members_guild_user ON members(guild_id, user_id);

      CREATE TABLE IF NOT EXISTS dm_channels (
        id TEXT PRIMARY KEY,
        user1_id TEXT NOT NULL,
        user2_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE(user1_id, user2_id)
      );
      CREATE INDEX IF NOT EXISTS idx_dm_channels_user1 ON dm_channels(user1_id);
      CREATE INDEX IF NOT EXISTS idx_dm_channels_user2 ON dm_channels(user2_id);
    `);
        // Safe migration: add 'type' column if table already existed without it
        const tableInfo = this.db.pragma('table_info(channels)');
        const hasType = tableInfo.some((col) => col.name === 'type');
        if (!hasType) {
            this.db.exec("ALTER TABLE channels ADD COLUMN type TEXT NOT NULL DEFAULT 'text' CHECK(type IN ('text', 'voice'));");
        }
    }
    createGuild(id, name, ownerId, inviteCode) {
        const stmt = this.db.prepare(`
      INSERT INTO guilds (id, name, owner_id, invite_code)
      VALUES (?, ?, ?, ?)
    `);
        stmt.run(id, name, ownerId, inviteCode);
        return this.findGuildById(id);
    }
    findGuildById(id) {
        const stmt = this.db.prepare('SELECT * FROM guilds WHERE id = ?');
        const row = stmt.get(id);
        return row ? rowToGuild(row) : undefined;
    }
    findGuildByInviteCode(code) {
        const stmt = this.db.prepare('SELECT * FROM guilds WHERE invite_code = ?');
        const row = stmt.get(code);
        return row ? rowToGuild(row) : undefined;
    }
    getGuildsForUser(userId) {
        const stmt = this.db.prepare(`
      SELECT g.* FROM guilds g
      INNER JOIN members m ON m.guild_id = g.id
      WHERE m.user_id = ?
      ORDER BY g.created_at ASC
    `);
        const rows = stmt.all(userId);
        return rows.map(rowToGuild);
    }
    createChannel(id, guildId, name, type = 'text') {
        const stmt = this.db.prepare(`
      INSERT INTO channels (id, guild_id, name, type)
      VALUES (?, ?, ?, ?)
    `);
        stmt.run(id, guildId, name, type);
        return this.findChannelById(id);
    }
    getChannelsByGuild(guildId) {
        const stmt = this.db.prepare('SELECT * FROM channels WHERE guild_id = ? ORDER BY created_at ASC');
        const rows = stmt.all(guildId);
        return rows.map(rowToChannel);
    }
    findChannelById(id) {
        const stmt = this.db.prepare('SELECT * FROM channels WHERE id = ?');
        const row = stmt.get(id);
        return row ? rowToChannel(row) : undefined;
    }
    deleteChannel(id) {
        const stmt = this.db.prepare('DELETE FROM channels WHERE id = ?');
        stmt.run(id);
    }
    createRole(id, guildId, name, permissions) {
        const stmt = this.db.prepare(`
      INSERT INTO roles (id, guild_id, name, permissions)
      VALUES (?, ?, ?, ?)
    `);
        stmt.run(id, guildId, name, permissions);
        return this.findRoleById(id);
    }
    getRolesByGuild(guildId) {
        const stmt = this.db.prepare('SELECT * FROM roles WHERE guild_id = ? ORDER BY created_at ASC');
        const rows = stmt.all(guildId);
        return rows.map(rowToRole);
    }
    findRoleById(id) {
        const stmt = this.db.prepare('SELECT * FROM roles WHERE id = ?');
        const row = stmt.get(id);
        return row ? rowToRole(row) : undefined;
    }
    addMember(id, guildId, userId, roleId) {
        const stmt = this.db.prepare(`
      INSERT INTO members (id, guild_id, user_id, role_id)
      VALUES (?, ?, ?, ?)
    `);
        stmt.run(id, guildId, userId, roleId);
        return this.findMember(guildId, userId);
    }
    findMember(guildId, userId) {
        const stmt = this.db.prepare('SELECT * FROM members WHERE guild_id = ? AND user_id = ?');
        const row = stmt.get(guildId, userId);
        return row ? rowToMember(row) : undefined;
    }
    getMembersByGuild(guildId) {
        const stmt = this.db.prepare('SELECT * FROM members WHERE guild_id = ? ORDER BY joined_at ASC');
        const rows = stmt.all(guildId);
        return rows.map(rowToMember);
    }
    updateMemberRole(guildId, userId, roleId) {
        const stmt = this.db.prepare('UPDATE members SET role_id = ? WHERE guild_id = ? AND user_id = ?');
        stmt.run(roleId, guildId, userId);
    }
    getMemberPermissions(guildId, userId) {
        const stmt = this.db.prepare(`
      SELECT r.permissions FROM members m
      INNER JOIN roles r ON r.id = m.role_id
      WHERE m.guild_id = ? AND m.user_id = ?
    `);
        const row = stmt.get(guildId, userId);
        return row ? row.permissions : 0;
    }
    isGuildOwner(guildId, userId) {
        const stmt = this.db.prepare('SELECT owner_id FROM guilds WHERE id = ?');
        const row = stmt.get(guildId);
        return row ? row.owner_id === userId : false;
    }
    createDMChannel(id, userAId, userBId) {
        const [u1, u2] = userAId < userBId ? [userAId, userBId] : [userBId, userAId];
        const stmt = this.db.prepare(`
      INSERT INTO dm_channels (id, user1_id, user2_id)
      VALUES (?, ?, ?)
    `);
        stmt.run(id, u1, u2);
        return this.findDMChannelById(id);
    }
    findDMChannelById(id) {
        const stmt = this.db.prepare('SELECT * FROM dm_channels WHERE id = ?');
        const row = stmt.get(id);
        return row ? rowToDMChannel(row) : undefined;
    }
    findDMChannelBetween(userAId, userBId) {
        const [u1, u2] = userAId < userBId ? [userAId, userBId] : [userBId, userAId];
        const stmt = this.db.prepare('SELECT * FROM dm_channels WHERE user1_id = ? AND user2_id = ?');
        const row = stmt.get(u1, u2);
        return row ? rowToDMChannel(row) : undefined;
    }
    listDMChannelsForUser(userId) {
        const stmt = this.db.prepare(`
      SELECT * FROM dm_channels
      WHERE user1_id = ? OR user2_id = ?
      ORDER BY created_at DESC
    `);
        const rows = stmt.all(userId, userId);
        return rows.map(rowToDMChannel);
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=guilds.js.map