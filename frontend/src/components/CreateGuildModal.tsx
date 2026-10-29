// FILE: frontend/src/components/CreateGuildModal.tsx
import { useState, type FormEvent } from 'react';
import type { Guild } from '../types';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';

interface CreateGuildModalProps {
  onClose: () => void;
  onCreated: (guild: Guild) => void;
}

export function CreateGuildModal({ onClose, onCreated }: CreateGuildModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setError('');
    setSubmitting(true);
    try {
      const guild = await api.guilds.create({ name: trimmed });
      onCreated(guild);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sunucu oluşturulamadı';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Yeni Sunucu Oluştur</h2>

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
            <label htmlFor="guild-name">Sunucu Adı</label>
            <input
              id="guild-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örnek: Cyberpunk Topluluğu"
              required
              autoFocus
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              İptal
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !name.trim()}>
              {submitting ? 'Oluşturuluyor…' : 'Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
