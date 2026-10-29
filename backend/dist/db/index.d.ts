import { AuthDB } from './auth.js';
import { GuildsDB } from './guilds.js';
import { MessagesDB } from './messages.js';
export interface Databases {
    authDb: AuthDB;
    guildsDb: GuildsDB;
    messagesDb: MessagesDB;
}
export declare function initDatabases(dbPath: string): Databases;
//# sourceMappingURL=index.d.ts.map