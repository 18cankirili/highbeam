// FILE: frontend/src/pages/AppPage.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Guild, Channel, MemberInfo, DMChannelEnriched } from '../types';
import { api } from '../api/client';
import { useWebSocket } from '../context/WebSocketContext';
import { useVoice } from '../context/VoiceContext';
import { Sidebar } from '../components/Sidebar';
import { ChannelList } from '../components/ChannelList';
import { DMList } from '../components/DMList';
import { ChatArea } from '../components/ChatArea';
import { MemberList } from '../components/MemberList';
import { EmptyState } from '../components/EmptyState';
import { CreateGuildModal } from '../components/CreateGuildModal';
import { JoinGuildModal } from '../components/JoinGuildModal';

export function AppPage() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [dmChannels, setDmChannels] = useState<DMChannelEnriched[]>([]);
  const [selectedDMId, setSelectedDMId] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const { presenceMap, subscribe, unsubscribe, setActiveChannel } = useWebSocket();
  const { voiceStates, speakingMap } = useVoice();

  // Fetch guilds on mount
  useEffect(() => {
    api.guilds
      .list()
      .then((list) => {
        setGuilds(list);
        if (list.length > 0 && selectedGuildId === null) {
          setSelectedGuildId(list[0].id);
        } else if (list.length === 0 && selectedGuildId === null) {
          setSelectedGuildId('HOME');
        }
      })
      .catch(console.error);
  }, []);

  // Fetch DM channels on mount or when switching to HOME
  useEffect(() => {
    api.dms
      .list()
      .then((dms) => {
        setDmChannels(dms);
        if (dms.length > 0 && !selectedDMId) {
          setSelectedDMId(dms[0].id);
        }
      })
      .catch(console.error);
  }, [selectedGuildId]);

  // Real-time listener to discover new DM channels if another user starts a conversation
  useEffect(() => {
    const handleNewMessage = (data: Record<string, unknown>) => {
      const incoming = (data.message || data.data || data) as {
        channelId?: string;
        guildId?: string | null;
      };
      if (incoming && incoming.channelId && !incoming.guildId) {
        setDmChannels((prev) => {
          if (prev.some((d) => d.id === incoming.channelId)) return prev;
          api.dms.list().then(setDmChannels).catch(console.error);
          return prev;
        });
      }
    };

    subscribe('new_message', handleNewMessage);
    return () => {
      unsubscribe('new_message', handleNewMessage);
    };
  }, [subscribe, unsubscribe]);

  // Fetch channels and members when guild changes (only if it's a real guild, not 'HOME')
  useEffect(() => {
    if (!selectedGuildId || selectedGuildId === 'HOME') {
      setChannels([]);
      setMembers([]);
      setSelectedChannelId(null);
      return;
    }

    setSelectedChannelId(null);

    api.guilds
      .getChannels(selectedGuildId)
      .then((chs) => {
        setChannels(chs);
        if (chs.length > 0) {
          const defaultChannel = chs.find((c) => c.type === 'text') || chs[0];
          setSelectedChannelId(defaultChannel.id);
        }
      })
      .catch(console.error);

    api.guilds.getMembers(selectedGuildId).then(setMembers).catch(console.error);
  }, [selectedGuildId]);

  // Real-time member events from WebSocket
  useEffect(() => {
    const handleMemberJoined = (data: Record<string, unknown>) => {
      const payload = data.data as {
        guildId: string;
        member: MemberInfo;
      } | undefined;

      if (!payload || payload.guildId !== selectedGuildId) return;

      setMembers((prev) => {
        if (prev.some((m) => m.userId === payload.member.userId)) return prev;
        return [...prev, payload.member];
      });
    };

    const handleMemberUpdated = (data: Record<string, unknown>) => {
      const payload = data.data as {
        guildId: string;
        userId: string;
        roleId: string;
        roleName: string;
      } | undefined;

      if (!payload || payload.guildId !== selectedGuildId) return;

      setMembers((prev) =>
        prev.map((m) =>
          m.userId === payload.userId
            ? { ...m, roleId: payload.roleId, roleName: payload.roleName }
            : m
        )
      );
    };

    const handlePresenceUpdate = (data: Record<string, unknown>) => {
      const payload = (data.data || data) as { userId: string; isOnline: boolean } | undefined;
      if (!payload || typeof payload.userId !== 'string') return;
      setMembers((prev) =>
        prev.map((m) =>
          m.userId === payload.userId ? { ...m, isOnline: Boolean(payload.isOnline) } : m
        )
      );
    };

    subscribe('presence', handlePresenceUpdate);
    subscribe('presence_update', handlePresenceUpdate);
    subscribe('guild_member_joined', handleMemberJoined);
    subscribe('guild_member_updated', handleMemberUpdated);

    return () => {
      unsubscribe('presence', handlePresenceUpdate);
      unsubscribe('presence_update', handlePresenceUpdate);
      unsubscribe('guild_member_joined', handleMemberJoined);
      unsubscribe('guild_member_updated', handleMemberUpdated);
    };
  }, [selectedGuildId, subscribe, unsubscribe]);

  const handleGuildCreated = useCallback((guild: Guild) => {
    setGuilds((prev) => [...prev, guild]);
    setSelectedGuildId(guild.id);
  }, []);

  const handleGuildJoined = useCallback((guild: Guild) => {
    setGuilds((prev) => {
      if (prev.some((g) => g.id === guild.id)) return prev;
      return [...prev, guild];
    });
    setSelectedGuildId(guild.id);
  }, []);

  const handleChannelCreated = useCallback((channel: Channel) => {
    setChannels((prev) => [...prev, channel]);
    if (channel.type === 'text') {
      setSelectedChannelId(channel.id);
    }
  }, []);

  const handleDMStarted = useCallback((dm: DMChannelEnriched) => {
    setDmChannels((prev) => {
      const exists = prev.some((d) => d.id === dm.id);
      return exists ? prev : [dm, ...prev];
    });
    setSelectedGuildId('HOME');
    setSelectedDMId(dm.id);
  }, []);

  const handleSelectDM = useCallback((dm: DMChannelEnriched) => {
    setSelectedDMId(dm.id);
  }, []);

  const isDMMode = selectedGuildId === 'HOME' || (!selectedGuildId && guilds.length === 0);
  const selectedGuild = guilds.find((g) => g.id === selectedGuildId) ?? null;
  const selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null;

  const currentActiveId = isDMMode ? selectedDMId : selectedChannelId;
  useEffect(() => {
    setActiveChannel(currentActiveId);
  }, [currentActiveId, setActiveChannel]);

  // Memoized Channel object for ChatArea when in DM mode
  const activeDM = dmChannels.find((d) => d.id === selectedDMId) ?? null;
  const dmChannelObject: Channel | null = useMemo(() => {
    if (!activeDM) return null;
    return {
      id: activeDM.id,
      guildId: '',
      name: `@${activeDM.recipientUsername}`,
      type: 'text' as const,
      createdAt: activeDM.createdAt,
    };
  }, [activeDM?.id, activeDM?.recipientUsername, activeDM?.createdAt]);

  const dmChannelIds = useMemo(() => dmChannels.map((d) => d.id), [dmChannels]);

  // Merge presence data into members
  const membersWithPresence = members.map((m) => ({
    ...m,
    isOnline: presenceMap.get(m.userId) ?? m.isOnline,
  }));

  return (
    <div className="app-layout">
      <Sidebar
        guilds={guilds}
        selectedGuildId={selectedGuildId}
        dmChannelIds={dmChannelIds}
        onSelectGuild={setSelectedGuildId}
        onGuildCreated={handleGuildCreated}
        onGuildJoined={handleGuildJoined}
      />

      {isDMMode ? (
        <>
          <DMList
            dmChannels={dmChannels}
            selectedDMId={selectedDMId}
            onSelectDM={handleSelectDM}
            onDMStarted={handleDMStarted}
          />
          {dmChannelObject ? (
            <ChatArea channel={dmChannelObject} />
          ) : (
            <div className="chat-area">
              <EmptyState
                type="no-channel"
                title="Özel Mesaj Seçin"
                description="Mesajlaşmak için soldaki listeden bir arkadaşınızı seçin veya yeni bir sohbet başlatın."
              />
            </div>
          )}
        </>
      ) : selectedGuild ? (
        <>
          <ChannelList
            guild={selectedGuild}
            channels={channels}
            selectedChannelId={selectedChannelId}
            onSelectChannel={setSelectedChannelId}
            onChannelCreated={handleChannelCreated}
          />
          {selectedChannel ? (
            <ChatArea channel={selectedChannel} />
          ) : (
            <div className="chat-area">
              <EmptyState
                type="no-channel"
                title="Sohbet Kanalı Seçin"
                description="Mesajları görüntülemek veya sohbete katılmak için soldaki listeden bir metin kanalı seçin."
              />
            </div>
          )}
          <MemberList
            members={membersWithPresence}
            channels={channels}
            voiceStates={voiceStates}
            speakingMap={speakingMap}
          />
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', width: '100%' }}>
          <EmptyState
            type="no-guild"
            title="Highbeam'e Hoş Geldiniz"
            description="Highbeam'de sohbet etmek ve sesli konuşmalara katılmak için sol panelden bir sunucu seçin veya yeni bir sunucu oluşturun."
            actionText="Yeni Sunucu Oluştur"
            onAction={() => setShowCreateModal(true)}
          />
        </div>
      )}

      {showCreateModal && (
        <CreateGuildModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(guild) => {
            handleGuildCreated(guild);
            setShowCreateModal(false);
          }}
        />
      )}

      {showJoinModal && (
        <JoinGuildModal
          onClose={() => setShowJoinModal(false)}
          onJoined={(guild) => {
            handleGuildJoined(guild);
            setShowJoinModal(false);
          }}
        />
      )}
    </div>
  );
}
