// FILE: backend/src/types.ts
import type { AuthDB } from './db/auth.js';
import type { GuildsDB } from './db/guilds.js';
import type { MessagesDB } from './db/messages.js';

export interface User {
  id: string;
  username: string;
  email: string;
  isOnline: boolean;
  createdAt: string;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

export interface UserPublic {
  id: string;
  username: string;
  isOnline: boolean;
}

export interface Guild {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  createdAt: string;
}

export type ChannelType = 'text' | 'voice';

export interface Channel {
  id: string;
  guildId: string;
  name: string;
  type: ChannelType;
  createdAt: string;
}

export interface DMChannel {
  id: string;
  user1Id: string;
  user2Id: string;
  createdAt: string;
}

export interface DMChannelEnriched {
  id: string;
  recipientId: string;
  recipientUsername: string;
  isOnline: boolean;
  createdAt: string;
}

export interface VoiceParticipant {
  userId: string;
  username: string;
  muted: boolean;
  deafened: boolean;
}

export interface Role {
  id: string;
  guildId: string;
  name: string;
  permissions: number;
  createdAt: string;
}

export interface Member {
  id: string;
  guildId: string;
  userId: string;
  roleId: string;
  joinedAt: string;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  authorName?: string;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export enum Permission {
  MANAGE_CHANNELS = 1,
  DELETE_MESSAGES = 2,
  ADMIN = 4,
}

export function hasPermission(userPerms: number, perm: Permission): boolean {
  if ((userPerms & Permission.ADMIN) === Permission.ADMIN) return true;
  return (userPerms & perm) === perm;
}

export interface ApiError {
  error: { code: string; message: string };
}

export interface JwtPayload {
  userId: string;
  username: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
  interface FastifyInstance {
    authDb: AuthDB;
    guildsDb: GuildsDB;
    messagesDb: MessagesDB;
  }
}
