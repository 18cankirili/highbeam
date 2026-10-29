// FILE: frontend/src/components/ChannelList.tsx
import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Guild, Channel } from '../types';
import { CreateChannelModal } from './CreateChannelModal';
import { VoiceStatusBar } from './VoiceStatusBar';
import { Tooltip } from './Tooltip';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import { useVoice } from '../context/VoiceContext';
import { useToast } from '../context/ToastContext';
import { api } from '../api/client';

interface ChannelListProps {
  guild: Guild;
  channels: Channel[];
  selectedChannelId: string | null;
  onSelectChannel: (id: string) => void;
  onChannelCreated: (channel: Channel) => void;
}

export function ChannelList({
  guild,
  channels,
  selectedChannelId,
  onSelectChannel,
  onChannelCreated,
}: ChannelListProps) {
  const { user } = useAuth();
  const { unreadCounts, registerChannelGuild } = useWebSocket();
  const toast = useToast();

  useEffect(() => {
    channels.forEach((c) => {
      registerChannelGuild(c.id, guild.id);
    });
  }, [channels, guild.id, registerChannelGuild]);
  const {
    currentVoiceChannelId,
    joinVoice,
    voiceStates,
    speakingMap,
    setInitialVoiceStates,
  } = useVoice();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState<'text' | 'voice'>('text');
  const [copied, setCopied] = useState(false);

  // Fetch active voice states whenever guild changes
  useEffect(() => {
    api.guilds
      .getVoiceStates(guild.id)
      .then((states) => {
        setInitialVoiceStates(states);
      })
      .catch(() => {});
  }, [guild.id, setInitialVoiceStates]);

  const handleCopyInvite = useCallback(() => {
    navigator.clipboard
      .writeText(guild.inviteCode)
      .then(() => {
        setCopied(true);
        toast.success('Davet kodu panoya kopyalandı!');
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        toast.error('Davet kodu kopyalanamadı');
      });
  }, [guild.inviteCode, toast]);

  const isOwner = user?.id === guild.ownerId;

  const textChannels = useMemo(
    () => channels.filter((c) => c.type !== 'voice'),
    [channels]
  );
  const voiceChannels = useMemo(
    () => channels.filter((c) => c.type === 'voice'),
    [channels]
  );

  return (
    <>
      <div className="channel-panel">
        {/* Guild header */}
        <div
          style={{
            padding: '16px',
            borderBottom: '1px solid var(--border)',
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: '0.2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface-elevated)',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {guild.name}
          </span>
        </div>

        {/* Invite code */}
        <div
          style={{
            padding: '8px 14px',
            borderBottom: '1px solid var(--border)',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: 'var(--text-muted)',
            background: 'rgba(0,0,0,0.1)',
          }}
        >
          <span>
            Davet:{' '}
            <code
              style={{
                background: 'var(--bg-primary)',
                padding: '2px 6px',
                borderRadius: 4,
                color: 'var(--accent)',
                fontSize: 12,
                fontFamily: 'monospace',
                border: '1px solid rgba(255, 152, 0, 0.2)',
              }}
            >
              {guild.inviteCode}
            </code>
          </span>
          <Tooltip content={copied ? 'Kopyalandı!' : 'Davet Kodunu Kopyala'} position="left">
            <button
              className="btn-icon"
              onClick={handleCopyInvite}
              style={{ fontSize: 13, padding: '4px 8px' }}
            >
              {copied ? '✓' : '⧉'}
            </button>
          </Tooltip>
        </div>

        {/* Channels scrollable container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 6px 16px' }}>
          {/* TEXT CHANNELS SECTION */}
          <div
            style={{
              padding: '6px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                color: 'var(--text-muted)',
              }}
            >
              Metin Kanalları
            </span>
            {isOwner && (
              <Tooltip content="Metin Kanalı Oluştur" position="top">
                <button
                  className="btn-icon"
                  onClick={() => {
                    setCreateType('text');
                    setShowCreateModal(true);
                  }}
                  style={{ fontSize: 16, width: 22, height: 22, padding: 0 }}
                >
                  +
                </button>
              </Tooltip>
            )}
          </div>

          {textChannels.map((channel) => {
            const isSelected = channel.id === selectedChannelId;
            const unread = unreadCounts[channel.id] || 0;
            return (
              <div
                key={channel.id}
                onClick={() => onSelectChannel(channel.id)}
                className={`channel-item ${isSelected ? 'active' : ''}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span className="channel-icon">#</span>
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {channel.name}
                  </span>
                </div>
                {unread > 0 && !isSelected && (
                  <span className="unread-badge-inline">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </div>
            );
          })}

          {textChannels.length === 0 && (
            <div
              style={{
                padding: '8px 12px',
                color: 'var(--text-muted)',
                fontSize: 12,
              }}
            >
              Metin kanalı yok
            </div>
          )}

          {/* VOICE CHANNELS SECTION */}
          <div
            style={{
              padding: '16px 8px 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                color: 'var(--text-muted)',
              }}
            >
              Ses Kanalları
            </span>
            {isOwner && (
              <Tooltip content="Ses Kanalı Oluştur" position="top">
                <button
                  className="btn-icon"
                  onClick={() => {
                    setCreateType('voice');
                    setShowCreateModal(true);
                  }}
                  style={{ fontSize: 16, width: 22, height: 22, padding: 0 }}
                >
                  +
                </button>
              </Tooltip>
            )}
          </div>

          {voiceChannels.map((channel) => {
            const isInThisVoice = currentVoiceChannelId === channel.id;
            const participants = voiceStates[channel.id] || [];

            return (
              <div key={channel.id} style={{ marginBottom: 4 }}>
                {/* Voice channel row */}
                <div
                  onClick={() => joinVoice(channel.id, channel.name)}
                  className={`channel-item ${isInThisVoice ? 'active' : ''}`}
                  style={{
                    borderLeftColor: isInThisVoice ? 'var(--success)' : 'transparent',
                    boxShadow: isInThisVoice
                      ? 'inset 4px 0 12px rgba(0, 230, 118, 0.2)'
                      : undefined,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 14,
                        color: isInThisVoice ? 'var(--success)' : 'var(--text-muted)',
                      }}
                    >
                      🔊
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: isInThisVoice ? 700 : 500,
                        color: isInThisVoice ? 'var(--success)' : undefined,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {channel.name}
                    </span>
                  </div>

                  {participants.length > 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        background: 'rgba(255, 255, 255, 0.08)',
                        padding: '1px 6px',
                        borderRadius: 10,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {participants.length}/8
                    </span>
                  )}
                </div>

                {/* Participants in this voice channel */}
                {participants.length > 0 && (
                  <div
                    style={{
                      paddingLeft: 22,
                      marginTop: 2,
                      marginBottom: 6,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                    }}
                  >
                    {participants.map((p) => {
                      const isSpeaking = speakingMap.get(p.userId) ?? false;

                      return (
                        <div
                          key={p.userId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: 'rgba(0,0,0,0.2)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              minWidth: 0,
                            }}
                          >
                            <div
                              className={`voice-avatar ${isSpeaking ? 'speaking' : ''}`}
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                background: 'var(--bg-active)',
                                color: 'var(--text-primary)',
                                fontSize: 10,
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                transition: 'all 0.15s ease',
                              }}
                            >
                              {p.username[0]?.toUpperCase() ?? '?'}
                            </div>
                            <span
                              style={{
                                fontSize: 12,
                                color: isSpeaking
                                  ? '#00E676'
                                  : 'var(--text-secondary)',
                                fontWeight: isSpeaking ? 600 : 400,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {p.username}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {p.muted && (
                              <Tooltip content="Susturuldu" position="left">
                                <span style={{ fontSize: 11, color: 'var(--danger)' }}>
                                  🔇
                                </span>
                              </Tooltip>
                            )}
                            {p.deafened && (
                              <Tooltip content="Sağırlaştırıldı" position="left">
                                <span style={{ fontSize: 11, color: 'var(--danger)' }}>
                                  🚫
                                </span>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {voiceChannels.length === 0 && (
            <div
              style={{
                padding: '8px 12px',
                color: 'var(--text-muted)',
                fontSize: 12,
              }}
            >
              Ses kanalı yok
            </div>
          )}
        </div>

        {/* Voice status bar */}
        <VoiceStatusBar />

        {/* User profile bar */}
        <div
          style={{
            padding: '12px 14px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface-elevated)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                boxShadow: 'var(--neon-glow)',
                flexShrink: 0,
              }}
            >
              {(user?.username?.[0] ?? '?').toUpperCase()}
            </div>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user?.username}
            </span>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <CreateChannelModal
          guildId={guild.id}
          initialType={createType}
          onClose={() => setShowCreateModal(false)}
          onCreated={(channel) => {
            onChannelCreated(channel);
            setShowCreateModal(false);
            toast.success(
              `#${channel.name} (${
                channel.type === 'voice' ? 'Sesli' : 'Metin'
              }) kanalı oluşturuldu!`
            );
          }}
        />
      )}
    </>
  );
}
