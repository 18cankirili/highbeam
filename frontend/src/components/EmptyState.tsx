// FILE: frontend/src/components/EmptyState.tsx
import React from 'react';

interface EmptyStateProps {
  type: 'no-guild' | 'no-channel' | 'empty-chat';
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  channelName?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  type,
  title,
  description,
  actionText,
  onAction,
  channelName,
}) => {
  if (type === 'no-guild') {
    return (
      <div className="empty-state-container">
        <div className="empty-state-logo-wrapper">
          <img
            src="/logo.svg"
            alt="Highbeam Logo"
            className="empty-state-logo"
          />
          <div className="empty-state-halo" />
        </div>
        <h2 className="empty-state-title">
          {title || 'Mesajlaşmaya başlamak için bir sunucu seçin'}
        </h2>
        <p className="empty-state-description">
          {description ||
            'Sohbet etmek ve sesli odalara katılmak için sol menüden bir sunucu seçin veya yeni bir sunucu oluşturun.'}
        </p>
        {actionText && onAction && (
          <button className="btn-primary" onClick={onAction} style={{ marginTop: 8 }}>
            {actionText}
          </button>
        )}
      </div>
    );
  }

  if (type === 'no-channel') {
    return (
      <div className="empty-state-container">
        <div className="empty-state-icon">💬</div>
        <h3 className="empty-state-title">
          {title || 'Bir Metin veya Ses Kanalı Seçin'}
        </h3>
        <p className="empty-state-description">
          {description ||
            'Sohbete katılmak veya sesli konuşmaya başlamak için sol menüdeki kanallardan birine tıklayın.'}
        </p>
      </div>
    );
  }

  if (type === 'empty-chat') {
    return (
      <div className="empty-chat-container">
        <div className="empty-chat-icon">✨</div>
        <h3 className="empty-chat-title">
          #{channelName || 'kanal'} kanalına hoş geldiniz!
        </h3>
        <p className="empty-chat-description">
          Burası #{channelName || 'kanal'} kanalının başlangıcı. İlk mesajı siz gönderin!
        </p>
      </div>
    );
  }

  return null;
};
