import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings, Variables } from './lib/types';
import auth from './routes/auth';
import me from './routes/me';
import chat from './routes/chat';
import documents from './routes/documents';


const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/', (c) => c.json({ status: 'ok', service: 'vaultrag-api' }));

app.get('/health', async (c) => {
  const checks: Record<string, string> = {};
  try {
    await c.env.DB.prepare('SELECT 1').first();
    checks.d1 = 'ok';
  } catch (e: any) { checks.d1 = `error: ${e.message}`; }
  try {
    await c.env.CACHE.put('hc', 'ok', { expirationTtl: 60 });
    checks.kv = 'ok';
  } catch (e: any) { checks.kv = `error: ${e.message}`; }
  checks.r2 = c.env.DOCS ? 'bound' : 'missing';
  checks.vectors = c.env.VECTORS ? 'bound' : 'missing';
  checks.ai = c.env.AI ? 'bound' : 'missing';
  checks.jwt = c.env.JWT_SECRET ? 'set' : 'missing';
  return c.json({ checks });
});

app.route('/auth', auth);
app.route('/me', me);
app.route('/documents', documents);
app.route('/chats', chat);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error', message: err.message }, 500);
});

export default app;
