// FILE: frontend/src/components/JoinGuildModal.tsx
import { useState, type FormEvent } from 'react';
import type { Guild } from '../types';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';

interface JoinGuildModalProps {
  onClose: () => void;
  onJoined: (guild: Guild) => void;
}

export function JoinGuildModal({ onClose, onJoined }: JoinGuildModalProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = inviteCode.trim();
    if (!trimmed) return;

    setError('');
    setSubmitting(true);
    try {
      const guild = await api.guilds.join(trimmed);
      onJoined(guild);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sunucuya katılınamadı. Davet kodunu kontrol edin.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Sunucuya Katıl</h2>

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
          <div className="form-group">
            <label htmlFor="invite-code">Davet Kodu</label>
            <input
              id="invite-code"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Örnek: aB12cD"
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
              disabled={submitting || !inviteCode.trim()}
            >
              {submitting ? 'Katılınıyor…' : 'Katıl'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
