// FILE: backend/tests/ws.test.ts
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
      } catch (err) {
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

describe('WebSocket Integration', () => {
  let ctx: TestContext;
  let wsPort: number;
  let wsUrl: string;
  let userA: { user: { id: string; username: string }; token: string };
  let userB: { user: { id: string; username: string }; token: string };
  let guildId: string;
  let channelId: string;

  beforeAll(async () => {
    ctx = await createTestContext();

    // Start Fastify HTTP server on random available port
    await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    const address = ctx.app.server.address();
    if (typeof address === 'object' && address !== null) {
      wsPort = address.port;
    } else {
      throw new Error('Failed to obtain server port');
    }
    wsUrl = `ws://127.0.0.1:${wsPort}/ws`;

    // Attach WS server
    setupWebSocket(ctx.app.server, ctx.databases.authDb, ctx.databases.guildsDb, ctx.databases.messagesDb);

    // Create users & guild
    userA = await ctx.createTestUser('ws_user_a');
    userB = await ctx.createTestUser('ws_user_b');

    const guildRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/guilds',
      headers: { authorization: `Bearer ${userA.token}` },
      payload: { name: 'WS Guild' },
    });
    const guild = guildRes.json().guild;
    guildId = guild.id;

    // User B joins guild
    await ctx.app.inject({
      method: 'POST',
      url: '/api/guilds/join',
      headers: { authorization: `Bearer ${userB.token}` },
      payload: { inviteCode: guild.inviteCode },
    });

    const channels = ctx.databases.guildsDb.getChannelsByGuild(guildId);
    channelId = channels[0].id;
  });

  afterAll(async () => {
    await closeWebSocketServer();
    await ctx.close();
  });

  it('rejects commands when not authenticated with UNAUTHORIZED', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise((resolve) => ws.on('open', resolve));

    // Try to send a message without authenticating first
    ws.send(JSON.stringify({ type: 'subscribe_channel', channelId }));

    const errorMsg = await waitForWsMessage<{ type: string; code: string }>(
      ws,
      (m) => m.type === 'error'
    );

    expect(errorMsg.type).toBe('error');
    expect(errorMsg.code).toBe('UNAUTHORIZED');

    ws.close();
  });

  it('rejects invalid authentication tokens', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise((resolve) => ws.on('open', resolve));

    ws.send(JSON.stringify({ type: 'authenticate', token: 'invalid.jwt.token' }));

    const errorMsg = await waitForWsMessage<{ type: string; code: string }>(
      ws,
      (m) => m.type === 'error'
    );

    expect(errorMsg.type).toBe('error');
    expect(errorMsg.code).toBe('UNAUTHORIZED');

    ws.close();
  });

  it('authenticates valid token, confirms user, and broadcasts presence', async () => {
    const wsA = new WebSocket(wsUrl);
    const wsB = new WebSocket(wsUrl);

    await Promise.all([
      new Promise((resolve) => wsA.on('open', resolve)),
      new Promise((resolve) => wsB.on('open', resolve)),
    ]);

    // Authenticate wsB first
    wsB.send(JSON.stringify({ type: 'authenticate', token: userB.token }));
    await waitForWsMessage(wsB, (m) => m.type === 'authenticated');

    // Authenticate wsA, verify authenticated event on wsA AND presence_update on wsB
    const [authEventA, presenceEventB] = await Promise.all([
      (async () => {
        wsA.send(JSON.stringify({ type: 'authenticate', token: userA.token }));
        return waitForWsMessage<{ type: string; user: { id: string; username: string } }>(
          wsA,
          (m) => m.type === 'authenticated'
        );
      })(),
      waitForWsMessage<{ type: string; userId: string; isOnline: boolean }>(
        wsB,
        (m) => m.type === 'presence_update' && m.userId === userA.user.id
      ),
    ]);

    expect(authEventA.user.id).toBe(userA.user.id);
    expect(presenceEventB.userId).toBe(userA.user.id);
    expect(presenceEventB.isOnline).toBe(true);

    wsA.close();
    wsB.close();
  });

  it('broadcasts real-time messages to subscribed channel members', async () => {
    const wsA = new WebSocket(wsUrl);
    const wsB = new WebSocket(wsUrl);

    await Promise.all([
      new Promise((resolve) => wsA.on('open', resolve)),
      new Promise((resolve) => wsB.on('open', resolve)),
    ]);

    // Authenticate both
    wsA.send(JSON.stringify({ type: 'authenticate', token: userA.token }));
    wsB.send(JSON.stringify({ type: 'authenticate', token: userB.token }));
    await Promise.all([
      waitForWsMessage(wsA, (m) => m.type === 'authenticated'),
      waitForWsMessage(wsB, (m) => m.type === 'authenticated'),
    ]);

    // Subscribe both to channelId
    wsA.send(JSON.stringify({ type: 'subscribe_channel', channelId }));
    wsB.send(JSON.stringify({ type: 'subscribe_channel', channelId }));
    await Promise.all([
      waitForWsMessage(wsA, (m) => m.type === 'subscribed'),
      waitForWsMessage(wsB, (m) => m.type === 'subscribed'),
    ]);

    // User A sends message over WS
    wsA.send(
      JSON.stringify({
        type: 'send_message',
        channelId,
        content: 'Instant message via WebSocket',
      })
    );

    // User B should receive 'new_message' event
    const received = await waitForWsMessage<{
      type: string;
      message: { content: string; authorName: string; channelId: string };
    }>(wsB, (m) => m.type === 'new_message');

    expect(received.type).toBe('new_message');
    expect(received.message.content).toBe('Instant message via WebSocket');
    expect(received.message.authorName).toBe(userA.user.username);
    expect(received.message.channelId).toBe(channelId);

    wsA.close();
    wsB.close();
  });

  it('broadcasts typing_indicator when typing_start is received', async () => {
    const wsA = new WebSocket(wsUrl);
    const wsB = new WebSocket(wsUrl);

    await Promise.all([
      new Promise((resolve) => wsA.on('open', resolve)),
      new Promise((resolve) => wsB.on('open', resolve)),
    ]);

    // Authenticate both
    wsA.send(JSON.stringify({ type: 'authenticate', token: userA.token }));
    wsB.send(JSON.stringify({ type: 'authenticate', token: userB.token }));
    await Promise.all([
      waitForWsMessage(wsA, (m) => m.type === 'authenticated'),
      waitForWsMessage(wsB, (m) => m.type === 'authenticated'),
    ]);

    // Subscribe both to channelId
    wsA.send(JSON.stringify({ type: 'subscribe_channel', channelId }));
    wsB.send(JSON.stringify({ type: 'subscribe_channel', channelId }));
    await Promise.all([
      waitForWsMessage(wsA, (m) => m.type === 'subscribed'),
      waitForWsMessage(wsB, (m) => m.type === 'subscribed'),
    ]);

    // User A starts typing
    wsA.send(
      JSON.stringify({
        type: 'typing_start',
        channelId,
      })
    );

    // User B should receive 'typing_indicator'
    const typingEvent = await waitForWsMessage<{
      type: string;
      channelId: string;
      userId: string;
      username: string;
    }>(wsB, (m) => m.type === 'typing_indicator');

    expect(typingEvent.type).toBe('typing_indicator');
    expect(typingEvent.channelId).toBe(channelId);
    expect(typingEvent.userId).toBe(userA.user.id);
    expect(typingEvent.username).toBe(userA.user.username);

    wsA.close();
    wsB.close();
  });
});
