// FILE: frontend/src/components/MessageInput.tsx
import { useState, useCallback, useRef, type KeyboardEvent, type FormEvent, type ChangeEvent } from 'react';

interface MessageInputProps {
  channelName: string;
  onSend: (content: string) => Promise<void>;
  onTyping?: () => void;
}

export function MessageInput({ channelName, onSend, onTyping }: MessageInputProps) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const lastTypingTimeRef = useRef<number>(0);

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setContent('');
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }, [content, onSend, sending]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);

    // Throttle typing events: send at most once every 2.5 seconds
    const now = Date.now();
    if (onTyping && now - lastTypingTimeRef.current > 2500) {
      lastTypingTimeRef.current = now;
      onTyping();
    }
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      handleSend();
    },
    [handleSend]
  );

  const formattedPlaceholder = channelName.startsWith('@')
    ? `${channelName} kullanıcısına mesaj gönder...`
    : `#${channelName} kanalına mesaj gönder...`;

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: '0 16px 16px',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 10,
          background: 'var(--bg-surface)',
          borderRadius: 10,
          padding: '6px 8px 6px 14px',
          border: '1px solid var(--border)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        <textarea
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={formattedPlaceholder}
          rows={1}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            resize: 'none',
            padding: '8px 0',
            maxHeight: 120,
            minHeight: 22,
            fontSize: 14,
            lineHeight: 1.45,
            outline: 'none',
            boxShadow: 'none',
            color: 'var(--text-primary)',
          }}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!content.trim() || sending}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            alignSelf: 'flex-end',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: content.trim() ? 'var(--neon-glow)' : 'none',
          }}
        >
          {sending ? '...' : 'Gönder'}
        </button>
      </div>
    </form>
  );
}
