import type { Message } from '../types.js';
export interface PaginatedMessages {
    messages: Message[];
    nextCursor: string | null;
}
export declare class MessagesDB {
    private db;
    constructor(dbPath?: string);
    private migrate;
    createMessage(id: string, channelId: string, authorId: string, content: string): Message;
    findMessageById(id: string): Message | undefined;
    getMessagesByChannel(channelId: string, cursor?: string, limit?: number): PaginatedMessages;
    updateMessage(id: string, content: string): Message | undefined;
    softDeleteMessage(id: string): void;
    close(): void;
}
//# sourceMappingURL=messages.d.ts.map