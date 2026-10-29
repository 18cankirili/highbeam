// FILE: frontend/src/components/VoiceStatusBar.tsx
import { useVoice } from '../context/VoiceContext';
import { Tooltip } from './Tooltip';

export function VoiceStatusBar() {
  const {
    currentVoiceChannelId,
    currentVoiceChannelName,
    isMuted,
    isDeafened,
    micError,
    leaveVoice,
    toggleMute,
    toggleDeafen,
    clearMicError,
  } = useVoice();

  if (!currentVoiceChannelId && !micError) {
    return null;
  }

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        background: '#141418',
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Mic error notice */}
      {micError && (
        <div
          style={{
            background: 'rgba(255, 82, 82, 0.15)',
            border: '1px solid rgba(255, 82, 82, 0.4)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
            color: '#FF8A80',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            boxShadow: 'var(--danger-glow)',
          }}
        >
          <span>{micError}</span>
          <button
            onClick={clearMicError}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#FF8A80',
              cursor: 'pointer',
              fontWeight: 'bold',
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {currentVoiceChannelId && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Status info */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minWidth: 0,
              flex: 1,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: 'var(--success)',
                boxShadow: 'var(--success-glow)',
                flexShrink: 0,
              }}
              title="WebRTC Bağlantısı Aktif"
            />
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--success)',
                  letterSpacing: '0.4px',
                }}
              >
                Sese Bağlandı
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                🔊 {currentVoiceChannelName || 'Ses Kanalı'}
              </div>
            </div>
          </div>

          {/* Action buttons with tooltips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Mute button */}
            <Tooltip
              content={isMuted ? 'Mikrofonu Aç' : 'Mikrofonu Kapat'}
              position="top"
            >
              <button
                className="btn-icon"
                onClick={toggleMute}
                style={{
                  fontSize: 15,
                  padding: '6px 8px',
                  color: isMuted ? 'var(--danger)' : 'var(--text-primary)',
                  background: isMuted
                    ? 'rgba(255, 82, 82, 0.15)'
                    : 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 6,
                }}
              >
                {isMuted ? '🔇' : '🎙️'}
              </button>
            </Tooltip>

            {/* Deafen button */}
            <Tooltip
              content={isDeafened ? 'Sağırlığı Kaldır' : 'Sağırlaştır'}
              position="top"
            >
              <button
                className="btn-icon"
                onClick={toggleDeafen}
                style={{
                  fontSize: 15,
                  padding: '6px 8px',
                  color: isDeafened ? 'var(--danger)' : 'var(--text-primary)',
                  background: isDeafened
                    ? 'rgba(255, 82, 82, 0.15)'
                    : 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 6,
                }}
              >
                {isDeafened ? '🚫' : '🎧'}
              </button>
            </Tooltip>

            {/* Disconnect button */}
            <Tooltip content="Ses Kanalından Ayrıl" position="top">
              <button
                className="btn-icon"
                onClick={leaveVoice}
                style={{
                  fontSize: 15,
                  padding: '6px 8px',
                  color: '#FFFFFF',
                  background: 'linear-gradient(135deg, #FF5252 0%, #D32F2F 100%)',
                  borderRadius: 6,
                  boxShadow: 'var(--danger-glow)',
                }}
              >
                📞✕
              </button>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
}
