import React from 'react';

export const MessageSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="skeleton-container" aria-label="Yükleniyor">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="skeleton-message-row">
          <div className="skeleton-avatar skeleton-shimmer" />
          <div className="skeleton-content">
            <div className="skeleton-header">
              <div className="skeleton-line skeleton-line-name skeleton-shimmer" />
              <div className="skeleton-line skeleton-line-time skeleton-shimmer" />
            </div>
            <div
              className="skeleton-line skeleton-line-text skeleton-shimmer"
              style={{ width: `${60 + (idx % 3) * 15}%` }}
            />
            {idx % 2 === 0 && (
              <div
                className="skeleton-line skeleton-line-text skeleton-shimmer"
                style={{ width: `${40 + (idx % 2) * 20}%` }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export const ChannelSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="skeleton-channel-list">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="skeleton-channel-row">
          <div className="skeleton-line skeleton-line-icon skeleton-shimmer" />
          <div
            className="skeleton-line skeleton-line-channel-name skeleton-shimmer"
            style={{ width: `${50 + (idx % 3) * 15}%` }}
          />
        </div>
      ))}
    </div>
  );
};

export const MemberSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => {
  return (
    <div className="skeleton-member-list">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="skeleton-member-row">
          <div className="skeleton-avatar-small skeleton-shimmer" />
          <div
            className="skeleton-line skeleton-line-member-name skeleton-shimmer"
            style={{ width: `${45 + (idx % 3) * 15}%` }}
          />
        </div>
      ))}
    </div>
  );
};
