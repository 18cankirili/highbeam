// FILE: backend/tests/permissions.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext, type TestContext } from './setup.js';
import { Permission } from '../src/types.js';

describe('Permissions and Role System', () => {
  let ctx: TestContext;
  let owner: { user: { id: string; username: string }; authHeaders: { authorization: string } };
  let memberUser: { user: { id: string; username: string }; authHeaders: { authorization: string } };
  let outsider: { user: { id: string; username: string }; authHeaders: { authorization: string } };
  let guildId: string;
  let generalChannelId: string;
  let adminRoleId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    owner = await ctx.createTestUser('owner_perm');
    memberUser = await ctx.createTestUser('member_perm');
    outsider = await ctx.createTestUser('outsider_perm');
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creating a guild sets up default roles and #general channel', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/guilds',
      headers: owner.authHeaders,
      payload: { name: 'Highbeam Fortress' },
    });

    expect(res.statusCode).toBe(201);
    const { guild } = res.json();
    guildId = guild.id;
    expect(guild.ownerId).toBe(owner.user.id);
    expect(guild.inviteCode).toBeDefined();

    // Verify general channel exists
    const channels = ctx.databases.guildsDb.getChannelsByGuild(guildId);
    expect(channels.length).toBe(1);
    expect(channels[0].name).toBe('general');
    generalChannelId = channels[0].id;

    // Verify default roles: owner (7), admin (7), member (0)
    const roles = ctx.databases.guildsDb.getRolesByGuild(guildId);
    expect(roles.length).toBe(3);
    const adminRole = roles.find((r) => r.name === 'admin');
    const memberRole = roles.find((r) => r.name === 'member');
    expect(adminRole).toBeDefined();
    expect(memberRole).toBeDefined();
    adminRoleId = adminRole!.id;
  });

  it('rejects outsider from accessing guild details and channels (403)', async () => {
    const guildRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/guilds/${guildId}`,
      headers: outsider.authHeaders,
    });
    expect(guildRes.statusCode).toBe(403);

    const chRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/guilds/${guildId}/channels`,
      headers: outsider.authHeaders,
    });
    expect(chRes.statusCode).toBe(403);
  });

  it('allows joining via invite code with default member role', async () => {
    const guild = ctx.databases.guildsDb.findGuildById(guildId)!;

    const joinRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/guilds/join',
      headers: memberUser.authHeaders,
      payload: { inviteCode: guild.inviteCode },
    });

    expect(joinRes.statusCode).toBe(200);

    // Verify permissions are 0 for regular member
    const perms = ctx.databases.guildsDb.getMemberPermissions(guildId, memberUser.user.id);
    expect(perms).toBe(0);
  });

  it('forbids normal member without MANAGE_CHANNELS from creating a channel (403)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/guilds/${guildId}/channels`,
      headers: memberUser.authHeaders,
      payload: { name: 'unauthorized-channel' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('allows guild owner to create channels', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/guilds/${guildId}/channels`,
      headers: owner.authHeaders,
      payload: { name: 'announcements' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().channel.name).toBe('announcements');
  });

  it('allows admin role to create channels after role promotion', async () => {
    // Owner promotes memberUser to admin
    const promoteRes = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/guilds/${guildId}/members/${memberUser.user.id}/role`,
      headers: owner.authHeaders,
      payload: { roleId: adminRoleId },
    });

    expect(promoteRes.statusCode).toBe(200);

    // Member can now create a channel
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/guilds/${guildId}/channels`,
      headers: memberUser.authHeaders,
      payload: { name: 'admin-discussions' },
    });

    expect(createRes.statusCode).toBe(201);
    expect(createRes.json().channel.name).toBe('admin-discussions');
  });

  it('prevents changing the guild owner role', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/guilds/${guildId}/members/${owner.user.id}/role`,
      headers: memberUser.authHeaders,
      payload: { roleId: adminRoleId },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('handles message deletion permissions correctly', async () => {
    // 1. Create a regular user with role 'member' (0 perms)
    const normalUser = await ctx.createTestUser('normal_delete_test');
    const guild = ctx.databases.guildsDb.findGuildById(guildId)!;
    await ctx.app.inject({
      method: 'POST',
      url: '/api/guilds/join',
      headers: normalUser.authHeaders,
      payload: { inviteCode: guild.inviteCode },
    });

    // 2. Owner posts a message
    const msgRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${generalChannelId}/messages`,
      headers: owner.authHeaders,
      payload: { content: "Owner's message" },
    });
    const messageId = msgRes.json().message.id;

    // 3. Normal member attempts to delete owner's message -> 403 FORBIDDEN
    const delRes1 = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/messages/${messageId}`,
      headers: normalUser.authHeaders,
    });
    expect(delRes1.statusCode).toBe(403);

    // 4. Admin member deletes owner's message -> 200 SUCCESS (has DELETE_MESSAGES via admin)
    const delRes2 = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/messages/${messageId}`,
      headers: memberUser.authHeaders, // was promoted to admin earlier
    });
    expect(delRes2.statusCode).toBe(200);
    expect(delRes2.json().success).toBe(true);

    // 5. Verify message is soft-deleted
    const fetched = ctx.databases.messagesDb.findMessageById(messageId)!;
    expect(fetched.isDeleted).toBe(true);
    expect(fetched.content).toBe('[deleted]');
  });
});
