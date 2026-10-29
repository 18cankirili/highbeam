// FILE: frontend/src/components/Sidebar.tsx
import { useState, useMemo } from 'react';
import type { Guild } from '../types';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import { useToast } from '../context/ToastContext';
import { Tooltip } from './Tooltip';
import { CreateGuildModal } from './CreateGuildModal';
import { JoinGuildModal } from './JoinGuildModal';

interface SidebarProps {
  guilds: Guild[];
  selectedGuildId: string | null;
  dmChannelIds?: string[];
  onSelectGuild: (id: string) => void;
  onGuildCreated: (guild: Guild) => void;
  onGuildJoined: (guild: Guild) => void;
}

interface SafeGuildItem extends Guild {
  initials: string;
}

export function Sidebar({
  guilds,
  selectedGuildId,
  dmChannelIds = [],
  onSelectGuild,
  onGuildCreated,
  onGuildJoined,
}: SidebarProps) {
  const { logout, user } = useAuth();
  const { getGuildUnreadCount, getDMUnreadCount } = useWebSocket();
  const toast = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Crash-proof guild initials and safe filtering
  const safeGuilds = useMemo<SafeGuildItem[]>(() => {
    if (!Array.isArray(guilds)) return [];

    return guilds
      .filter((g): g is Guild => {
        return Boolean(
          g &&
          typeof g.id === 'string' &&
          g.id.trim().length > 0 &&
          typeof g.name === 'string' &&
          g.name.trim().length > 0
        );
      })
      .map((g) => {
        const cleanName = (g.name || '').trim();
        const words = cleanName.split(/\s+/).filter(Boolean);

        let initials = 'HB';
        if (words.length > 1 && words[0]?.[0] && words[1]?.[0]) {
          initials = (words[0][0] + words[1][0]).toUpperCase();
        } else if (words.length === 1 && words[0]) {
          initials = words[0].slice(0, 2).toUpperCase();
        }

        return {
          ...g,
          initials: initials || 'HB',
        };
      });
  }, [guilds]);

  const handleLogout = async () => {
    try {
      await logout();
      toast.info('Başarıyla çıkış yapıldı');
    } catch (err) {
      console.error(err);
      toast.error('Çıkış yapılırken bir hata oluştu');
    }
  };

  const dmUnread = getDMUnreadCount(dmChannelIds);

  return (
    <>
      <aside className="sidebar">
        {/* Highbeam Brand Logo / Direct Messages (Home) */}
        <Tooltip
          content="Direkt Mesajlar"
          position="right"
          onClick={() => onSelectGuild('HOME')}
        >
          <button
            type="button"
            className={`guild-icon ${selectedGuildId === 'HOME' || !selectedGuildId ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectGuild('HOME');
            }}
            aria-label="Direkt Mesajlar"
            style={{
              position: 'relative',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              outline: 'none',
              background:
                selectedGuildId === 'HOME' || !selectedGuildId
                  ? 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)'
                  : 'var(--bg-surface)',
              boxShadow:
                selectedGuildId === 'HOME' || !selectedGuildId
                  ? 'var(--neon-glow-strong)'
                  : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'visible',
            }}
          >
            <div className="guild-indicator" style={{ pointerEvents: 'none' }} />
            <img
              src="/logo.svg"
              alt="Highbeam"
              style={{
                width: 28,
                height: 28,
                pointerEvents: 'none',
                filter:
                  selectedGuildId === 'HOME' || !selectedGuildId
                    ? 'brightness(1.2)'
                    : 'none',
              }}
            />
            {dmUnread > 0 && (
              <span className="unread-badge">
                {dmUnread > 99 ? '99+' : dmUnread}
              </span>
            )}
          </button>
        </Tooltip>

        <div
          style={{
            width: 32,
            height: 1,
            background: 'var(--border)',
            margin: '4px 0',
          }}
        />

        {/* Guild list */}
        {safeGuilds.map((guild) => {
          if (!guild || !guild.id) return null;
          const isSelected = guild.id === selectedGuildId;
          const guildUnread = getGuildUnreadCount(guild.id);

          return (
            <Tooltip
              key={guild.id}
              content={guild.name || 'Sunucu'}
              position="right"
              onClick={() => onSelectGuild(guild.id)}
            >
              <button
                type="button"
                className={`guild-icon ${isSelected ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectGuild(guild.id);
                }}
                style={{
                  position: 'relative',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  outline: 'none',
                  overflow: 'visible',
                }}
              >
                <div className="guild-indicator" style={{ pointerEvents: 'none' }} />
                <span style={{ pointerEvents: 'none' }}>{guild.initials}</span>
                {guildUnread > 0 && (
                  <span className="unread-badge">
                    {guildUnread > 99 ? '99+' : guildUnread}
                  </span>
                )}
              </button>
            </Tooltip>
          );
        })}

        {/* Create guild button */}
        <Tooltip
          content="Yeni Sunucu Oluştur"
          position="right"
          onClick={() => setShowCreateModal(true)}
        >
          <button
            type="button"
            className="guild-icon"
            onClick={(e) => {
              e.stopPropagation();
              setShowCreateModal(true);
            }}
            style={{
              color: 'var(--success)',
              fontSize: 24,
              fontWeight: 300,
              padding: 0,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            +
          </button>
        </Tooltip>

        {/* Join guild button */}
        <Tooltip
          content="Sunucuya Katıl"
          position="right"
          onClick={() => setShowJoinModal(true)}
        >
          <button
            type="button"
            className="guild-icon"
            onClick={(e) => {
              e.stopPropagation();
              setShowJoinModal(true);
            }}
            style={{
              color: 'var(--accent)',
              fontSize: 18,
              fontWeight: 700,
              padding: 0,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            ↗
          </button>
        </Tooltip>

        <div style={{ flex: 1 }} />

        {/* User profile & Logout button at bottom of sidebar */}
        <div
          style={{
            width: 32,
            height: 1,
            background: 'var(--border)',
            margin: '4px 0',
          }}
        />
        <Tooltip
          content={`${user?.username || 'Hesap'} — Çıkış Yap`}
          position="right"
          onClick={handleLogout}
        >
          <button
            type="button"
            className="guild-icon"
            onClick={(e) => {
              e.stopPropagation();
              handleLogout();
            }}
            style={{
              color: 'var(--danger)',
              fontSize: 16,
              padding: 0,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            🚪
          </button>
        </Tooltip>
      </aside>

      {showCreateModal && (
        <CreateGuildModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(guild) => {
            onGuildCreated(guild);
            setShowCreateModal(false);
            toast.success(`"${guild.name}" sunucusu oluşturuldu!`);
          }}
        />
      )}

      {showJoinModal && (
        <JoinGuildModal
          onClose={() => setShowJoinModal(false)}
          onJoined={(guild) => {
            onGuildJoined(guild);
            setShowJoinModal(false);
            toast.success(`"${guild.name}" sunucusuna katıldınız!`);
          }}
        />
      )}
    </>
  );
}
