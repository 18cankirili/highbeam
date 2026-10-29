// FILE: backend/tests/dms.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext, type TestContext } from './setup.js';

describe('Direct Messages (DMs)', () => {
  let ctx: TestContext;
  let userA: { user: { id: string; username: string }; authHeaders: { authorization: string } };
  let userB: { user: { id: string; username: string }; authHeaders: { authorization: string } };
  let userC: { user: { id: string; username: string }; authHeaders: { authorization: string } };
  let dmChannelId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    userA = await ctx.createTestUser('dm_alice');
    userB = await ctx.createTestUser('dm_bob');
    userC = await ctx.createTestUser('dm_charlie');
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('fails to start DM with self (400)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/dms',
      headers: userA.authHeaders,
      payload: { targetUsername: userA.user.username },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('fails to start DM with non-existent user (404)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/dms',
      headers: userA.authHeaders,
      payload: { targetUsername: 'ghost_user_xyz' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('successfully creates a DM between Alice and Bob (201)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/dms',
      headers: userA.authHeaders,
      payload: { targetUsername: userB.user.username },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.dmChannel).toBeDefined();
    expect(body.dmChannel.id).toBeDefined();
    expect(body.dmChannel.recipientUsername).toBe(userB.user.username);
    expect(body.dmChannel.recipientId).toBe(userB.user.id);
    dmChannelId = body.dmChannel.id;
  });

  it('returns existing DM channel on duplicate creation request (200)', async () => {
    // Bob initiates with Alice
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/dms',
      headers: userB.authHeaders,
      payload: { targetUsername: userA.user.username },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dmChannel.id).toBe(dmChannelId);
    expect(body.dmChannel.recipientUsername).toBe(userA.user.username);
    expect(body.dmChannel.recipientId).toBe(userA.user.id);
  });

  it('lists DM channels with enriched recipient details', async () => {
    // Alice's perspective
    const resA = await ctx.app.inject({
      method: 'GET',
      url: '/api/dms',
      headers: userA.authHeaders,
    });

    expect(resA.statusCode).toBe(200);
    const bodyA = resA.json();
    expect(bodyA.dmChannels.length).toBe(1);
    expect(bodyA.dmChannels[0].id).toBe(dmChannelId);
    expect(bodyA.dmChannels[0].recipientUsername).toBe(userB.user.username);

    // Bob's perspective
    const resB = await ctx.app.inject({
      method: 'GET',
      url: '/api/dms',
      headers: userB.authHeaders,
    });

    expect(resB.statusCode).toBe(200);
    const bodyB = resB.json();
    expect(bodyB.dmChannels.length).toBe(1);
    expect(bodyB.dmChannels[0].id).toBe(dmChannelId);
    expect(bodyB.dmChannels[0].recipientUsername).toBe(userA.user.username);
  });

  it('allows Alice to send a message in the DM channel (201)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${dmChannelId}/messages`,
      headers: userA.authHeaders,
      payload: { content: 'Hey Bob, this is a secret DM!' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.message.content).toBe('Hey Bob, this is a secret DM!');
    expect(body.message.authorId).toBe(userA.user.id);
  });

  it('allows Bob to read messages in the DM channel (200)', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/channels/${dmChannelId}/messages`,
      headers: userB.authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.messages.length).toBeGreaterThanOrEqual(1);
    expect(body.messages[0].content).toBe('Hey Bob, this is a secret DM!');
  });

  it('forbids Charlie (non-participant) from sending messages to the DM channel (403)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${dmChannelId}/messages`,
      headers: userC.authHeaders,
      payload: { content: 'I am snooping into your DM!' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('forbids Charlie (non-participant) from reading messages from the DM channel (403)', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/channels/${dmChannelId}/messages`,
      headers: userC.authHeaders,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });
});
