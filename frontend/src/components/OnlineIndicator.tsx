// FILE: frontend/src/components/OnlineIndicator.tsx
interface OnlineIndicatorProps {
  isOnline: boolean;
  size?: number;
}

export function OnlineIndicator({ isOnline, size = 10 }: OnlineIndicatorProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: isOnline ? 'var(--success)' : 'var(--text-muted)',
        border: '2px solid var(--bg-surface)',
        flexShrink: 0,
      }}
      title={isOnline ? 'Online' : 'Offline'}
    />
  );
}
