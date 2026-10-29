// FILE: frontend/src/components/MemberList.tsx
import { useMemo } from 'react';
import type { MemberInfo, Channel, VoiceParticipant } from '../types';
import { OnlineIndicator } from './OnlineIndicator';

interface MemberListProps {
  members: MemberInfo[];
  channels?: Channel[];
  voiceStates?: Record<string, VoiceParticipant[]>;
  speakingMap?: Map<string, boolean>;
}

export function MemberList({
  members = [],
  channels = [],
  voiceStates = {},
  speakingMap = new Map(),
}: MemberListProps) {
  // Map of userId -> voice channel name
  const userVoiceChannelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const [chId, participants] of Object.entries(voiceStates || {})) {
      const channel = channels.find((c) => c.id === chId);
      const chName = channel?.name || 'sesli';
      if (Array.isArray(participants)) {
        for (const p of participants) {
          if (p && p.userId) {
            map.set(p.userId, chName);
          }
        }
      }
    }
    return map;
  }, [voiceStates, channels]);

  const { online, offline } = useMemo(() => {
    const on: MemberInfo[] = [];
    const off: MemberInfo[] = [];
    if (Array.isArray(members)) {
      for (const m of members) {
        if (!m) continue;
        if (m.isOnline) on.push(m);
        else off.push(m);
      }
    }
    on.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
    off.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
    return { online: on, offline: off };
  }, [members]);

  const renderMember = (member: MemberInfo) => {
    if (!member || !member.id) return null;

    const username = member.username || 'Bilinmeyen';
    const voiceChannelName = userVoiceChannelMap.get(member.userId);
    const isSpeaking = Boolean(speakingMap?.get(member.userId));
    const roleLower = (member.roleName || '').toLowerCase();

    return (
      <div
        key={member.id}
        className={`member-item ${!member.isOnline ? 'offline' : ''}`}
      >
        {/* Avatar with status & speaking ring */}
        <div className="member-avatar-wrapper">
          <div
            className={`member-avatar ${isSpeaking ? 'speaking' : ''}`}
            title={isSpeaking ? `${username} konuşuyor` : username}
          >
            {username[0]?.toUpperCase() ?? '?'}
          </div>
          <div style={{ position: 'absolute', bottom: -1, right: -1 }}>
            <OnlineIndicator isOnline={Boolean(member.isOnline)} />
          </div>
        </div>

        {/* Member info */}
        <div className="member-info">
          <div className="member-name">
            {username}
          </div>

          {/* Voice Channel Activity */}
          {voiceChannelName && (
            <div className="member-voice-badge" title={`Ses kanalında: #${voiceChannelName}`}>
              <span>🔊</span>
              <span>#{voiceChannelName}</span>
            </div>
          )}

          {/* Role badge */}
          {roleLower && roleLower !== 'member' && (
            <span
              className={`member-role-badge ${
                roleLower === 'owner' ? 'member-role-owner' : 'member-role-admin'
              }`}
            >
              {member.roleName}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="member-panel">
      <div className="member-section-header">
        <span>Üyeler</span>
        <span style={{ opacity: 0.6 }}>{Array.isArray(members) ? members.length : 0}</span>
      </div>

      {/* Online Section */}
      <div className="member-section-header" style={{ marginTop: 8 }}>
        <span>Çevrimiçi</span>
        <span>({online.length})</span>
      </div>
      {online.length > 0 ? (
        online.map(renderMember)
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 8px' }}>
          Çevrimiçi üye yok
        </div>
      )}

      {/* Offline Section */}
      <div className="member-section-header" style={{ marginTop: 16 }}>
        <span>Çevrimdışı</span>
        <span>({offline.length})</span>
      </div>
      {offline.length > 0 ? (
        offline.map(renderMember)
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 8px' }}>
          Çevrimdışı üye yok
        </div>
      )}
    </div>
  );
}
