// FILE: frontend/src/types.ts
export interface User {
  id: string;
  username: string;
  email?: string;
  isOnline?: boolean;
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

export interface VoiceParticipant {
  userId: string;
  username: string;
  muted: boolean;
  deafened: boolean;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  authorName?: string;
  content: string;
  createdAt: string;
  updatedAt?: string | null;
  isDeleted?: boolean;
}

export interface MemberInfo {
  id: string;
  guildId: string;
  userId: string;
  roleId: string;
  joinedAt: string;
  username: string;
  isOnline: boolean;
  roleName: string;
  permissions: number;
}

export interface DMChannelEnriched {
  id: string;
  recipientId: string;
  recipientUsername: string;
  isOnline: boolean;
  createdAt: string;
}
