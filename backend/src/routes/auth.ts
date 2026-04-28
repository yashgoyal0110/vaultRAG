import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings } from '../lib/types';
import { generateUUID, generateSalt, hashPassword, verifyPassword } from '../lib/crypto';
import { signJWT } from '../lib/jwt';
import { logAudit } from '../lib/audit';

const auth = new Hono<{ Bindings: Bindings }>();

const signupSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
  organizationName: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(128),
});

auth.post('/signup', zValidator('json', signupSchema), async (c) => {
  const { email, password, organizationName } = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first();

  if (existing) {
    return c.json({ error: 'An account with this email already exists' }, 409);
  }

  const tenantId = generateUUID();
  const userId = generateUUID();
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const now = Date.now();

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO tenants (id, name, created_at, plan) VALUES (?, ?, ?, ?)'
    ).bind(tenantId, organizationName, now, 'free'),

    c.env.DB.prepare(
      `INSERT INTO users (id, tenant_id, email, password_hash, password_salt, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(userId, tenantId, email, passwordHash, salt, now, now),
  ]);

  await logAudit(c.env, {
    tenantId,
    userId,
    action: 'signup',
    metadata: { email, organizationName },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  const token = await signJWT(
    { userId, tenantId, email },
    c.env.JWT_SECRET
  );

  return c.json({
    token,
    user: { id: userId, email, tenantId },
    tenant: { id: tenantId, name: organizationName },
  });
});

auth.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const user = await c.env.DB.prepare(
    'SELECT id, tenant_id, email, password_hash, password_salt FROM users WHERE email = ?'
  ).bind(email).first<{
    id: string;
    tenant_id: string;
    email: string;
    password_hash: string;
    password_salt: string;
  }>();

  if (!user) {
    await logAudit(c.env, {
      tenantId: 'unknown',
      action: 'login_failed',
      metadata: { email, reason: 'user_not_found' },
      ipAddress: c.req.header('CF-Connecting-IP'),
    });
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const valid = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!valid) {
    await logAudit(c.env, {
      tenantId: user.tenant_id,
      userId: user.id,
      action: 'login_failed',
      metadata: { reason: 'wrong_password' },
      ipAddress: c.req.header('CF-Connecting-IP'),
    });
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  await c.env.DB.prepare(
    'UPDATE users SET last_login_at = ? WHERE id = ?'
  ).bind(Date.now(), user.id).run();

  const tenant = await c.env.DB.prepare(
    'SELECT id, name FROM tenants WHERE id = ?'
  ).bind(user.tenant_id).first<{ id: string; name: string }>();

  await logAudit(c.env, {
    tenantId: user.tenant_id,
    userId: user.id,
    action: 'login',
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  const token = await signJWT(
    { userId: user.id, tenantId: user.tenant_id, email: user.email },
    c.env.JWT_SECRET
  );

  return c.json({
    token,
    user: { id: user.id, email: user.email, tenantId: user.tenant_id },
    tenant,
  });
});

export default auth;
