// FILE: frontend/src/components/ChatArea.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Channel, Message } from '../types';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import { useToast } from '../context/ToastContext';
import { MessageItem } from './MessageItem';
import { MessageInput } from './MessageInput';
import { MessageSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';

interface ChatAreaProps {
  channel: Channel | null;
}

export function ChatArea({ channel }: ChatAreaProps) {
  const { user } = useAuth();
  const {
    subscribeChannel,
    unsubscribeChannel,
    subscribe,
    unsubscribe,
    setActiveChannel,
    sendTyping,
  } = useWebSocket();
  const toast = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, number>>(new Map());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevChannelRef = useRef<string | null>(null);

  // Smooth scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // Cleanup expired typing users every 500ms
  useEffect(() => {
    if (typingUsers.size === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => {
        let hasExpired = false;
        const next = new Map<string, number>();
        for (const [username, expiresAt] of prev.entries()) {
          if (expiresAt > now) {
            next.set(username, expiresAt);
          } else {
            hasExpired = true;
          }
        }
        return hasExpired ? next : prev;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [typingUsers]);

  // Load messages when channel changes
  useEffect(() => {
    if (!channel) {
      setActiveChannel(null);
      setMessages([]);
      setNextCursor(null);
      setTypingUsers(new Map());
      return;
    }

    // Set as active channel in context (automatically clears unread badge)
    setActiveChannel(channel.id);
    setTypingUsers(new Map());

    // Unsubscribe from previous channel
    if (prevChannelRef.current && prevChannelRef.current !== channel.id) {
      unsubscribeChannel(prevChannelRef.current);
    }
    prevChannelRef.current = channel.id;

    // Subscribe to new channel
    subscribeChannel(channel.id);

    // Fetch messages
    setInitialLoading(true);
    api.messages
      .list(channel.id, undefined, 50)
      .then((data) => {
        setMessages(data.messages.reverse());
        setNextCursor(data.nextCursor);
        setTimeout(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView();
          }
        }, 50);
      })
      .catch((err) => {
        console.error('Failed to load messages:', err);
        toast.error('Mesajlar yüklenirken bir hata oluştu');
      })
      .finally(() => setInitialLoading(false));

    return () => {
      setActiveChannel(null);
    };
  }, [channel?.id, subscribeChannel, unsubscribeChannel, setActiveChannel, toast]);

  // Real-time WebSocket event listeners
  useEffect(() => {
    if (!channel) return;

    const handleNewMessage = (data: Record<string, unknown>) => {
      // Extract message payload from normalized event
      const incoming = (data.message || data.data || data) as Message;
      if (!incoming || !incoming.id) return;

      // Channel ID verification
      if (String(incoming.channelId) !== String(channel.id)) return;

      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;
        return [...prev, incoming];
      });
      setTimeout(scrollToBottom, 50);
    };

    const handleMessageUpdated = (data: Record<string, unknown>) => {
      const incoming = (data.message || data.data || data) as {
        id: string;
        channelId: string;
        content: string;
        updatedAt: string;
      };
      if (!incoming || !incoming.id) return;
      if (incoming.channelId && String(incoming.channelId) !== String(channel.id)) return;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === incoming.id
            ? { ...m, content: incoming.content, updatedAt: incoming.updatedAt }
            : m
        )
      );
    };

    const handleMessageDeleted = (data: Record<string, unknown>) => {
      const d = (data.data || data) as Record<string, unknown>;
      const messageId = (d.messageId || d.id || data.messageId) as string;
      const channelId = (d.channelId || data.channelId) as string;

      if (channelId && String(channelId) !== String(channel.id)) return;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: '[silindi]', isDeleted: true }
            : m
        )
      );
    };

    const handleTypingIndicator = (eventData: Record<string, unknown>) => {
      if (!eventData) return;
      const nested = (eventData.data || eventData.payload || {}) as Record<string, unknown>;

      const incomingChannelId = String(
        eventData.channelId || nested.channelId || ''
      ).trim();

      const incomingUserId = String(
        eventData.userId || nested.userId || ''
      ).trim();

      const incomingUsername = String(
        eventData.username || nested.username || ''
      ).trim();

      // Must be for this current channel
      if (!incomingChannelId || incomingChannelId !== String(channel.id)) return;

      // Do not show indicator for current user
      if (incomingUserId && user?.id && incomingUserId === String(user.id)) return;

      if (!incomingUsername) return;

      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.set(incomingUsername, Date.now() + 3000);
        return next;
      });
    };

    subscribe('new_message', handleNewMessage);
    subscribe('message_updated', handleMessageUpdated);
    subscribe('message_deleted', handleMessageDeleted);
    subscribe('typing_indicator', handleTypingIndicator);

    return () => {
      unsubscribe('new_message', handleNewMessage);
      unsubscribe('message_updated', handleMessageUpdated);
      unsubscribe('message_deleted', handleMessageDeleted);
      unsubscribe('typing_indicator', handleTypingIndicator);
    };
  }, [channel?.id, user?.id, subscribe, unsubscribe, scrollToBottom]);

  // Load older messages with pagination
  const loadMore = useCallback(async () => {
    if (!channel || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const container = messagesContainerRef.current;
      const prevScrollHeight = container ? container.scrollHeight : 0;
      const prevScrollTop = container ? container.scrollTop : 0;

      const data = await api.messages.list(channel.id, nextCursor, 50);
      setMessages((prev) => [...data.messages.reverse(), ...prev]);
      setNextCursor(data.nextCursor);

      // Maintain scroll position after prepending older messages
      setTimeout(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
        }
      }, 30);
    } catch (err) {
      console.error('Failed to load older messages:', err);
      toast.error('Daha eski mesajlar yüklenemedi');
    } finally {
      setLoadingMore(false);
    }
  }, [channel, nextCursor, loadingMore, toast]);

  // Send message: immediately append on API response + WS handles other clients
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!channel) return;
      try {
        const sentMsg = await api.messages.create(channel.id, content);
        if (sentMsg && sentMsg.id) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === sentMsg.id)) return prev;
            return [...prev, sentMsg];
          });
          setTimeout(scrollToBottom, 50);
        }
      } catch (err) {
        console.error('Failed to send message:', err);
        toast.error('Mesaj gönderilemedi. Lütfen tekrar deneyin.');
      }
    },
    [channel, toast, scrollToBottom]
  );

  // Edit message
  const handleEditMessage = useCallback(
    async (messageId: string, content: string) => {
      try {
        const updated = await api.messages.update(messageId, content);
        if (updated) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, content: updated.content, updatedAt: updated.updatedAt }
                : m
            )
          );
        }
      } catch (err) {
        console.error(err);
        toast.error('Mesaj düzenlenemedi.');
      }
    },
    [toast]
  );

  // Delete message
  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      try {
        await api.messages.delete(messageId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, content: '[silindi]', isDeleted: true }
              : m
          )
        );
        toast.success('Mesaj silindi');
      } catch (err) {
        console.error(err);
        toast.error('Mesaj silinemedi.');
      }
    },
    [toast]
  );

  if (!channel) {
    return (
      <div className="chat-area">
        <EmptyState
          type="no-channel"
          title="Bir Kanal Seçin"
          description="Mesajları görüntülemek için bir sohbet kanalı seçin."
        />
      </div>
    );
  }

  return (
    <div className="chat-area">
      {/* Channel Header */}
      <div
        style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontWeight: 600,
          flexShrink: 0,
          background: 'var(--bg-surface)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        }}
      >
        <span style={{ color: 'var(--accent)', fontSize: 20, fontWeight: 700 }}>
          {channel.name.startsWith('@') ? '@' : '#'}
        </span>
        <span style={{ fontSize: 15, letterSpacing: '0.2px' }}>
          {channel.name.startsWith('@') ? channel.name.slice(1) : channel.name}
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={messagesContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Load more messages button */}
        {nextCursor && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '4px 12px' }}
            >
              {loadingMore ? 'Yükleniyor...' : 'Daha Eski Mesajları Yükle'}
            </button>
          </div>
        )}

        {/* Initial loading shimmer skeletons */}
        {initialLoading ? (
          <MessageSkeleton count={5} />
        ) : messages.length === 0 ? (
          <div className="empty-chat-container">
            <span className="empty-chat-icon">
              {channel.name.startsWith('@') ? '👋' : '💬'}
            </span>
            <div className="empty-chat-title">
              {channel.name.startsWith('@')
                ? `${channel.name} ile Sohbet Başladı`
                : `#${channel.name} Kanalına Hoş Geldiniz!`}
            </div>
            <div className="empty-chat-description">
              Bu sohbetin başlangıcı. İlk mesajı yazarak iletişimi başlatın!
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              isOwn={msg.authorId === user?.id}
              onEdit={handleEditMessage}
              onDelete={handleDeleteMessage}
            />
          ))
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Real-time Typing Indicator */}
      {typingUsers.size > 0 ? (
        <div className="typing-indicator">
          <div className="typing-dots">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
          <span>
            {Array.from(typingUsers.keys()).join(', ')} yazıyor...
          </span>
        </div>
      ) : (
        <div style={{ height: 24, flexShrink: 0 }} />
      )}

      {/* Message Input */}
      <MessageInput
        channelName={channel.name}
        onSend={handleSendMessage}
        onTyping={() => sendTyping(channel.id)}
      />
    </div>
  );
}
