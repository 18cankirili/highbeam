// FILE: frontend/src/components/CreateChannelModal.tsx
import { useState, type FormEvent } from 'react';
import type { Channel, ChannelType } from '../types';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';

interface CreateChannelModalProps {
  guildId: string;
  initialType?: ChannelType;
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}

export function CreateChannelModal({
  guildId,
  initialType = 'text',
  onClose,
  onCreated,
}: CreateChannelModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>(initialType);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim().toLowerCase().replace(/\s+/g, '-');
    if (!trimmed) return;

    setError('');
    setSubmitting(true);
    try {
      const channel = await api.guilds.createChannel(guildId, { name: trimmed, type });
      onCreated(channel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kanal oluşturulamadı';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Yeni Kanal Oluştur</h2>

        {error && (
          <div
            style={{
              background: 'rgba(255, 82, 82, 0.12)',
              border: '1px solid rgba(255, 82, 82, 0.4)',
              color: '#FF8A80',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Channel Type Selector */}
          <div className="form-group" style={{ marginBottom: 18 }}>
            <label style={{ marginBottom: 8, display: 'block' }}>Kanal Türü</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Text Channel Option */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: type === 'text' ? 'var(--bg-active)' : 'var(--bg-surface)',
                  border: `1px solid ${type === 'text' ? 'var(--accent)' : 'var(--border)'}`,
                  boxShadow: type === 'text' ? 'var(--neon-glow)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <input
                  type="radio"
                  name="channelType"
                  value="text"
                  checked={type === 'text'}
                  onChange={() => setType('text')}
                  style={{ accentColor: 'var(--accent)', width: 'auto' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                    # Metin Kanalı
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Mesajlaşın, link ve düşüncelerinizi paylaşın
                  </div>
                </div>
              </label>

              {/* Voice Channel Option */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: type === 'voice' ? 'var(--bg-active)' : 'var(--bg-surface)',
                  border: `1px solid ${type === 'voice' ? 'var(--accent)' : 'var(--border)'}`,
                  boxShadow: type === 'voice' ? 'var(--neon-glow)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <input
                  type="radio"
                  name="channelType"
                  value="voice"
                  checked={type === 'voice'}
                  onChange={() => setType('voice')}
                  style={{ accentColor: 'var(--accent)', width: 'auto' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                    🔊 Ses Kanalı
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    WebRTC ile gerçek zamanlı, p2p sesli sohbet
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="channel-name">Kanal Adı</label>
            <input
              id="channel-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'voice' ? 'sohbet-odasi' : 'genel-sohbet'}
              required
              autoFocus
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              İptal
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || !name.trim()}
            >
              {submitting ? 'Oluşturuluyor…' : 'Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
