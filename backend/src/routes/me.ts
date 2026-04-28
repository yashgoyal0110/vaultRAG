import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { authMiddleware } from '../lib/auth-middleware';

const me = new Hono<{ Bindings: Bindings; Variables: Variables }>();

me.use('*', authMiddleware);

me.get('/', async (c) => {
  const auth = c.get('auth');

  const tenant = await c.env.DB.prepare(
    'SELECT id, name, plan FROM tenants WHERE id = ?'
  ).bind(auth.tenantId).first();

  return c.json({
    user: { id: auth.userId, email: auth.email },
    tenant,
  });
});

export default me;
