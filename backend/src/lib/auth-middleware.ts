import { Context, Next } from 'hono';
import type { Bindings, Variables } from './types';
import { verifyJWT } from './jwt';

export async function authMiddleware(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next
) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Attach to request context. Every downstream handler reads from here.
  c.set('auth', {
    userId: payload.userId,
    tenantId: payload.tenantId,
    email: payload.email,
  });

  await next();
}
