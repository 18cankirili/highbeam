// FILE: backend/tests/auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext, type TestContext } from './setup.js';

describe('Auth Flow', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('registers a new user successfully', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'alice',
        email: 'alice@example.com',
        password: 'Password123!',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user).toBeDefined();
    expect(body.user.username).toBe('alice');
    expect(body.user.email).toBe('alice@example.com');
    expect(body.user.passwordHash).toBeUndefined(); // Never leak hash
  });

  it('rejects duplicate username with 409 CONFLICT', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'alice',
        email: 'different@example.com',
        password: 'Password123!',
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT');
  });

  it('rejects duplicate email with 409 CONFLICT', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'bob',
        email: 'alice@example.com',
        password: 'Password123!',
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT');
  });

  it('validates input formats with 400 VALIDATION_ERROR', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'a', // too short
        email: 'not-an-email',
        password: '123', // too short
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('logs in with correct credentials and returns JWT + cookie', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'alice',
        password: 'Password123!',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(body.user.username).toBe('alice');

    // Verify Set-Cookie header contains highbeam_token
    const cookies = res.cookies;
    const authCookie = cookies.find((c) => c.name === 'highbeam_token');
    expect(authCookie).toBeDefined();
    expect(authCookie?.httpOnly).toBe(true);
  });

  it('rejects login with wrong password with 401 UNAUTHORIZED', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'alice',
        password: 'WrongPassword!',
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('retrieves user profile via /api/auth/me with Bearer token', async () => {
    const { token } = await ctx.createTestUser('me_test');

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBeDefined();
  });

  it('retrieves user profile via /api/auth/me with cookie', async () => {
    const loginRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'alice',
        password: 'Password123!',
      },
    });

    const cookieHeader = loginRes.headers['set-cookie'] as string;

    const meRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        cookie: cookieHeader,
      },
    });

    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().user.username).toBe('alice');
  });

  it('rejects /api/auth/me without authentication with 401', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/me',
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('clears session cookie on logout', async () => {
    const { authHeaders } = await ctx.createTestUser('logout_user');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});
