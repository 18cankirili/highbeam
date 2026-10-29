import type { User, UserWithPassword } from '../types.js';
export interface Session {
    id: string;
    userId: string;
    token: string;
    expiresAt: string;
    createdAt: string;
}
export declare class AuthDB {
    private db;
    constructor(dbPath?: string);
    private migrate;
    createUser(id: string, username: string, email: string, passwordHash: string): User;
    findUserByUsername(username: string): UserWithPassword | undefined;
    findUserByEmail(email: string): User | undefined;
    findUserById(id: string): User | undefined;
    setOnline(userId: string, isOnline: boolean): void;
    createSession(id: string, userId: string, token: string, expiresAt: string): void;
    findSessionByToken(token: string): Session | undefined;
    deleteSession(token: string): void;
    deleteUserSessions(userId: string): void;
    close(): void;
}
//# sourceMappingURL=auth.d.ts.map