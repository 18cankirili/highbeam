// FILE: frontend/src/components/DMList.tsx
import { useState, useMemo } from 'react';
import type { DMChannelEnriched } from '../types';
import { api } from '../api/client';
import { StartDMModal } from './StartDMModal';
import { Tooltip } from './Tooltip';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import { useToast } from '../context/ToastContext';

interface DMListProps {
  dmChannels: DMChannelEnriched[];
  selectedDMId: string | null;
  onSelectDM: (dmChannel: DMChannelEnriched) => void;
  onDMStarted: (dmChannel: DMChannelEnriched) => void;
}

export function DMList({
  dmChannels,
  selectedDMId,
  onSelectDM,
  onDMStarted,
}: DMListProps) {
  const { user } = useAuth();
  const { presenceMap, unreadCounts } = useWebSocket();
  const toast = useToast();

  const [showStartModal, setShowStartModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingOnline, setSearchingOnline] = useState(false);

  const trimmedQuery = searchQuery.trim().toLowerCase();

  const filteredDMs = useMemo(() => {
    if (!trimmedQuery) return dmChannels;
    return dmChannels.filter((dm) =>
      dm.recipientUsername.toLowerCase().includes(trimmedQuery)
    );
  }, [dmChannels, trimmedQuery]);

  const handleStartSearchDM = async () => {
    const target = searchQuery.trim();
    if (!target || searchingOnline) return;
    setSearchingOnline(true);
    try {
      const dm = await api.dms.create({ targetUsername: target });
      onDMStarted(dm);
      setSearchQuery('');
      toast.success(`@${dm.recipientUsername} ile sohbet açıldı!`);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Kullanıcı bulunamadı veya sohbet başlatılamadı';
      toast.error(msg);
    } finally {
      setSearchingOnline(false);
    }
  };

  return (
    <>
      <div className="channel-panel">
        {/* DM Panel Header */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--accent)', fontSize: 18 }}>💬</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Direkt Mesajlar
            </span>
          </div>

          <Tooltip content="Yeni Mesaj Başlat" position="left">
            <button
              type="button"
              onClick={() => setShowStartModal(true)}
              style={{
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                border: '1px solid rgba(255, 152, 0, 0.4)',
                borderRadius: 6,
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent)';
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.boxShadow = 'var(--neon-glow)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--accent-muted)';
                e.currentTarget.style.color = 'var(--accent)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span>+</span>
              <span>Yeni DM</span>
            </button>
          </Tooltip>
        </div>

        {/* DM Search Bar */}
        <div className="dm-search-container">
          <div className="dm-search-input-wrapper">
            <span className="dm-search-icon">🔍</span>
            <input
              type="text"
              className="dm-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (filteredDMs.length === 1) {
                    onSelectDM(filteredDMs[0]);
                  } else if (filteredDMs.length === 0 && searchQuery.trim()) {
                    handleStartSearchDM();
                  }
                }
              }}
              placeholder="Kullanıcı ara..."
            />
            {searchQuery && (
              <button
                type="button"
                className="dm-search-clear"
                onClick={() => setSearchQuery('')}
                title="Aramayı Temizle"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Section title */}
        <div
          style={{
            padding: '12px 16px 6px 16px',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            color: 'var(--text-muted)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>
            {searchQuery.trim()
              ? `Arama Sonuçları (${filteredDMs.length})`
              : `Sohbetler (${dmChannels.length})`}
          </span>
        </div>

        {/* Conversations list */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {filteredDMs.length === 0 ? (
            searchQuery.trim() ? (
              /* No search results found - quick action to search/create new DM */
              <div
                style={{
                  padding: '24px 14px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: 'rgba(255, 152, 0, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    color: 'var(--accent)',
                  }}
                >
                  🔍
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.4,
                  }}
                >
                  Mevcut sohbetlerde "<strong>{searchQuery.trim()}</strong>" bulunamadı.
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={searchingOnline}
                  onClick={handleStartSearchDM}
                  style={{
                    fontSize: 12,
                    padding: '7px 14px',
                    boxShadow: 'var(--neon-glow)',
                    marginTop: 4,
                  }}
                >
                  {searchingOnline
                    ? 'Açılıyor...'
                    : `Kullanıcıda ara: @${searchQuery.trim()}`}
                </button>
              </div>
            ) : (
              /* No DMs started yet */
              <div
                style={{
                  padding: '30px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: 'rgba(255, 152, 0, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    color: 'var(--accent)',
                  }}
                >
                  ✉️
                </div>
                <p style={{ fontSize: 13, margin: 0, color: 'var(--text-secondary)' }}>
                  Henüz özel mesajınız yok.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowStartModal(true)}
                  style={{ fontSize: 12, padding: '6px 12px', marginTop: 4 }}
                >
                  + Sohbet Başlat
                </button>
              </div>
            )
          ) : (
            filteredDMs.map((dm) => {
              const isActive = selectedDMId === dm.id;
              const isOnline = presenceMap.has(dm.recipientId)
                ? Boolean(presenceMap.get(dm.recipientId))
                : dm.isOnline;
              const unread = unreadCounts[dm.id] || 0;
              const initial = (dm.recipientUsername?.[0] ?? '?').toUpperCase();

              return (
                <div
                  key={dm.id}
                  onClick={() => onSelectDM(dm)}
                  className={`dm-item ${isActive ? 'active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 10px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'visible',
                    background: isActive ? 'var(--bg-active)' : 'transparent',
                    borderLeft: `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                    boxShadow: isActive
                      ? 'inset 4px 0 12px rgba(255, 152, 0, 0.2), 0 0 10px rgba(255, 152, 0, 0.1)'
                      : 'none',
                    transition: 'all 0.18s ease-in-out',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--bg-hover)';
                      e.currentTarget.style.transform = 'translateX(2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }
                  }}
                >
                  {/* Recipient Avatar with Online Badge */}
                  <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: isActive
                          ? 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)'
                          : 'var(--bg-surface-elevated)',
                        color: isActive ? '#fff' : 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 14,
                        border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                        boxShadow: isActive ? 'var(--neon-glow)' : 'none',
                      }}
                    >
                      {initial}
                    </div>

                    {/* Online / Offline indicator */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: -1,
                        right: -1,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: isOnline ? 'var(--success)' : '#727284',
                        border: '2px solid var(--bg-surface)',
                        boxShadow: isOnline ? 'var(--success-glow)' : 'none',
                      }}
                    />
                  </div>

                  {/* Recipient Name and Status */}
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      @{dm.recipientUsername}
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        color: isOnline ? 'var(--success)' : 'var(--text-muted)',
                      }}
                    >
                      {isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
                    </span>
                  </div>

                  {/* Unread Message Badge */}
                  {unread > 0 && !isActive && (
                    <span className="unread-badge-inline">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Current User Profile Bar */}
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
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
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
              <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>
                Highbeam Kullanıcısı
              </span>
            </div>
          </div>
        </div>
      </div>

      {showStartModal && (
        <StartDMModal
          onClose={() => setShowStartModal(false)}
          onCreated={(dm) => {
            onDMStarted(dm);
            setShowStartModal(false);
          }}
        />
      )}
    </>
  );
}
