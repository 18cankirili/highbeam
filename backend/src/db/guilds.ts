// FILE: backend/src/db/guilds.ts
import type Database from 'better-sqlite3';
import { createDb } from './connection.js';
import { config } from '../config.js';
import type { Guild, Channel, Role, Member, ChannelType, DMChannel } from '../types.js';
import path from 'path';

interface GuildRow {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
}

interface DMChannelRow {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
}

interface ChannelRow {
  id: string;
  guild_id: string;
  name: string;
  type?: string;
  created_at: string;
}

interface RoleRow {
  id: string;
  guild_id: string;
  name: string;
  permissions: number;
  created_at: string;
}

interface MemberRow {
  id: string;
  guild_id: string;
  user_id: string;
  role_id: string;
  joined_at: string;
}

function rowToGuild(row: GuildRow): Guild {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    inviteCode: row.invite_code,
    createdAt: row.created_at,
  };
}

function rowToChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    guildId: row.guild_id,
    name: row.name,
    type: (row.type as ChannelType) || 'text',
    createdAt: row.created_at,
  };
}

function rowToRole(row: RoleRow): Role {
  return {
    id: row.id,
    guildId: row.guild_id,
    name: row.name,
    permissions: row.permissions,
    createdAt: row.created_at,
  };
}

function rowToMember(row: MemberRow): Member {
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    roleId: row.role_id,
    joinedAt: row.joined_at,
  };
}

function rowToDMChannel(row: DMChannelRow): DMChannel {
  return {
    id: row.id,
    user1Id: row.user1_id,
    user2Id: row.user2_id,
    createdAt: row.created_at,
  };
}

export class GuildsDB {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const filepath = dbPath || path.join(config.DB_PATH, 'guilds.db');
    this.db = createDb(filepath);
    this.migrate();
  }

  private migrate(): void {
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
    const tableInfo = this.db.pragma('table_info(channels)') as Array<{ name: string }>;
    const hasType = tableInfo.some((col) => col.name === 'type');
    if (!hasType) {
      this.db.exec("ALTER TABLE channels ADD COLUMN type TEXT NOT NULL DEFAULT 'text' CHECK(type IN ('text', 'voice'));");
    }
  }

  createGuild(id: string, name: string, ownerId: string, inviteCode: string): Guild {
    const stmt = this.db.prepare(`
      INSERT INTO guilds (id, name, owner_id, invite_code)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, name, ownerId, inviteCode);
    return this.findGuildById(id)!;
  }

  findGuildById(id: string): Guild | undefined {
    const stmt = this.db.prepare('SELECT * FROM guilds WHERE id = ?');
    const row = stmt.get(id) as GuildRow | undefined;
    return row ? rowToGuild(row) : undefined;
  }

  findGuildByInviteCode(code: string): Guild | undefined {
    const stmt = this.db.prepare('SELECT * FROM guilds WHERE invite_code = ?');
    const row = stmt.get(code) as GuildRow | undefined;
    return row ? rowToGuild(row) : undefined;
  }

  getGuildsForUser(userId: string): Guild[] {
    const stmt = this.db.prepare(`
      SELECT g.* FROM guilds g
      INNER JOIN members m ON m.guild_id = g.id
      WHERE m.user_id = ?
      ORDER BY g.created_at ASC
    `);
    const rows = stmt.all(userId) as GuildRow[];
    return rows.map(rowToGuild);
  }

  createChannel(id: string, guildId: string, name: string, type: ChannelType = 'text'): Channel {
    const stmt = this.db.prepare(`
      INSERT INTO channels (id, guild_id, name, type)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, guildId, name, type);
    return this.findChannelById(id)!;
  }

  getChannelsByGuild(guildId: string): Channel[] {
    const stmt = this.db.prepare('SELECT * FROM channels WHERE guild_id = ? ORDER BY created_at ASC');
    const rows = stmt.all(guildId) as ChannelRow[];
    return rows.map(rowToChannel);
  }

  findChannelById(id: string): Channel | undefined {
    const stmt = this.db.prepare('SELECT * FROM channels WHERE id = ?');
    const row = stmt.get(id) as ChannelRow | undefined;
    return row ? rowToChannel(row) : undefined;
  }

  deleteChannel(id: string): void {
    const stmt = this.db.prepare('DELETE FROM channels WHERE id = ?');
    stmt.run(id);
  }

  createRole(id: string, guildId: string, name: string, permissions: number): Role {
    const stmt = this.db.prepare(`
      INSERT INTO roles (id, guild_id, name, permissions)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, guildId, name, permissions);
    return this.findRoleById(id)!;
  }

  getRolesByGuild(guildId: string): Role[] {
    const stmt = this.db.prepare('SELECT * FROM roles WHERE guild_id = ? ORDER BY created_at ASC');
    const rows = stmt.all(guildId) as RoleRow[];
    return rows.map(rowToRole);
  }

  findRoleById(id: string): Role | undefined {
    const stmt = this.db.prepare('SELECT * FROM roles WHERE id = ?');
    const row = stmt.get(id) as RoleRow | undefined;
    return row ? rowToRole(row) : undefined;
  }

  addMember(id: string, guildId: string, userId: string, roleId: string): Member {
    const stmt = this.db.prepare(`
      INSERT INTO members (id, guild_id, user_id, role_id)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, guildId, userId, roleId);
    return this.findMember(guildId, userId)!;
  }

  findMember(guildId: string, userId: string): Member | undefined {
    const stmt = this.db.prepare('SELECT * FROM members WHERE guild_id = ? AND user_id = ?');
    const row = stmt.get(guildId, userId) as MemberRow | undefined;
    return row ? rowToMember(row) : undefined;
  }

  getMembersByGuild(guildId: string): Member[] {
    const stmt = this.db.prepare('SELECT * FROM members WHERE guild_id = ? ORDER BY joined_at ASC');
    const rows = stmt.all(guildId) as MemberRow[];
    return rows.map(rowToMember);
  }

  updateMemberRole(guildId: string, userId: string, roleId: string): void {
    const stmt = this.db.prepare('UPDATE members SET role_id = ? WHERE guild_id = ? AND user_id = ?');
    stmt.run(roleId, guildId, userId);
  }

  getMemberPermissions(guildId: string, userId: string): number {
    const stmt = this.db.prepare(`
      SELECT r.permissions FROM members m
      INNER JOIN roles r ON r.id = m.role_id
      WHERE m.guild_id = ? AND m.user_id = ?
    `);
    const row = stmt.get(guildId, userId) as { permissions: number } | undefined;
    return row ? row.permissions : 0;
  }

  isGuildOwner(guildId: string, userId: string): boolean {
    const stmt = this.db.prepare('SELECT owner_id FROM guilds WHERE id = ?');
    const row = stmt.get(guildId) as { owner_id: string } | undefined;
    return row ? row.owner_id === userId : false;
  }

  createDMChannel(id: string, userAId: string, userBId: string): DMChannel {
    const [u1, u2] = userAId < userBId ? [userAId, userBId] : [userBId, userAId];
    const stmt = this.db.prepare(`
      INSERT INTO dm_channels (id, user1_id, user2_id)
      VALUES (?, ?, ?)
    `);
    stmt.run(id, u1, u2);
    return this.findDMChannelById(id)!;
  }

  findDMChannelById(id: string): DMChannel | undefined {
    const stmt = this.db.prepare('SELECT * FROM dm_channels WHERE id = ?');
    const row = stmt.get(id) as DMChannelRow | undefined;
    return row ? rowToDMChannel(row) : undefined;
  }

  findDMChannelBetween(userAId: string, userBId: string): DMChannel | undefined {
    const [u1, u2] = userAId < userBId ? [userAId, userBId] : [userBId, userAId];
    const stmt = this.db.prepare('SELECT * FROM dm_channels WHERE user1_id = ? AND user2_id = ?');
    const row = stmt.get(u1, u2) as DMChannelRow | undefined;
    return row ? rowToDMChannel(row) : undefined;
  }

  listDMChannelsForUser(userId: string): DMChannel[] {
    const stmt = this.db.prepare(`
      SELECT * FROM dm_channels
      WHERE user1_id = ? OR user2_id = ?
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(userId, userId) as DMChannelRow[];
    return rows.map(rowToDMChannel);
  }

  close(): void {
    this.db.close();
  }
}
