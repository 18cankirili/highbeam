// FILE: frontend/src/components/ToastContainer.tsx
import { useToast, type ToastType } from '../context/ToastContext';

function getToastIcon(type: ToastType): string {
  switch (type) {
    case 'success':
      return '✓';
    case 'error':
      return '✕';
    case 'warning':
      return '⚠';
    default:
      return 'ℹ';
  }
}

function getToastColors(type: ToastType): { border: string; glow: string; text: string; bg: string } {
  switch (type) {
    case 'success':
      return {
        border: 'rgba(0, 230, 118, 0.6)',
        glow: '0 0 16px rgba(0, 230, 118, 0.35)',
        text: '#00E676',
        bg: 'rgba(18, 28, 22, 0.94)',
      };
    case 'error':
      return {
        border: 'rgba(255, 82, 82, 0.65)',
        glow: '0 0 16px rgba(255, 82, 82, 0.35)',
        text: '#FF5252',
        bg: 'rgba(32, 18, 18, 0.94)',
      };
    case 'warning':
      return {
        border: 'rgba(255, 179, 0, 0.6)',
        glow: '0 0 16px rgba(255, 179, 0, 0.35)',
        text: '#FFB300',
        bg: 'rgba(32, 26, 16, 0.94)',
      };
    default:
      return {
        border: 'rgba(255, 152, 0, 0.6)',
        glow: '0 0 16px rgba(255, 152, 0, 0.35)',
        text: '#FF9800',
        bg: 'rgba(26, 20, 14, 0.94)',
      };
  }
}

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 380,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((item) => {
        const theme = getToastColors(item.type);
        const icon = getToastIcon(item.type);

        return (
          <div
            key={item.id}
            style={{
              pointerEvents: 'auto',
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              boxShadow: `${theme.glow}, 0 8px 32px rgba(0, 0, 0, 0.6)`,
              backdropFilter: 'blur(12px)',
              borderRadius: 8,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              animation: 'toast-slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              minWidth: 260,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: `${theme.text}22`,
                  color: theme.text,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {icon}
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#FFFFFF',
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                }}
              >
                {item.message}
              </span>
            </div>

            <button
              onClick={() => removeToast(item.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                fontSize: 13,
                lineHeight: 1,
                borderRadius: 4,
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#FFFFFF';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
              }}
              title="Close"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
