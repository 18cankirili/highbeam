import { FastifyInstance } from 'fastify';
import { Databases } from './db/index.js';
import './types.js';
export interface BuildAppOptions {
    dbPath?: string;
    logger?: boolean;
}
export declare function buildApp(options?: BuildAppOptions): Promise<{
    app: FastifyInstance;
    databases: Databases;
    close: () => Promise<void>;
}>;
//# sourceMappingURL=app.d.ts.map