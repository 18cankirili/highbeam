// FILE: frontend/src/api/client.ts
import type { User, Guild, Channel, Message, MemberInfo, VoiceParticipant, DMChannelEnriched } from '../types';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Request failed' } }));
    throw new Error(err.error?.message || 'Request failed');
  }
  return res.json();
}

export const api = {
  auth: {
    register: (data: { username: string; email: string; password: string }) =>
      request<{ user: User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }).then((r) => r.user),
    login: (data: { username: string; password: string }) =>
      request<{ user: User; token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    logout: () =>
      request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
    me: () =>
      request<{ user: User }>('/auth/me').then((r) => r.user),
  },
  guilds: {
    create: (data: { name: string }) =>
      request<{ guild: Guild }>('/guilds', {
        method: 'POST',
        body: JSON.stringify(data),
      }).then((r) => r.guild),
    list: () =>
      request<{ guilds: Guild[] }>('/guilds').then((r) => r.guilds),
    get: (id: string) =>
      request<{ guild: Guild }>(`/guilds/${id}`).then((r) => r.guild),
    join: (inviteCode: string) =>
      request<{ guild: Guild }>('/guilds/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      }).then((r) => r.guild),
    getMembers: (id: string) =>
      request<{ members: MemberInfo[] }>(`/guilds/${id}/members`).then((r) => r.members),
    getChannels: (id: string) =>
      request<{ channels: Channel[] }>(`/guilds/${id}/channels`).then((r) => r.channels),
    createChannel: (guildId: string, data: { name: string; type?: 'text' | 'voice' }) =>
      request<{ channel: Channel }>(`/guilds/${guildId}/channels`, {
        method: 'POST',
        body: JSON.stringify(data),
      }).then((r) => r.channel),
    getVoiceStates: (guildId: string) =>
      request<{ voiceStates: Record<string, VoiceParticipant[]> }>(`/guilds/${guildId}/voice-states`).then(
        (r) => r.voiceStates
      ),
  },
  messages: {
    list: (channelId: string, cursor?: string, limit?: number) => {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      return request<{ messages: Message[]; nextCursor: string | null }>(
        `/channels/${channelId}/messages${qs ? `?${qs}` : ''}`
      );
    },
    create: (channelId: string, content: string) =>
      request<{ message: Message }>(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }).then((r) => r.message),
    update: (messageId: string, content: string) =>
      request<{ message: Message }>(`/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }).then((r) => r.message),
    delete: (messageId: string) =>
      request<{ success: boolean }>(`/messages/${messageId}`, {
        method: 'DELETE',
      }),
  },
  dms: {
    list: () =>
      request<{ dmChannels: DMChannelEnriched[] }>('/dms').then((r) => r.dmChannels),
    create: (data: { targetUsername: string }) =>
      request<{ dmChannel: DMChannelEnriched }>('/dms', {
        method: 'POST',
        body: JSON.stringify(data),
      }).then((r) => r.dmChannel),
  },
};
