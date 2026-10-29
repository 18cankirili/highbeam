// FILE: frontend/src/components/StartDMModal.tsx
import { useState, type FormEvent } from 'react';
import type { DMChannelEnriched } from '../types';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';

interface StartDMModalProps {
  onClose: () => void;
  onCreated: (dmChannel: DMChannelEnriched) => void;
}

export function StartDMModal({ onClose, onCreated }: StartDMModalProps) {
  const [targetUsername, setTargetUsername] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = targetUsername.trim();
    if (!trimmed) {
      setError('Lütfen bir kullanıcı adı girin');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const dmChannel = await api.dms.create({ targetUsername: trimmed });
      toast.success(`@${dmChannel.recipientUsername} ile sohbet başlatıldı`);
      onCreated(dmChannel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Özel mesaj başlatılamadı';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>Yeni Özel Mesaj Başlat</h2>
          <button
            type="button"
            onClick={onClose}
            className="toast-close"
            style={{ fontSize: 20, cursor: 'pointer' }}
            aria-label="Kapat"
          >
            ×
          </button>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 18 }}>
          Sohbet etmek istediğiniz Highbeam kullanıcısının kullanıcı adını girin.
        </p>

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
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Kullanıcı Adı
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  color: 'var(--accent)',
                  fontWeight: 700,
                  fontSize: 16,
                  pointerEvents: 'none',
                }}
              >
                @
              </span>
              <input
                type="text"
                value={targetUsername}
                onChange={(e) => setTargetUsername(e.target.value)}
                placeholder="ornek_kullanici"
                autoFocus
                required
                style={{
                  width: '100%',
                  paddingLeft: 32,
                  background: 'var(--bg-primary)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              İptal
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !targetUsername.trim()}
              style={{
                boxShadow: 'var(--neon-glow)',
              }}
            >
              {submitting ? 'Açılıyor...' : 'Sohbeti Başlat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
