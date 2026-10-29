// FILE: backend/tests/voice.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { createTestContext, type TestContext } from './setup.js';
import { setupWebSocket, closeWebSocketServer } from '../src/ws/handler.js';

function waitForWsMessage<T = Record<string, unknown>>(
  ws: WebSocket,
  filter?: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`WebSocket message wait timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onMessage = (data: Buffer | string) => {
      try {
        const parsed = JSON.parse(typeof data === 'string' ? data : data.toString('utf-8'));
        if (!filter || filter(parsed)) {
          cleanup();
          resolve(parsed as T);
        }
      } catch {
        // Continue waiting
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
    };

    ws.on('message', onMessage);
    ws.on('error', onError);
  });
}

describe('Voice Chat & WebRTC Signaling', () => {
  let ctx: TestContext;
  let wsUrl: string;
  let owner: { user: { id: string; username: string }; token: string };
  let memberUser: { user: { id: string; username: string }; token: string };
  let outsider: { user: { id: string; username: string }; token: string };
  let guildId: string;
  let voiceChannelId: string;
  let textChannelId: string;

  beforeAll(async () => {
    ctx = await createTestContext();

    await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    const address = ctx.app.server.address();
    if (typeof address === 'object' && address !== null) {
      wsUrl = `ws://127.0.0.1:${address.port}/ws`;
    } else {
      throw new Error('Failed to obtain server port');
    }

    setupWebSocket(ctx.app.server, ctx.databases.authDb, ctx.databases.guildsDb, ctx.databases.messagesDb);

    owner = await ctx.createTestUser('voice_owner');
    memberUser = await ctx.createTestUser('voice_member');
    outsider = await ctx.createTestUser('voice_outsider');

    // Create guild
    const guildRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/guilds',
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Voice Haven' },
    });
    const guild = guildRes.json().guild;
    guildId = guild.id;

    // Member joins guild
    await ctx.app.inject({
      method: 'POST',
      url: '/api/guilds/join',
      headers: { authorization: `Bearer ${memberUser.token}` },
      payload: { inviteCode: guild.inviteCode },
    });

    // Create voice channel
    const vChRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/guilds/${guildId}/channels`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'general-voice', type: 'voice' },
    });
    expect(vChRes.statusCode).toBe(201);
    voiceChannelId = vChRes.json().channel.id;
    expect(vChRes.json().channel.type).toBe('voice');

    const channels = ctx.databases.guildsDb.getChannelsByGuild(guildId);
    const textCh = channels.find((c) => c.type === 'text')!;
    textChannelId = textCh.id;
  });

  afterAll(async () => {
    await closeWebSocketServer();
    await ctx.close();
  });

  it('rejects sending text messages in a voice channel', async () => {
    // REST POST check
    const restRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${voiceChannelId}/messages`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { content: 'Speaking in voice channel' },
    });
    expect(restRes.statusCode).toBe(400);
    expect(restRes.json().error.code).toBe('VALIDATION_ERROR');

    // WebSocket check
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => ws.on('open', resolve));
    ws.send(JSON.stringify({ type: 'authenticate', token: owner.token }));
    await waitForWsMessage(ws, (m) => m.type === 'authenticated');

    ws.send(JSON.stringify({ type: 'send_message', channelId: voiceChannelId, content: 'Text via WS' }));
    const err = await waitForWsMessage<{ type: string; code: string }>(ws, (m) => m.type === 'error');
    expect(err.code).toBe('FORBIDDEN');
    ws.close();
  });

  it('forbids non-member from joining voice channel (FORBIDDEN)', async () => {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => ws.on('open', resolve));

    ws.send(JSON.stringify({ type: 'authenticate', token: outsider.token }));
    await waitForWsMessage(ws, (m) => m.type === 'authenticated');

    ws.send(JSON.stringify({ type: 'voice_join', channelId: voiceChannelId }));
    const err = await waitForWsMessage<{ type: string; code: string }>(ws, (m) => m.type === 'error');
    expect(err.code).toBe('FORBIDDEN');

    ws.close();
  });

  it('allows guild member to join voice channel and receive voice_participants', async () => {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => ws.on('open', resolve));

    ws.send(JSON.stringify({ type: 'authenticate', token: owner.token }));
    await waitForWsMessage(ws, (m) => m.type === 'authenticated');

    ws.send(JSON.stringify({ type: 'voice_join', channelId: voiceChannelId }));
    const participantsMsg = await waitForWsMessage<{
      type: string;
      channelId: string;
      participants: Array<{ userId: string }>;
    }>(ws, (m) => m.type === 'voice_participants');

    expect(participantsMsg.type).toBe('voice_participants');
    expect(participantsMsg.channelId).toBe(voiceChannelId);
    expect(participantsMsg.participants.length).toBe(0); // First person in channel

    ws.close();
  });

  it('notifies existing participants when another member joins and forwards voice_signal only between channel members', async () => {
    const wsOwner = new WebSocket(wsUrl);
    const wsMember = new WebSocket(wsUrl);

    await Promise.all([
      new Promise((r) => wsOwner.on('open', r)),
      new Promise((r) => wsMember.on('open', r)),
    ]);

    // Authenticate both
    wsOwner.send(JSON.stringify({ type: 'authenticate', token: owner.token }));
    wsMember.send(JSON.stringify({ type: 'authenticate', token: memberUser.token }));
    await Promise.all([
      waitForWsMessage(wsOwner, (m) => m.type === 'authenticated'),
      waitForWsMessage(wsMember, (m) => m.type === 'authenticated'),
    ]);

    // Owner joins voice
    wsOwner.send(JSON.stringify({ type: 'voice_join', channelId: voiceChannelId }));
    await waitForWsMessage(wsOwner, (m) => m.type === 'voice_participants');

    // Member joins voice
    const [memberParticipants, ownerUserJoined] = await Promise.all([
      (async () => {
        wsMember.send(JSON.stringify({ type: 'voice_join', channelId: voiceChannelId }));
        return waitForWsMessage<{
          type: string;
          participants: Array<{ userId: string; username: string }>;
        }>(wsMember, (m) => m.type === 'voice_participants');
      })(),
      waitForWsMessage<{
        type: string;
        channelId: string;
        user: { userId: string; username: string };
      }>(wsOwner, (m) => m.type === 'voice_user_joined' && m.user.userId === memberUser.user.id),
    ]);

    // Member receives owner in participants
    expect(memberParticipants.participants.some((p) => p.userId === owner.user.id)).toBe(true);
    // Owner receives member's user_joined
    expect(ownerUserJoined.user.userId).toBe(memberUser.user.id);

    // Testing voice_signal between members in the same voice channel
    wsMember.send(
      JSON.stringify({
        type: 'voice_signal',
        channelId: voiceChannelId,
        targetUserId: owner.user.id,
        data: { sdp: 'fake-offer-sdp' },
      })
    );

    const receivedSignal = await waitForWsMessage<{
      type: string;
      channelId: string;
      fromUserId: string;
      data: { sdp: string };
    }>(wsOwner, (m) => m.type === 'voice_signal');

    expect(receivedSignal.type).toBe('voice_signal');
    expect(receivedSignal.fromUserId).toBe(memberUser.user.id);
    expect(receivedSignal.data.sdp).toBe('fake-offer-sdp');

    // Testing voice_state
    wsMember.send(JSON.stringify({ type: 'voice_state', muted: true, deafened: false }));
    const stateUpdate = await waitForWsMessage<{
      type: string;
      userId: string;
      muted: boolean;
      deafened: boolean;
    }>(wsOwner, (m) => m.type === 'voice_state_update' && m.userId === memberUser.user.id);

    expect(stateUpdate.muted).toBe(true);
    expect(stateUpdate.deafened).toBe(false);

    // Testing sending signal to outsider who is not in the voice channel (rejected)
    wsMember.send(
      JSON.stringify({
        type: 'voice_signal',
        channelId: voiceChannelId,
        targetUserId: outsider.user.id,
        data: { sdp: 'invalid' },
      })
    );

    const forbiddenSignalErr = await waitForWsMessage<{ type: string; code: string }>(
      wsMember,
      (m) => m.type === 'error'
    );
    expect(forbiddenSignalErr.code).toBe('FORBIDDEN');

    // Leave voice channel
    wsMember.send(JSON.stringify({ type: 'voice_leave' }));
    const leftEvent = await waitForWsMessage<{ type: string; userId: string }>(
      wsOwner,
      (m) => m.type === 'voice_user_left' && m.userId === memberUser.user.id
    );
    expect(leftEvent.userId).toBe(memberUser.user.id);

    wsOwner.close();
    wsMember.close();
  });

  it('enforces maximum 8 participants per voice channel', async () => {
    // Create a new voice channel for limit testing
    const vChRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/guilds/${guildId}/channels`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'capacity-test', type: 'voice' },
    });
    const testChannelId = vChRes.json().channel.id;

    // Create 8 users and join guild
    const sockets: WebSocket[] = [];
    for (let i = 1; i <= 8; i++) {
      const u = await ctx.createTestUser(`cap_user_${i}`);
      await ctx.app.inject({
        method: 'POST',
        url: '/api/guilds/join',
        headers: { authorization: `Bearer ${u.token}` },
        payload: { inviteCode: ctx.databases.guildsDb.findGuildById(guildId)!.inviteCode },
      });

      const ws = new WebSocket(wsUrl);
      await new Promise((r) => ws.on('open', r));
      ws.send(JSON.stringify({ type: 'authenticate', token: u.token }));
      await waitForWsMessage(ws, (m) => m.type === 'authenticated');
      ws.send(JSON.stringify({ type: 'voice_join', channelId: testChannelId }));
      await waitForWsMessage(ws, (m) => m.type === 'voice_participants');
      sockets.push(ws);
    }

    // 9th user attempts to join
    const user9 = await ctx.createTestUser('cap_user_9');
    await ctx.app.inject({
      method: 'POST',
      url: '/api/guilds/join',
      headers: { authorization: `Bearer ${user9.token}` },
      payload: { inviteCode: ctx.databases.guildsDb.findGuildById(guildId)!.inviteCode },
    });

    const ws9 = new WebSocket(wsUrl);
    await new Promise((r) => ws9.on('open', r));
    ws9.send(JSON.stringify({ type: 'authenticate', token: user9.token }));
    await waitForWsMessage(ws9, (m) => m.type === 'authenticated');

    ws9.send(JSON.stringify({ type: 'voice_join', channelId: testChannelId }));
    const err = await waitForWsMessage<{ type: string; code: string }>(ws9, (m) => m.type === 'error');
    expect(err.code).toBe('CHANNEL_FULL');

    // Cleanup
    ws9.close();
    for (const ws of sockets) {
      ws.close();
    }
  });
});
