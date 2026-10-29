// FILE: frontend/src/context/VoiceContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useAuth } from './AuthContext';
import { useWebSocket } from './WebSocketContext';
import { useToast } from './ToastContext';
import type { VoiceParticipant } from '../types';

interface VoiceContextValue {
  currentVoiceChannelId: string | null;
  currentVoiceChannelName: string | null;
  participants: VoiceParticipant[];
  voiceStates: Record<string, VoiceParticipant[]>;
  isMuted: boolean;
  isDeafened: boolean;
  speakingMap: Map<string, boolean>;
  micError: string | null;
  isConnecting: boolean;
  joinVoice: (channelId: string, channelName: string) => Promise<void>;
  leaveVoice: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  clearMicError: () => void;
  setInitialVoiceStates: (states: Record<string, VoiceParticipant[]>) => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

function getIceServers(): RTCIceServer[] {
  const envServers = import.meta.env.VITE_ICE_SERVERS;
  if (!envServers) {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
  try {
    const parsed = JSON.parse(envServers);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    return [{ urls: envServers.split(',').map((u: string) => u.trim()) }];
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { sendMessage: wsSend, subscribe, unsubscribe } = useWebSocket();
  const toast = useToast();

  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState<string | null>(null);
  const [currentVoiceChannelName, setCurrentVoiceChannelName] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [voiceStates, setVoiceStates] = useState<Record<string, VoiceParticipant[]>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [speakingMap, setSpeakingMap] = useState<Map<string, boolean>>(new Map());
  const [micError, setMicError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // References for WebRTC and Audio processing
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceCandidateQueuesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
  const volumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentChannelIdRef = useRef<string | null>(null);

  currentChannelIdRef.current = currentVoiceChannelId;

  // Cleanup all WebRTC resources, audio elements and stream
  const cleanupResources = useCallback(() => {
    // 1. Stop local media stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      localStreamRef.current = null;
    }

    // 2. Close and clear all peer connections
    for (const pc of peersRef.current.values()) {
      try {
        pc.close();
      } catch {
        // Ignore
      }
    }
    peersRef.current.clear();
    iceCandidateQueuesRef.current.clear();

    // 3. Pause, clear and remove remote audio elements
    for (const audio of remoteAudiosRef.current.values()) {
      try {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      } catch {
        // Ignore
      }
    }
    remoteAudiosRef.current.clear();

    // 4. Safely close AudioContext
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {});
        }
      } catch {
        // Ignore
      }
      audioContextRef.current = null;
    }
    analysersRef.current.clear();

    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }

    setSpeakingMap(new Map());
  }, []);

  const setInitialVoiceStates = useCallback((states: Record<string, VoiceParticipant[]>) => {
    setVoiceStates(states);
  }, []);

  // Speaking monitor interval setup
  const startVolumeMonitor = useCallback(() => {
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
    }

    volumeIntervalRef.current = setInterval(() => {
      const newSpeaking = new Map<string, boolean>();
      const buffer = new Uint8Array(64);

      for (const [id, analyser] of analysersRef.current.entries()) {
        try {
          analyser.getByteFrequencyData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i];
          }
          const avg = sum / buffer.length;
          if (avg > 18) {
            newSpeaking.set(id, true);
          }
        } catch {
          // Analyser may be detached
        }
      }

      setSpeakingMap(newSpeaking);
    }, 60);
  }, []);

  // Attach an AnalyserNode to a MediaStream for speaking detection
  const attachAnalyser = useCallback((stream: MediaStream, identifier: string) => {
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
      }

      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);

      analysersRef.current.set(identifier, analyser);
    } catch (err) {
      console.warn('Failed to attach audio analyser:', err);
    }
  }, []);

  // Create or obtain RTCPeerConnection for a peer
  const getOrCreatePeerConnection = useCallback(
    (targetUserId: string, channelId: string): RTCPeerConnection => {
      let pc = peersRef.current.get(targetUserId);
      if (pc) return pc;

      pc = new RTCPeerConnection({
        iceServers: getIceServers(),
      });

      peersRef.current.set(targetUserId, pc);
      iceCandidateQueuesRef.current.set(targetUserId, []);

      // Add local stream tracks to this peer
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc?.addTrack(track, localStreamRef.current!);
        });
      }

      // Send local ICE candidates to target user via WebSocket
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          wsSend('voice_signal', {
            channelId,
            targetUserId,
            data: { candidate: event.candidate.toJSON() },
          });
        }
      };

      // Handle receiving remote audio track
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (!remoteStream) return;

        let audio = remoteAudiosRef.current.get(targetUserId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          remoteAudiosRef.current.set(targetUserId, audio);
        }
        audio.srcObject = remoteStream;
        audio.muted = isDeafened;
        audio.play().catch(() => {});

        attachAnalyser(remoteStream, targetUserId);
      };

      pc.onconnectionstatechange = () => {
        if (pc?.connectionState === 'disconnected' || pc?.connectionState === 'failed') {
          // Connection closed or failed
        }
      };

      return pc;
    },
    [wsSend, attachAnalyser, isDeafened]
  );

  // Leave current voice channel
  const leaveVoice = useCallback(() => {
    if (!currentChannelIdRef.current) return;

    try {
      wsSend('voice_leave');
    } catch {
      // Ignore
    }
    cleanupResources();

    setCurrentVoiceChannelId(null);
    setCurrentVoiceChannelName(null);
    setParticipants([]);
    setIsConnecting(false);
  }, [wsSend, cleanupResources]);

  // Join a voice channel
  const joinVoice = useCallback(
    async (channelId: string, channelName: string) => {
      if (currentChannelIdRef.current === channelId) return;

      setIsConnecting(true);
      setMicError(null);

      // Clean up previous channel if any
      cleanupResources();

      // Request microphone access
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } catch (err) {
        setIsConnecting(false);
        const errorMsg =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Mikrofon erişim izni verilmedi. Ses kanalına katılmak için lütfen tarayıcınızda mikrofon iznini açın.'
            : 'Mikrofona erişilemedi. Lütfen ses giriş ayarlarınızı kontrol edin.';
        setMicError(errorMsg);
        toast.error(errorMsg);
        return;
      }

      localStreamRef.current = stream;

      // Attach analyser to local microphone
      if (user) {
        attachAnalyser(stream, user.id);
      }
      startVolumeMonitor();

      setCurrentVoiceChannelId(channelId);
      setCurrentVoiceChannelName(channelName);

      // Send join message to server
      wsSend('voice_join', { channelId });
      setIsConnecting(false);
      toast.info(`🔊 #${channelName} ses kanalına bağlanıldı`);
    },
    [user, cleanupResources, wsSend, attachAnalyser, startVolumeMonitor, toast]
  );

  // Toggle microphone mute
  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    wsSend('voice_state', { muted: nextMuted, deafened: isDeafened });
  }, [isMuted, isDeafened, wsSend]);

  // Toggle deafen (mutes incoming audio AND microphone)
  const toggleDeafen = useCallback(() => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);

    for (const audio of remoteAudiosRef.current.values()) {
      audio.muted = nextDeafened;
    }

    const nextMuted = nextDeafened ? true : isMuted;
    if (nextDeafened) {
      setIsMuted(true);
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
    }

    wsSend('voice_state', { muted: nextMuted, deafened: nextDeafened });
  }, [isDeafened, isMuted, wsSend]);

  const clearMicError = useCallback(() => {
    setMicError(null);
  }, []);

  // Proactive cleanup on tab close, page hide or offline event
  useEffect(() => {
    const handleUnload = () => {
      if (currentChannelIdRef.current) {
        try {
          wsSend('voice_leave');
        } catch {
          // Ignore
        }
        cleanupResources();
      }
    };

    const handleOffline = () => {
      if (currentChannelIdRef.current) {
        toast.warning('İnternet bağlantısı koptu. Ses kanalından ayrılındı.');
        leaveVoice();
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('offline', handleOffline);
    };
  }, [cleanupResources, leaveVoice, wsSend, toast]);

  // WebSocket message handlers for WebRTC signaling and voice state
  useEffect(() => {
    // 1. Initial participant list sent to the newly joined client
    const handleVoiceParticipants = async (data: Record<string, unknown>) => {
      const channelId = data.channelId as string;
      const peers = (data.participants as VoiceParticipant[]) || [];

      if (channelId !== currentChannelIdRef.current) return;

      setParticipants(() => {
        const others = peers.filter((p) => p.userId !== user?.id);
        const me: VoiceParticipant = {
          userId: user!.id,
          username: user!.username,
          muted: isMuted,
          deafened: isDeafened,
        };
        return [me, ...others];
      });

      // Newly joined client sends offers to all existing peers (glare avoidance)
      for (const peer of peers) {
        if (peer.userId === user?.id) continue;
        try {
          const pc = getOrCreatePeerConnection(peer.userId, channelId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          wsSend('voice_signal', {
            channelId,
            targetUserId: peer.userId,
            data: { sdp: pc.localDescription },
          });
        } catch (err) {
          console.error(`Failed to create offer for peer ${peer.userId}:`, err);
        }
      }
    };

    // 2. A new user joined voice channel
    const handleVoiceUserJoined = (data: Record<string, unknown>) => {
      const channelId = data.channelId as string;
      const newUser = data.user as VoiceParticipant;

      setVoiceStates((prev) => {
        const currentList = prev[channelId] || [];
        if (currentList.some((u) => u.userId === newUser.userId)) return prev;
        return {
          ...prev,
          [channelId]: [...currentList, newUser],
        };
      });

      if (channelId === currentChannelIdRef.current) {
        setParticipants((prev) => {
          if (prev.some((u) => u.userId === newUser.userId)) return prev;
          return [...prev, newUser];
        });
      }
    };

    // 3. User left voice channel
    const handleVoiceUserLeft = (data: Record<string, unknown>) => {
      const channelId = data.channelId as string;
      const userId = data.userId as string;

      setVoiceStates((prev) => {
        const currentList = prev[channelId] || [];
        return {
          ...prev,
          [channelId]: currentList.filter((u) => u.userId !== userId),
        };
      });

      if (channelId === currentChannelIdRef.current) {
        setParticipants((prev) => prev.filter((p) => p.userId !== userId));

        const pc = peersRef.current.get(userId);
        if (pc) {
          try {
            pc.close();
          } catch {
            // Ignore
          }
          peersRef.current.delete(userId);
        }
        iceCandidateQueuesRef.current.delete(userId);

        const audio = remoteAudiosRef.current.get(userId);
        if (audio) {
          try {
            audio.pause();
            audio.remove();
          } catch {
            // Ignore
          }
          remoteAudiosRef.current.delete(userId);
        }
        analysersRef.current.delete(userId);
      }
    };

    // 4. Voice signal (SDP offer/answer or ICE candidate)
    const handleVoiceSignal = async (data: Record<string, unknown>) => {
      const channelId = data.channelId as string;
      const fromUserId = data.fromUserId as string;
      const signal = data.data as {
        sdp?: RTCSessionDescriptionInit;
        candidate?: RTCIceCandidateInit;
      };

      if (channelId !== currentChannelIdRef.current) return;

      const pc = getOrCreatePeerConnection(fromUserId, channelId);

      try {
        if (signal.sdp) {
          if (signal.sdp.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

            const queue = iceCandidateQueuesRef.current.get(fromUserId) || [];
            for (const cand of queue) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
            iceCandidateQueuesRef.current.set(fromUserId, []);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            wsSend('voice_signal', {
              channelId,
              targetUserId: fromUserId,
              data: { sdp: pc.localDescription },
            });
          } else if (signal.sdp.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

            const queue = iceCandidateQueuesRef.current.get(fromUserId) || [];
            for (const cand of queue) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
            iceCandidateQueuesRef.current.set(fromUserId, []);
          }
        } else if (signal.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else {
            let queue = iceCandidateQueuesRef.current.get(fromUserId);
            if (!queue) {
              queue = [];
              iceCandidateQueuesRef.current.set(fromUserId, queue);
            }
            queue.push(signal.candidate);
          }
        }
      } catch (err) {
        console.error(`Error handling voice signal from ${fromUserId}:`, err);
      }
    };

    // 5. Voice state update (mute/deafen)
    const handleVoiceStateUpdate = (data: Record<string, unknown>) => {
      const channelId = data.channelId as string;
      const userId = data.userId as string;
      const muted = data.muted as boolean;
      const deafened = data.deafened as boolean;

      setVoiceStates((prev) => {
        const list = prev[channelId] || [];
        return {
          ...prev,
          [channelId]: list.map((u) => (u.userId === userId ? { ...u, muted, deafened } : u)),
        };
      });

      if (channelId === currentChannelIdRef.current) {
        setParticipants((prev) =>
          prev.map((p) => (p.userId === userId ? { ...p, muted, deafened } : p))
        );
      }
    };

    subscribe('voice_participants', handleVoiceParticipants);
    subscribe('voice_user_joined', handleVoiceUserJoined);
    subscribe('voice_user_left', handleVoiceUserLeft);
    subscribe('voice_signal', handleVoiceSignal);
    subscribe('voice_state_update', handleVoiceStateUpdate);

    return () => {
      unsubscribe('voice_participants', handleVoiceParticipants);
      unsubscribe('voice_user_joined', handleVoiceUserJoined);
      unsubscribe('voice_user_left', handleVoiceUserLeft);
      unsubscribe('voice_signal', handleVoiceSignal);
      unsubscribe('voice_state_update', handleVoiceStateUpdate);
    };
  }, [user, wsSend, subscribe, unsubscribe, getOrCreatePeerConnection, isMuted, isDeafened]);

  // Cleanup on unmount or page exit
  useEffect(() => {
    return () => {
      if (currentChannelIdRef.current) {
        try {
          wsSend('voice_leave');
        } catch {
          // Ignore
        }
      }
      cleanupResources();
    };
  }, [cleanupResources, wsSend]);

  return (
    <VoiceContext.Provider
      value={{
        currentVoiceChannelId,
        currentVoiceChannelName,
        participants,
        voiceStates,
        isMuted,
        isDeafened,
        speakingMap,
        micError,
        isConnecting,
        joinVoice,
        leaveVoice,
        toggleMute,
        toggleDeafen,
        clearMicError,
        setInitialVoiceStates,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used within VoiceProvider');
  return ctx;
}
