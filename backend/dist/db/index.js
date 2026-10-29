// FILE: backend/src/db/index.ts
import { AuthDB } from './auth.js';
import { GuildsDB } from './guilds.js';
import { MessagesDB } from './messages.js';
import path from 'path';
export function initDatabases(dbPath) {
    const authDb = new AuthDB(path.join(dbPath, 'auth.db'));
    const guildsDb = new GuildsDB(path.join(dbPath, 'guilds.db'));
    const messagesDb = new MessagesDB(path.join(dbPath, 'messages.db'));
    return { authDb, guildsDb, messagesDb };
}
//# sourceMappingURL=index.js.map