// FILE: backend/src/db/index.ts
import { AuthDB } from './auth.js';
import { GuildsDB } from './guilds.js';
import { MessagesDB } from './messages.js';
import path from 'path';

export interface Databases {
  authDb: AuthDB;
  guildsDb: GuildsDB;
  messagesDb: MessagesDB;
}

export function initDatabases(dbPath: string): Databases {
  const authDb = new AuthDB(path.join(dbPath, 'auth.db'));
  const guildsDb = new GuildsDB(path.join(dbPath, 'guilds.db'));
  const messagesDb = new MessagesDB(path.join(dbPath, 'messages.db'));

  return { authDb, guildsDb, messagesDb };
}
