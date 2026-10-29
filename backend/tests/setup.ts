// FILE: backend/tests/setup.ts
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import type { Databases } from '../src/db/index.js';

export interface TestContext {
  app: FastifyInstance;
  databases: Databases;
  dbDir: string;
  close: () => Promise<void>;
  createTestUser: (usernamePrefix?: string) => Promise<{
    user: { id: string; username: string; email: string };
    token: string;
    authHeaders: { authorization: string };
  }>;
}

export async function createTestContext(): Promise<TestContext> {
  const dbDir = path.join(os.tmpdir(), `highbeam-test-${randomUUID()}`);
  fs.mkdirSync(dbDir, { recursive: true });

  const { app, databases, close: appClose } = await buildApp({
    dbPath: dbDir,
    logger: false,
  });

  const createTestUser = async (usernamePrefix: string = 'user') => {
    const id = randomUUID().slice(0, 8);
    const username = `${usernamePrefix}_${id}`;
    const email = `${username}@example.com`;
    const password = 'Password123!';

    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username, email, password },
    });
    if (regRes.statusCode !== 201) {
      throw new Error(`Failed to create test user: ${regRes.body}`);
    }

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username, password },
    });
    const loginData = loginRes.json();
    const token = loginData.token as string;

    return {
      user: loginData.user,
      token,
      authHeaders: {
        authorization: `Bearer ${token}`,
      },
    };
  };

  const close = async () => {
    await appClose();
    try {
      fs.rmSync(dbDir, { recursive: true, force: true });
    } catch {
      // Ignore directory cleanup error on locked SQLite files
    }
  };

  return {
    app,
    databases,
    dbDir,
    close,
    createTestUser,
  };
}
