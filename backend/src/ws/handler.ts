// FILE: backend/src/ws/handler.ts
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { config } from '../config.js';
import type { JwtPayload, VoiceParticipant } from '../types.js';
import { Permission, hasPermission } from '../types.js';
import type { AuthDB } from '../db/auth.js';
import type { GuildsDB } from '../db/guilds.js';
import type { MessagesDB } from '../db/messages.js';

// Module-level state for WebSocket connections and subscriptions
const authenticatedClients = new Map<WebSocket, JwtPayload>();
const channelSubscriptions = new Map<string, Set<WebSocket>>();
const userConnections = new Map<string, Set<WebSocket>>();

// In-memory voice state
// channelId -> Map<userId, VoiceParticipant>
const voiceChannels = new Map<string, Map<string, VoiceParticipant>>();
// userId -> channelId
const userVoiceChannels = new Map<string, string>();

let authDbRef: AuthDB | undefined;
let guildsDbRef: GuildsDB | undefined;
let messagesDbRef: MessagesDB | undefined;
let activeWss: WebSocketServer | undefined;

// --- Zod schemas for incoming WS messages ---
const authenticateSchema = z.object({
  type: z.literal('authenticate'),
  token: z.string().min(1),
});

const subscribeChannelSchema = z.object({
  type: z.literal('subscribe_channel'),
  channelId: z.string().min(1),
});

const unsubscribeChannelSchema = z.object({
  type: z.literal('unsubscribe_channel'),
  channelId: z.string().min(1),
});

const sendMessageSchema = z.object({
  type: z.literal('send_message'),
  channelId: z.string().min(1),
  content: z.string().min(1).max(2000),
});

const editMessageSchema = z.object({
  type: z.literal('edit_message'),
  messageId: z.string().min(1),
  content: z.string().min(1).max(2000),
});

const deleteMessageSchema = z.object({
  type: z.literal('delete_message'),
  messageId: z.string().min(1),
});

const voiceJoinSchema = z.object({
  type: z.literal('voice_join'),
  channelId: z.string().min(1),
});

const voiceLeaveSchema = z.object({
  type: z.literal('voice_leave'),
});

const voiceSignalSchema = z.object({
  type: z.literal('voice_signal'),
  channelId: z.string().min(1),
  targetUserId: z.string().min(1),
  data: z.any(),
});

const voiceStateSchema = z.object({
  type: z.literal('voice_state'),
  muted: z.boolean(),
  deafened: z.boolean(),
});

const typingStartSchema = z.object({
  type: z.literal('typing_start'),
  channelId: z.string().min(1),
});

const wsMessageSchema = z.discriminatedUnion('type', [
  authenticateSchema,
  subscribeChannelSchema,
  unsubscribeChannelSchema,
  sendMessageSchema,
  editMessageSchema,
  deleteMessageSchema,
  typingStartSchema,
  voiceJoinSchema,
  voiceLeaveSchema,
  voiceSignalSchema,
  voiceStateSchema,
]);

function sendJson(ws: WebSocket, data: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export function sendError(ws: WebSocket, code: string, message: string): void {
  sendJson(ws, { type: 'error', code, message });
}

export function broadcastToChannel(channelId: string, event: object): void {
  const sentSockets = new Set<WebSocket>();
  const payload = JSON.stringify(event);

  // 1. Send to all sockets currently subscribed to this channelId
  const subscribers = channelSubscriptions.get(channelId);
  if (subscribers) {
    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
        sentSockets.add(ws);
      }
    }
  }

  // 2. If this is a DM channel, deliver to both participants' active connections
  const dm = guildsDbRef?.findDMChannelById(channelId);
  if (dm) {
    const p1Sockets = userConnections.get(dm.user1Id);
    if (p1Sockets) {
      for (const ws of p1Sockets) {
        if (!sentSockets.has(ws) && ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
          sentSockets.add(ws);
        }
      }
    }
    const p2Sockets = userConnections.get(dm.user2Id);
    if (p2Sockets) {
      for (const ws of p2Sockets) {
        if (!sentSockets.has(ws) && ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
          sentSockets.add(ws);
        }
      }
    }
    return;
  }

  // 3. If this is a guild channel, also deliver to online guild members for badges/notifications
  const channel = guildsDbRef?.findChannelById(channelId);
  if (channel) {
    const members = guildsDbRef?.getMembersByGuild(channel.guildId);
    if (members) {
      for (const member of members) {
        const sockets = userConnections.get(member.userId);
        if (sockets) {
          for (const ws of sockets) {
            if (!sentSockets.has(ws) && ws.readyState === WebSocket.OPEN) {
              ws.send(payload);
              sentSockets.add(ws);
            }
          }
        }
      }
    }
  }
}

export function broadcastPresence(userId: string, isOnline: boolean): void {
  const event = {
    type: 'presence_update',
    userId,
    isOnline,
  };
  const payload = JSON.stringify(event);

  for (const [ws] of authenticatedClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

export function broadcastToAllAuthenticated(event: object): void {
  const payload = JSON.stringify(event);
  for (const [ws] of authenticatedClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

export function getGuildVoiceStates(guildId: string): Record<string, VoiceParticipant[]> {
  const result: Record<string, VoiceParticipant[]> = {};
  if (!guildsDbRef) return result;

  const channels = guildsDbRef.getChannelsByGuild(guildId);
  for (const ch of channels) {
    if (ch.type === 'voice') {
      const participants = voiceChannels.get(ch.id);
      result[ch.id] = participants ? Array.from(participants.values()) : [];
    }
  }
  return result;
}

export function performVoiceLeave(userId: string): void {
  const channelId = userVoiceChannels.get(userId);
  if (!channelId) return;

  const channelMap = voiceChannels.get(channelId);
  if (channelMap) {
    channelMap.delete(userId);
    if (channelMap.size === 0) {
      voiceChannels.delete(channelId);
    }
  }
  userVoiceChannels.delete(userId);

  const leaveEvent = {
    type: 'voice_user_left',
    channelId,
    userId,
  };

  broadcastToAllAuthenticated(leaveEvent);
}

function removeClientFromSubscriptions(ws: WebSocket): void {
  for (const [channelId, subscribers] of channelSubscriptions) {
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      channelSubscriptions.delete(channelId);
    }
  }
}

function removeClientFromUserConnections(ws: WebSocket, userId: string): void {
  const connections = userConnections.get(userId);
  if (connections) {
    connections.delete(ws);
    if (connections.size === 0) {
      userConnections.delete(userId);
    }
  }
}

export function closeWebSocketServer(): Promise<void> {
  return new Promise((resolve) => {
    if (activeWss) {
      for (const client of activeWss.clients) {
        client.terminate();
      }
      activeWss.close(() => {
        activeWss = undefined;
        authenticatedClients.clear();
        channelSubscriptions.clear();
        userConnections.clear();
        voiceChannels.clear();
        userVoiceChannels.clear();
        resolve();
      });
    } else {
      resolve();
    }
  });
}

export function setupWebSocket(
  server: http.Server,
  authDb: AuthDB,
  guildsDb: GuildsDB,
  messagesDb: MessagesDB
): WebSocketServer {
  authDbRef = authDb;
  guildsDbRef = guildsDb;
  messagesDbRef = messagesDb;

  const wss = new WebSocketServer({ server, path: '/ws' });
  activeWss = wss;

  wss.on('connection', (ws: WebSocket) => {
    let isAuthenticated = false;

    // 5-second authentication timeout
    const authTimeout = setTimeout(() => {
      if (!isAuthenticated) {
        sendError(ws, 'UNAUTHORIZED', 'Authentication timeout');
        ws.close();
      }
    }, 5000);

    ws.on('message', (rawData: Buffer | string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(typeof rawData === 'string' ? rawData : rawData.toString('utf-8'));
      } catch {
        sendError(ws, 'INVALID_JSON', 'Invalid JSON');
        return;
      }

      const result = wsMessageSchema.safeParse(parsed);
      if (!result.success) {
        sendError(ws, 'INVALID_MESSAGE', result.error.errors.map((e) => e.message).join(', '));
        return;
      }

      const msg = result.data;

      // Handle authenticate
      if (msg.type === 'authenticate') {
        try {
          const decoded = jwt.verify(msg.token, config.JWT_SECRET) as JwtPayload;
          authenticatedClients.set(ws, decoded);
          isAuthenticated = true;
          clearTimeout(authTimeout);

          // Add to user connections
          let connections = userConnections.get(decoded.userId);
          if (!connections) {
            connections = new Set();
            userConnections.set(decoded.userId, connections);
          }
          connections.add(ws);

          // Set user online
          authDbRef?.setOnline(decoded.userId, true);
          broadcastPresence(decoded.userId, true);

          sendJson(ws, {
            type: 'authenticated',
            user: { id: decoded.userId, username: decoded.username },
          });
        } catch {
          sendError(ws, 'UNAUTHORIZED', 'Invalid or expired token');
          ws.close();
        }
        return;
      }

      // All other messages require authentication first
      if (!isAuthenticated) {
        sendError(ws, 'UNAUTHORIZED', 'Must authenticate first');
        return;
      }

      const userPayload = authenticatedClients.get(ws)!;

      switch (msg.type) {
        case 'subscribe_channel': {
          const channel = guildsDbRef?.findChannelById(msg.channelId);
          if (channel) {
            const member = guildsDbRef?.findMember(channel.guildId, userPayload.userId);
            if (!member) {
              sendError(ws, 'FORBIDDEN', 'Not a member of this guild');
              return;
            }
          } else {
            const dm = guildsDbRef?.findDMChannelById(msg.channelId);
            if (!dm) {
              sendError(ws, 'NOT_FOUND', 'Channel not found');
              return;
            }
            if (dm.user1Id !== userPayload.userId && dm.user2Id !== userPayload.userId) {
              sendError(ws, 'FORBIDDEN', 'Not a participant in this DM channel');
              return;
            }
          }

          let subscribers = channelSubscriptions.get(msg.channelId);
          if (!subscribers) {
            subscribers = new Set();
            channelSubscriptions.set(msg.channelId, subscribers);
          }
          subscribers.add(ws);

          sendJson(ws, { type: 'subscribed', channelId: msg.channelId });
          break;
        }

        case 'unsubscribe_channel': {
          const subscribers = channelSubscriptions.get(msg.channelId);
          if (subscribers) {
            subscribers.delete(ws);
            if (subscribers.size === 0) {
              channelSubscriptions.delete(msg.channelId);
            }
          }
          sendJson(ws, { type: 'unsubscribed', channelId: msg.channelId });
          break;
        }

        case 'send_message': {
          const channel = guildsDbRef?.findChannelById(msg.channelId);
          if (channel) {
            if (channel.type === 'voice') {
              sendError(ws, 'FORBIDDEN', 'Cannot send text messages in voice channels');
              return;
            }

            const member = guildsDbRef?.findMember(channel.guildId, userPayload.userId);
            if (!member) {
              sendError(ws, 'FORBIDDEN', 'Not a member of this guild');
              return;
            }
          } else {
            const dm = guildsDbRef?.findDMChannelById(msg.channelId);
            if (!dm) {
              sendError(ws, 'NOT_FOUND', 'Channel not found');
              return;
            }
            if (dm.user1Id !== userPayload.userId && dm.user2Id !== userPayload.userId) {
              sendError(ws, 'FORBIDDEN', 'Not a participant in this DM channel');
              return;
            }
          }

          const messageId = randomUUID();
          const message = messagesDbRef?.createMessage(messageId, msg.channelId, userPayload.userId, msg.content);
          if (!message) {
            sendError(ws, 'INTERNAL_ERROR', 'Failed to create message');
            return;
          }

          const enrichedMessage = {
            ...message,
            authorName: userPayload.username,
            guildId: channel ? channel.guildId : null,
          };

          broadcastToChannel(msg.channelId, {
            type: 'new_message',
            channelId: msg.channelId,
            guildId: channel ? channel.guildId : null,
            message: enrichedMessage,
          });
          break;
        }

        case 'typing_start': {
          const channel = guildsDbRef?.findChannelById(msg.channelId);
          if (channel) {
            const member = guildsDbRef?.findMember(channel.guildId, userPayload.userId);
            if (!member) {
              sendError(ws, 'FORBIDDEN', 'Not a member of this guild');
              return;
            }
          } else {
            const dm = guildsDbRef?.findDMChannelById(msg.channelId);
            if (!dm) {
              sendError(ws, 'NOT_FOUND', 'Channel not found');
              return;
            }
            if (dm.user1Id !== userPayload.userId && dm.user2Id !== userPayload.userId) {
              sendError(ws, 'FORBIDDEN', 'Not a participant in this DM channel');
              return;
            }
          }

          const username =
            userPayload.username ||
            authDbRef?.findUserById(userPayload.userId)?.username ||
            'Kullanıcı';

          const typingPayload = JSON.stringify({
            type: 'typing_indicator',
            channelId: msg.channelId,
            userId: userPayload.userId,
            username,
            data: {
              channelId: msg.channelId,
              userId: userPayload.userId,
              username,
            },
          });

          const sentSockets = new Set<WebSocket>();
          const subscribers = channelSubscriptions.get(msg.channelId);
          if (subscribers) {
            for (const subWs of subscribers) {
              if (subWs !== ws && subWs.readyState === WebSocket.OPEN) {
                subWs.send(typingPayload);
                sentSockets.add(subWs);
              }
            }
          }

          const dm = guildsDbRef?.findDMChannelById(msg.channelId);
          if (dm) {
            const otherUserId = dm.user1Id === userPayload.userId ? dm.user2Id : dm.user1Id;
            const otherSockets = userConnections.get(otherUserId);
            if (otherSockets) {
              for (const otherWs of otherSockets) {
                if (otherWs !== ws && !sentSockets.has(otherWs) && otherWs.readyState === WebSocket.OPEN) {
                  otherWs.send(typingPayload);
                  sentSockets.add(otherWs);
                }
              }
            }
          }
          break;
        }

        case 'edit_message': {
          const existingMsg = messagesDbRef?.findMessageById(msg.messageId);
          if (!existingMsg) {
            sendError(ws, 'NOT_FOUND', 'Message not found');
            return;
          }

          if (existingMsg.authorId !== userPayload.userId) {
            sendError(ws, 'FORBIDDEN', 'You can only edit your own messages');
            return;
          }

          if (existingMsg.isDeleted) {
            sendError(ws, 'FORBIDDEN', 'Cannot edit a deleted message');
            return;
          }

          const updated = messagesDbRef?.updateMessage(msg.messageId, msg.content);
          if (updated) {
            broadcastToChannel(existingMsg.channelId, {
              type: 'message_updated',
              message: {
                id: updated.id,
                channelId: updated.channelId,
                content: updated.content,
                updatedAt: updated.updatedAt,
              },
            });
          }
          break;
        }

        case 'delete_message': {
          const existingMsg = messagesDbRef?.findMessageById(msg.messageId);
          if (!existingMsg) {
            sendError(ws, 'NOT_FOUND', 'Message not found');
            return;
          }

          const isAuthor = existingMsg.authorId === userPayload.userId;
          if (!isAuthor) {
            const channel = guildsDbRef?.findChannelById(existingMsg.channelId);
            if (!channel) {
              sendError(ws, 'NOT_FOUND', 'Channel not found');
              return;
            }

            const isOwner = guildsDbRef?.isGuildOwner(channel.guildId, userPayload.userId);
            const perms = guildsDbRef?.getMemberPermissions(channel.guildId, userPayload.userId) ?? 0;
            if (!isOwner && !hasPermission(perms, Permission.DELETE_MESSAGES)) {
              sendError(ws, 'FORBIDDEN', 'No permission to delete this message');
              return;
            }
          }

          messagesDbRef?.softDeleteMessage(msg.messageId);

          broadcastToChannel(existingMsg.channelId, {
            type: 'message_deleted',
            messageId: msg.messageId,
            channelId: existingMsg.channelId,
          });
          break;
        }

        case 'voice_join': {
          const channel = guildsDbRef?.findChannelById(msg.channelId);
          if (!channel) {
            sendError(ws, 'NOT_FOUND', 'Channel not found');
            return;
          }

          if (channel.type !== 'voice') {
            sendError(ws, 'VALIDATION_ERROR', 'Channel is not a voice channel');
            return;
          }

          const member = guildsDbRef?.findMember(channel.guildId, userPayload.userId);
          if (!member) {
            sendError(ws, 'FORBIDDEN', 'Not a member of this guild');
            return;
          }

          const currentChannelId = userVoiceChannels.get(userPayload.userId);
          if (currentChannelId === msg.channelId) {
            // Already in this channel, resend current participants
            const currentParticipants = Array.from(voiceChannels.get(msg.channelId)?.values() || []).filter(
              (p) => p.userId !== userPayload.userId
            );
            sendJson(ws, {
              type: 'voice_participants',
              channelId: msg.channelId,
              participants: currentParticipants,
            });
            return;
          }

          // If in another voice channel, leave it first
          if (currentChannelId) {
            performVoiceLeave(userPayload.userId);
          }

          let channelMap = voiceChannels.get(msg.channelId);
          if (!channelMap) {
            channelMap = new Map();
            voiceChannels.set(msg.channelId, channelMap);
          }

          if (channelMap.size >= 8) {
            sendError(ws, 'CHANNEL_FULL', 'Voice channel is full (max 8 participants)');
            return;
          }

          // Existing participants to return to joiner
          const existingParticipants = Array.from(channelMap.values());

          const participantState: VoiceParticipant = {
            userId: userPayload.userId,
            username: userPayload.username,
            muted: false,
            deafened: false,
          };

          channelMap.set(userPayload.userId, participantState);
          userVoiceChannels.set(userPayload.userId, msg.channelId);

          // Send current participants to the joining user
          sendJson(ws, {
            type: 'voice_participants',
            channelId: msg.channelId,
            participants: existingParticipants,
          });

          // Broadcast user joined to other voice participants and guild members
          const joinEvent = {
            type: 'voice_user_joined',
            channelId: msg.channelId,
            user: participantState,
          };
          broadcastToAllAuthenticated(joinEvent);
          break;
        }

        case 'voice_leave': {
          performVoiceLeave(userPayload.userId);
          break;
        }

        case 'voice_signal': {
          const userChannelId = userVoiceChannels.get(userPayload.userId);
          if (!userChannelId || userChannelId !== msg.channelId) {
            sendError(ws, 'FORBIDDEN', 'You are not in this voice channel');
            return;
          }

          const targetChannelId = userVoiceChannels.get(msg.targetUserId);
          if (!targetChannelId || targetChannelId !== msg.channelId) {
            sendError(ws, 'FORBIDDEN', 'Target user is not in this voice channel');
            return;
          }

          const targetSockets = userConnections.get(msg.targetUserId);
          if (targetSockets) {
            const signalPayload = JSON.stringify({
              type: 'voice_signal',
              channelId: msg.channelId,
              fromUserId: userPayload.userId,
              data: msg.data,
            });
            for (const targetWs of targetSockets) {
              if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(signalPayload);
              }
            }
          }
          break;
        }

        case 'voice_state': {
          const channelId = userVoiceChannels.get(userPayload.userId);
          if (!channelId) {
            return;
          }

          const channelMap = voiceChannels.get(channelId);
          const state = channelMap?.get(userPayload.userId);
          if (state) {
            state.muted = msg.muted;
            state.deafened = msg.deafened;

            const updateEvent = {
              type: 'voice_state_update',
              channelId,
              userId: userPayload.userId,
              muted: msg.muted,
              deafened: msg.deafened,
            };
            broadcastToAllAuthenticated(updateEvent);
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);

      const userPayload = authenticatedClients.get(ws);
      authenticatedClients.delete(ws);
      removeClientFromSubscriptions(ws);

      if (userPayload) {
        removeClientFromUserConnections(ws, userPayload.userId);

        const remaining = userConnections.get(userPayload.userId);
        if (!remaining || remaining.size === 0) {
          // Leave voice channel if user was in one
          performVoiceLeave(userPayload.userId);

          authDbRef?.setOnline(userPayload.userId, false);
          broadcastPresence(userPayload.userId, false);
        }
      }
    });

    ws.on('error', () => {
      // Socket errors are automatically followed by 'close'
    });
  });

  return wss;
}
