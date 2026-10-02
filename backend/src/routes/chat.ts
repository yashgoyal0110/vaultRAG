import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, Variables } from '../lib/types';
import { authMiddleware } from '../lib/auth-middleware';
import { generateUUID } from '../lib/crypto';
import { logAudit } from '../lib/audit';
import { retrieveRelevantChunks, buildPrompt, cacheKeyForQuery } from '../lib/rag';
import type { RetrievalStatus } from '../lib/rag';

/**
 * Distinct answers for the distinct ways retrieval comes back empty. Telling a
 * user their document doesn't cover the question, when really it just isn't
 * searchable yet, sends them off to rewrite a question that was fine.
 */
const EMPTY_ANSWERS: Record<RetrievalStatus, string> = {
  ok: "I couldn't find any relevant information in your documents to answer that question.",
  no_matches:
    "I couldn't find any relevant information in your documents to answer that question.",
  indexing:
    "Your documents are still being indexed and aren't searchable yet. This usually finishes within a minute — please ask the same question again shortly.",
  no_documents:
    "You haven't uploaded any documents yet. Upload a PDF and I'll answer questions grounded in it.",
};

const chat = new Hono<{ Bindings: Bindings; Variables: Variables }>();

chat.use('*', authMiddleware);

chat.post('/', async (c) => {
  const auth = c.get('auth');
  const id = generateUUID();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO chats (id, tenant_id, user_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, auth.tenantId, auth.userId, 'New conversation', now, now).run();

  return c.json({ id, title: 'New conversation', createdAt: now });
});

chat.get('/', async (c) => {
  const auth = c.get('auth');
  const result = await c.env.DB.prepare(
    `SELECT id, title, created_at, updated_at
     FROM chats
     WHERE tenant_id = ? AND user_id = ?
     ORDER BY updated_at DESC
     LIMIT 50`
  ).bind(auth.tenantId, auth.userId).all();

  return c.json({ chats: result.results });
});

chat.get('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');

  const chatRow = await c.env.DB.prepare(
    `SELECT id, title, created_at, updated_at
     FROM chats
     WHERE id = ? AND tenant_id = ? AND user_id = ?`
  ).bind(id, auth.tenantId, auth.userId).first();

  if (!chatRow) return c.json({ error: 'Not found' }, 404);

  const messages = await c.env.DB.prepare(
    `SELECT id, role, content, citations, created_at
     FROM messages
     WHERE chat_id = ? AND tenant_id = ?
     ORDER BY created_at ASC`
  ).bind(id, auth.tenantId).all();

  return c.json({
    chat: chatRow,
    messages: messages.results.map((m: any) => ({
      ...m,
      citations: m.citations ? JSON.parse(m.citations) : [],
    })),
  });
});

chat.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');

  const result = await c.env.DB.prepare(
    `DELETE FROM chats WHERE id = ? AND tenant_id = ? AND user_id = ?`
  ).bind(id, auth.tenantId, auth.userId).run();

  if (result.meta.changes === 0) return c.json({ error: 'Not found' }, 404);

  return c.json({ success: true });
});

const askSchema = z.object({
  question: z.string().min(1).max(2000),
  documentIds: z.array(z.string()).optional(), 
});

chat.post('/:id/ask', zValidator('json', askSchema), async (c) => {
  const auth = c.get('auth');
  const chatId = c.req.param('id');
  const { question, documentIds } = c.req.valid('json');

  const chatRow = await c.env.DB.prepare(
    `SELECT id FROM chats WHERE id = ? AND tenant_id = ? AND user_id = ?`
  ).bind(chatId, auth.tenantId, auth.userId).first();

  if (!chatRow) return c.json({ error: 'Chat not found' }, 404);

  const userMessageId = generateUUID();
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, tenant_id, role, content, created_at)
     VALUES (?, ?, ?, 'user', ?, ?)`
  ).bind(userMessageId, chatId, auth.tenantId, question, now).run();

  const cacheKey = await cacheKeyForQuery(auth.tenantId, question);
  const cached = await c.env.CACHE.get(cacheKey, 'json') as
    | { answer: string; citations: any[]; chunks: number }
    | null;

  let answer: string;
  let citations: any[];
  let cacheHit = false;
  let retrievalStatus: RetrievalStatus = 'ok';

  if (cached) {
    answer = cached.answer;
    citations = cached.citations;
    cacheHit = true;
  } else {
    const retrieval = await retrieveRelevantChunks(c.env, auth.tenantId, question, { documentIds });
    const chunks = retrieval.chunks;
    retrievalStatus = retrieval.status;

    if (chunks.length === 0) {
      answer = EMPTY_ANSWERS[retrievalStatus] ?? EMPTY_ANSWERS.no_matches;
      citations = [];
    } else {
      const { systemPrompt, userPrompt } = buildPrompt(question, chunks);

      const llmResponse = (await c.env.AI.run(
        '@cf/meta/llama-3.1-8b-instruct-fp8',
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 800,
          temperature: 0.2,
        },
        {
          gateway: {
            id: c.env.AI_GATEWAY_NAME,
            skipCache: false,
            cacheTtl: 3600,
          },
        }
      )) as { response?: string };

      answer = llmResponse.response?.trim() || 'No response generated.';

      citations = chunks.map((c, i) => ({
        index: i + 1,
        chunkId: c.chunkId,
        documentId: c.documentId,
        filename: c.filename,
        chunkIndex: c.chunkIndex,
        score: c.score,
        preview: c.text.slice(0, 200) + (c.text.length > 200 ? '...' : ''),
      }));

      await c.env.CACHE.put(
        cacheKey,
        JSON.stringify({ answer, citations, chunks: chunks.length }),
        { expirationTtl: 60 * 60 * 24 }
      );
    }
  }

  const assistantMessageId = generateUUID();
  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, tenant_id, role, content, citations, created_at)
     VALUES (?, ?, ?, 'assistant', ?, ?, ?)`
  ).bind(
    assistantMessageId,
    chatId,
    auth.tenantId,
    answer,
    JSON.stringify(citations),
    Date.now()
  ).run();

  await c.env.DB.prepare(
    `UPDATE chats
     SET updated_at = ?,
         title = CASE WHEN title = 'New conversation' THEN ? ELSE title END
     WHERE id = ?`
  ).bind(
    Date.now(),
    question.slice(0, 60),
    chatId
  ).run();

  await logAudit(c.env, {
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: 'rag_query',
    resourceType: 'chat',
    resourceId: chatId,
    metadata: {
      questionLength: question.length,
      citationCount: citations.length,
      cacheHit,
      retrievalStatus,
    },
    ipAddress: c.req.header('CF-Connecting-IP'),
  });

  return c.json({
    messageId: assistantMessageId,
    answer,
    citations,
    cacheHit,
    // Lets the client distinguish "no answer" from "not searchable yet" and offer
    // a retry rather than presenting an indexing lag as a content gap.
    retrievalStatus,
    retryable: retrievalStatus === 'indexing',
  });
});

export default chat;
