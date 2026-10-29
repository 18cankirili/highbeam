// FILE: backend/src/routes/auth.ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.js';
import { conflictError, unauthorizedError, validationError } from '../utils/errors.js';

const registerSchema = z.object({
  username: z.string().min(3).max(32),
  email: z.string().email(),
  password: z.string().min(6).max(128),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/auth/register
  fastify.post('/api/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const { username, email, password } = parsed.data;

    // Check if username or email already taken
    const existingUsername = fastify.authDb.findUserByUsername(username);
    if (existingUsername) {
      throw conflictError('Username already taken');
    }

    const existingEmail = fastify.authDb.findUserByEmail(email);
    if (existingEmail) {
      throw conflictError('Email already registered');
    }

    const passwordHash = await argon2.hash(password);
    const id = randomUUID();
    const user = fastify.authDb.createUser(id, username, email, passwordHash);

    reply.status(201);
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    };
  });

  // POST /api/auth/login
  fastify.post('/api/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const { username, password } = parsed.data;

    const user = fastify.authDb.findUserByUsername(username);
    if (!user) {
      throw unauthorizedError('Invalid username or password');
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw unauthorizedError('Invalid username or password');
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    reply.setCookie('highbeam_token', token, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    });

    return {
      user: {
        id: user.id,
        username: user.username,
      },
      token,
    };
  });

  // POST /api/auth/logout
  fastify.post('/api/auth/logout', { preHandler: [authenticate] }, async (_request, reply) => {
    reply.clearCookie('highbeam_token', { path: '/' });
    return { success: true };
  });

  // GET /api/auth/me
  fastify.get('/api/auth/me', { preHandler: [authenticate] }, async (request, _reply) => {
    const user = fastify.authDb.findUserById(request.user!.userId);
    if (!user) {
      throw unauthorizedError('User not found');
    }

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isOnline: user.isOnline,
        createdAt: user.createdAt,
      },
    };
  });
}
