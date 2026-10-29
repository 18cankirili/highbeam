// FILE: backend/tests/messages.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext, type TestContext } from './setup.js';

describe('Messages & Cursor Pagination', () => {
  let ctx: TestContext;
  let author: { user: { id: string; username: string }; authHeaders: { authorization: string } };
  let otherMember: { user: { id: string; username: string }; authHeaders: { authorization: string } };
  let nonMember: { user: { id: string; username: string }; authHeaders: { authorization: string } };
  let guildId: string;
  let channelId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    author = await ctx.createTestUser('msg_author');
    otherMember = await ctx.createTestUser('msg_other');
    nonMember = await ctx.createTestUser('msg_nonmember');

    // Create guild
    const guildRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/guilds',
      headers: author.authHeaders,
      payload: { name: 'Chat Realm' },
    });
    const guild = guildRes.json().guild;
    guildId = guild.id;

    // Join otherMember
    await ctx.app.inject({
      method: 'POST',
      url: '/api/guilds/join',
      headers: otherMember.authHeaders,
      payload: { inviteCode: guild.inviteCode },
    });

    // Get channel
    const channels = ctx.databases.guildsDb.getChannelsByGuild(guildId);
    channelId = channels[0].id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('allows guild member to send message (201)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${channelId}/messages`,
      headers: author.authHeaders,
      payload: { content: 'Hello Highbeam world!' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.message.content).toBe('Hello Highbeam world!');
    expect(body.message.authorName).toBe(author.user.username);
    expect(body.message.isDeleted).toBe(false);
    expect(body.message.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('forbids non-member from sending message (403)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${channelId}/messages`,
      headers: nonMember.authHeaders,
      payload: { content: 'I should not be allowed here' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('allows author to edit their own message (200)', async () => {
    const sendRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${channelId}/messages`,
      headers: author.authHeaders,
      payload: { content: 'Original text' },
    });
    const messageId = sendRes.json().message.id;

    const editRes = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/messages/${messageId}`,
      headers: author.authHeaders,
      payload: { content: 'Updated text' },
    });

    expect(editRes.statusCode).toBe(200);
    expect(editRes.json().message.content).toBe('Updated text');
    expect(editRes.json().message.updatedAt).toBeDefined();
  });

  it('forbids non-author from editing a message (403)', async () => {
    const sendRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${channelId}/messages`,
      headers: author.authHeaders,
      payload: { content: 'Untouchable by others' },
    });
    const messageId = sendRes.json().message.id;

    const editRes = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/messages/${messageId}`,
      headers: otherMember.authHeaders,
      payload: { content: 'Attempted hijack' },
    });

    expect(editRes.statusCode).toBe(403);
    expect(editRes.json().error.code).toBe('FORBIDDEN');
  });

  it('supports cursor-based pagination with limit and nextCursor without skipping or repeating messages', async () => {
    // Create dedicated channel for pagination test
    const chRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/guilds/${guildId}/channels`,
      headers: author.authHeaders,
      payload: { name: 'pagination-test' },
    });
    const pagChannelId = chRes.json().channel.id;

    // Send 5 messages in immediate succession
    const sentIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/channels/${pagChannelId}/messages`,
        headers: author.authHeaders,
        payload: { content: `Message #${i}` },
      });
      expect(res.statusCode).toBe(201);
      sentIds.push(res.json().message.id);
    }

    // Page 1: limit 2
    const page1Res = await ctx.app.inject({
      method: 'GET',
      url: `/api/channels/${pagChannelId}/messages?limit=2`,
      headers: author.authHeaders,
    });

    expect(page1Res.statusCode).toBe(200);
    const page1 = page1Res.json();
    expect(page1.messages.length).toBe(2);
    expect(page1.nextCursor).toBeDefined();
    expect(typeof page1.nextCursor).toBe('string');

    // Verify ordering: newest first (Message #5, then Message #4)
    expect(page1.messages[0].content).toBe('Message #5');
    expect(page1.messages[1].content).toBe('Message #4');
    expect(page1.messages[0].id).toBe(sentIds[4]);
    expect(page1.messages[1].id).toBe(sentIds[3]);

    // Page 2: with cursor from page 1
    const page2Res = await ctx.app.inject({
      method: 'GET',
      url: `/api/channels/${pagChannelId}/messages?limit=2&cursor=${page1.nextCursor}`,
      headers: author.authHeaders,
    });

    expect(page2Res.statusCode).toBe(200);
    const page2 = page2Res.json();
    expect(page2.messages.length).toBe(2);
    expect(page2.nextCursor).toBeDefined();
    expect(page2.messages[0].content).toBe('Message #3');
    expect(page2.messages[1].content).toBe('Message #2');
    expect(page2.messages[0].id).toBe(sentIds[2]);
    expect(page2.messages[1].id).toBe(sentIds[1]);

    // Page 3: final message
    const page3Res = await ctx.app.inject({
      method: 'GET',
      url: `/api/channels/${pagChannelId}/messages?limit=2&cursor=${page2.nextCursor}`,
      headers: author.authHeaders,
    });

    expect(page3Res.statusCode).toBe(200);
    const page3 = page3Res.json();
    expect(page3.messages.length).toBe(1);
    expect(page3.messages[0].content).toBe('Message #1');
    expect(page3.messages[0].id).toBe(sentIds[0]);
    // Since there are no more messages, nextCursor must be null
    expect(page3.nextCursor).toBeNull();

    // Verify all 5 messages were collected without duplicates and without omission
    const allCollected = [
      ...page1.messages,
      ...page2.messages,
      ...page3.messages,
    ];
    expect(allCollected.length).toBe(5);

    const collectedIds = allCollected.map((m: { id: string }) => m.id);
    const uniqueIds = new Set(collectedIds);
    expect(uniqueIds.size).toBe(5);
    expect(collectedIds).toEqual([
      sentIds[4],
      sentIds[3],
      sentIds[2],
      sentIds[1],
      sentIds[0],
    ]);
  });
});
