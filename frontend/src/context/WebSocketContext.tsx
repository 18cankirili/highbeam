// FILE: frontend/src/context/WebSocketContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { useAuth } from './AuthContext';
import { playNotificationSound } from '../utils/audio';

type EventHandler = (data: Record<string, unknown>) => void;

interface WebSocketContextValue {
  connected: boolean;
  sendMessage: (type: string, payload?: Record<string, unknown>) => void;
  subscribe: (eventType: string, handler: EventHandler) => void;
  unsubscribe: (eventType: string, handler: EventHandler) => void;
  subscribeChannel: (channelId: string) => void;
  unsubscribeChannel: (channelId: string) => void;
  presenceMap: Map<string, boolean>;
  unreadCounts: Record<string, number>;
  activeChannelId: string | null;
  setActiveChannel: (channelId: string | null) => void;
  clearUnread: (channelId: string) => void;
  registerChannelGuild: (channelId: string, guildId: string) => void;
  getGuildUnreadCount: (guildId: string, guildChannelIds?: string[]) => number;
  getDMUnreadCount: (dmChannelIds: string[]) => number;
  sendTyping: (channelId: string) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

const WS_URL = `ws://${window.location.hostname}:3001/ws`;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 8000;

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<EventHandler>>>(new Map());
  const [connected, setConnected] = useState(false);
  const [presenceMap, setPresenceMap] = useState<Map<string, boolean>>(new Map());

  // Unread badge and notification states
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [channelToGuildMap, setChannelToGuildMap] = useState<Record<string, string>>({});
  const [activeChannelId, setActiveChannelIdState] = useState<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | undefined>(user?.id);

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const shouldReconnectRef = useRef(true);
  const activeChannelsRef = useRef<Set<string>>(new Set());

  // Keep refs synchronized with active states
  useEffect(() => {
    currentUserIdRef.current = user?.id;
  }, [user?.id]);

  const emit = useCallback((eventType: string, data: Record<string, unknown>) => {
    const handlers = listenersRef.current.get(eventType);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (err) {
          console.error(`Error in WebSocket handler for event "${eventType}":`, err);
        }
      });
    }
  }, []);

  const clearUnread = useCallback((channelId: string) => {
    setUnreadCounts((prev) => {
      if (!prev[channelId]) return prev;
      const next = { ...prev };
      delete next[channelId];
      return next;
    });
  }, []);

  const setActiveChannel = useCallback(
    (channelId: string | null) => {
      activeChannelIdRef.current = channelId;
      setActiveChannelIdState(channelId);
      if (channelId) {
        clearUnread(channelId);
      }
    },
    [clearUnread]
  );

  const registerChannelGuild = useCallback((channelId: string, guildId: string) => {
    setChannelToGuildMap((prev) => {
      if (prev[channelId] === guildId) return prev;
      return { ...prev, [channelId]: guildId };
    });
  }, []);

  const getGuildUnreadCount = useCallback(
    (guildId: string, guildChannelIds?: string[]) => {
      let total = 0;
      for (const [chId, count] of Object.entries(unreadCounts)) {
        if (
          channelToGuildMap[chId] === guildId ||
          (guildChannelIds && guildChannelIds.includes(chId))
        ) {
          total += count;
        }
      }
      return total;
    },
    [unreadCounts, channelToGuildMap]
  );

  const getDMUnreadCount = useCallback(
    (dmChannelIds?: string[]) => {
      let total = 0;
      for (const [chId, count] of Object.entries(unreadCounts)) {
        // If explicitly in dmChannelIds OR not associated with any known guild
        if ((dmChannelIds && dmChannelIds.includes(chId)) || !channelToGuildMap[chId]) {
          total += count;
        }
      }
      return total;
    },
    [unreadCounts, channelToGuildMap]
  );

  const connect = useCallback(() => {
    if (!token) return;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (wsRef.current) {
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        return;
      }
      try {
        wsRef.current.close();
      } catch {
        // Ignore close errors
      }
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        // Authenticate immediately upon connection
        ws.send(JSON.stringify({ type: 'authenticate', token }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as Record<string, unknown>;
          const type = msg.type as string;

          if (type === 'authenticated') {
            setConnected(true);
            reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;

            // Re-subscribe to all active channels upon successful reconnection
            if (activeChannelsRef.current.size > 0 && ws.readyState === WebSocket.OPEN) {
              activeChannelsRef.current.forEach((channelId) => {
                ws.send(
                  JSON.stringify({
                    type: 'subscribe_channel',
                    channelId,
                  })
                );
              });
            }
          }

          // Presence updates (supports both 'presence' and 'presence_update')
          if (type === 'presence' || type === 'presence_update') {
            const presData = (msg.data || msg) as { userId: string; isOnline: boolean } | undefined;
            if (presData && typeof presData.userId === 'string') {
              setPresenceMap((prev) => {
                const next = new Map(prev);
                next.set(presData.userId, presData.isOnline);
                return next;
              });
            }
            emit('presence_update', msg);
          }

          // Real-time messages: normalize payloads so subscribers receive both { message } and raw payload
          if (type === 'new_message') {
            const root = msg as Record<string, unknown>;
            const rawMsg = (root.message || root.data || root.payload || root) as Record<string, unknown>;

            const incomingChannelId = String(
              rawMsg.channelId ||
              rawMsg.channel_id ||
              root.channelId ||
              root.channel_id ||
              ''
            ).trim();

            const incomingGuildId = (
              rawMsg.guildId ||
              rawMsg.guild_id ||
              root.guildId ||
              root.guild_id ||
              null
            ) as string | null;

            const authorId = String(
              rawMsg.authorId ||
              rawMsg.author_id ||
              root.authorId ||
              root.author_id ||
              ''
            ).trim();

            const normalizedMsg = {
              ...rawMsg,
              channelId: incomingChannelId,
              guildId: incomingGuildId,
            };

            // Unread count and notification sound handling
            if (incomingChannelId && incomingChannelId !== activeChannelIdRef.current) {
              const currentUserId = String(currentUserIdRef.current || '').trim();
              if (!authorId || (currentUserId && authorId !== currentUserId)) {
                setUnreadCounts((prev) => ({
                  ...prev,
                  [incomingChannelId]: (prev[incomingChannelId] || 0) + 1,
                }));

                if (incomingGuildId) {
                  setChannelToGuildMap((prev) => ({
                    ...prev,
                    [incomingChannelId]: incomingGuildId,
                  }));
                }

                playNotificationSound();
              }
            }

            emit(type, { ...msg, message: normalizedMsg });
          } else if (type === 'typing_indicator') {
            const root = msg as Record<string, unknown>;
            const raw = (root.data || root.payload || root) as Record<string, unknown>;
            const chId = String(raw.channelId || raw.channel_id || root.channelId || root.channel_id || '').trim();
            const uId = String(raw.userId || raw.user_id || root.userId || root.user_id || '').trim();
            const uName = String(raw.username || raw.userName || root.username || root.userName || '').trim();

            const normalized = {
              ...msg,
              channelId: chId,
              userId: uId,
              username: uName,
              data: {
                channelId: chId,
                userId: uId,
                username: uName,
              },
            };
            emit(type, normalized);
          } else if (type === 'message_updated') {
            const messageObj = msg.message || msg.data || msg;
            emit(type, { ...msg, message: messageObj });
          } else if (type === 'message_deleted') {
            const d = (msg.data || msg) as Record<string, unknown>;
            const messageId = d.id || d.messageId || msg.messageId;
            const channelId = d.channelId || msg.channelId;
            emit(type, { ...msg, messageId, channelId });
          } else {
            emit(type, msg);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        // Handled in onclose
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;

        if (shouldReconnectRef.current && token) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectDelayRef.current = Math.min(
              reconnectDelayRef.current * 1.5,
              MAX_RECONNECT_DELAY
            );
            connect();
          }, reconnectDelayRef.current);
        }
      };
    } catch {
      // Reconnect handled by timer
    }
  }, [token, emit]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    // Fast reconnect when browser detects network is back
    const handleOnline = () => {
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
      connect();
    };

    // Auto reconnect when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
          connect();
        }
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      shouldReconnectRef.current = false;
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // Ignore
        }
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendMessage = useCallback(
    (type: string, payload?: Record<string, unknown>) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type, ...payload }));
      }
    },
    []
  );

  const subscribeChannel = useCallback(
    (channelId: string) => {
      activeChannelsRef.current.add(channelId);
      sendMessage('subscribe_channel', { channelId });
    },
    [sendMessage]
  );

  const unsubscribeChannel = useCallback(
    (channelId: string) => {
      activeChannelsRef.current.delete(channelId);
      sendMessage('unsubscribe_channel', { channelId });
    },
    [sendMessage]
  );

  const sendTyping = useCallback(
    (channelId: string) => {
      sendMessage('typing_start', { channelId });
    },
    [sendMessage]
  );

  const subscribe = useCallback((eventType: string, handler: EventHandler) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType)!.add(handler);
  }, []);

  const unsubscribe = useCallback((eventType: string, handler: EventHandler) => {
    const handlers = listenersRef.current.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }, []);

  return (
    <WebSocketContext.Provider
      value={{
        connected,
        sendMessage,
        subscribe,
        unsubscribe,
        subscribeChannel,
        unsubscribeChannel,
        presenceMap,
        unreadCounts,
        activeChannelId,
        setActiveChannel,
        clearUnread,
        registerChannelGuild,
        getGuildUnreadCount,
        getDMUnreadCount,
        sendTyping,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider');
  return ctx;
}
