// FILE: frontend/src/components/MessageItem.tsx
import { useState, useCallback } from 'react';
import type { Message } from '../types';
import { Tooltip } from './Tooltip';

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  onEdit: (messageId: string, content: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isToday) {
    return `Bugün ${time}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Dün ${time}`;
  }

  return `${date.toLocaleDateString()} ${time}`;
}

export function MessageItem({ message, isOwn, onEdit, onDelete }: MessageItemProps) {
  const [hovering, setHovering] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const handleSaveEdit = useCallback(async () => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === message.content) {
      setEditing(false);
      setEditContent(message.content);
      return;
    }
    await onEdit(message.id, trimmed);
    setEditing(false);
  }, [editContent, message.id, message.content, onEdit]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setEditContent(message.content);
  }, [message.content]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSaveEdit();
      }
      if (e.key === 'Escape') {
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit]
  );

  const isDeleted = message.isDeleted;

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        padding: '8px 18px',
        background: hovering ? 'var(--bg-hover)' : 'transparent',
        position: 'relative',
        transition: 'background-color 0.18s ease-in-out',
        borderRadius: 4,
        margin: '1px 8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        {/* Author */}
        <span
          style={{
            fontWeight: 700,
            fontSize: 14,
            color: isOwn ? 'var(--accent)' : 'var(--text-primary)',
            textShadow: isOwn ? '0 0 8px rgba(255, 152, 0, 0.3)' : undefined,
          }}
        >
          {message.authorName ?? 'Bilinmeyen'}
        </span>
        {/* Timestamp */}
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {formatTimestamp(message.createdAt)}
        </span>
        {message.updatedAt && !isDeleted && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(düzenlendi)</span>
        )}
      </div>

      {/* Content */}
      {editing ? (
        <div style={{ marginTop: 6 }}>
          <input
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: 14,
              border: '1px solid var(--accent)',
              boxShadow: 'var(--neon-glow)',
            }}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Kaydetmek için Enter • İptal etmek için Esc
          </div>
        </div>
      ) : (
        <div
          style={{
            marginTop: 3,
            fontSize: 14,
            lineHeight: 1.55,
            color: isDeleted ? 'var(--text-muted)' : 'var(--text-primary)',
            fontStyle: isDeleted ? 'italic' : 'normal',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message.content}
        </div>
      )}

      {/* Floating Action Buttons */}
      {hovering && isOwn && !isDeleted && !editing && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            right: 18,
            display: 'flex',
            gap: 4,
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 3,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            zIndex: 10,
          }}
        >
          <Tooltip content="Düzenle" position="top">
            <button
              className="btn-icon"
              onClick={() => {
                setEditing(true);
                setEditContent(message.content);
              }}
              style={{ fontSize: 13, padding: '4px 8px' }}
            >
              ✎
            </button>
          </Tooltip>
          <Tooltip content="Sil" position="top">
            <button
              className="btn-icon"
              onClick={() => onDelete(message.id)}
              style={{
                fontSize: 13,
                padding: '4px 8px',
                color: 'var(--danger)',
              }}
            >
              ✕
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
