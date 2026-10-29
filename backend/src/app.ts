// FILE: backend/src/app.ts
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { config } from './config.js';
import { initDatabases, Databases } from './db/index.js';
import { AppError } from './utils/errors.js';
import authRoutes from './routes/auth.js';
import guildRoutes from './routes/guilds.js';
import channelRoutes from './routes/channels.js';
import messageRoutes from './routes/messages.js';
import { dmRoutes } from './routes/dms.js';

// Augmentations
import './types.js';

export interface BuildAppOptions {
  dbPath?: string;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<{
  app: FastifyInstance;
  databases: Databases;
  close: () => Promise<void>;
}> {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  // Plugins
  await app.register(cookie);
  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
  });

  // Initialize databases
  const databases = initDatabases(options.dbPath || config.DB_PATH);

  // Decorate Fastify instance with DB references
  app.decorate('authDb', databases.authDb);
  app.decorate('guildsDb', databases.guildsDb);
  app.decorate('messagesDb', databases.messagesDb);

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    if (error.validation) {
      reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
        },
      });
      return;
    }

    request.log.error(error);
    reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
      },
    });
  });

  // Routes
  await app.register(authRoutes);
  await app.register(guildRoutes);
  await app.register(channelRoutes);
  await app.register(messageRoutes);
  await app.register(dmRoutes);

  // Health check
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  const close = async () => {
    databases.authDb.close();
    databases.guildsDb.close();
    databases.messagesDb.close();
    await app.close();
  };

  return { app, databases, close };
}
