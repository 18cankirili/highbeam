import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { VoiceParticipant } from '../types.js';
import type { AuthDB } from '../db/auth.js';
import type { GuildsDB } from '../db/guilds.js';
import type { MessagesDB } from '../db/messages.js';
export declare function sendError(ws: WebSocket, code: string, message: string): void;
export declare function broadcastToChannel(channelId: string, event: object): void;
export declare function broadcastPresence(userId: string, isOnline: boolean): void;
export declare function broadcastToAllAuthenticated(event: object): void;
export declare function getGuildVoiceStates(guildId: string): Record<string, VoiceParticipant[]>;
export declare function performVoiceLeave(userId: string): void;
export declare function closeWebSocketServer(): Promise<void>;
export declare function setupWebSocket(server: http.Server, authDb: AuthDB, guildsDb: GuildsDB, messagesDb: MessagesDB): WebSocketServer;
//# sourceMappingURL=handler.d.ts.map