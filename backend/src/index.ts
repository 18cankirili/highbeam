// FILE: backend/src/index.ts
import { buildApp } from './app.js';
import { config } from './config.js';
import { setupWebSocket } from './ws/handler.js';

async function main() {
  const { app, databases, close } = await buildApp({
    dbPath: config.DB_PATH,
    logger: true,
  });

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });

    // Set up WebSocket handler on Fastify's underlying HTTP server
    setupWebSocket(app.server, databases.authDb, databases.guildsDb, databases.messagesDb);

    app.log.info(`Highbeam backend listening on port ${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async () => {
    app.log.info('Shutting down Highbeam backend...');
    await close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
