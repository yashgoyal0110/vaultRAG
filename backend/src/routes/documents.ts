import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { authMiddleware } from '../lib/auth-middleware';
import { generateUUID } from '../lib/crypto';
import { logAudit } from '../lib/audit';
import { processDocument, deleteDocument } from '../lib/documents';

const documents = new Hono<{ Bindings: Bindings; Variables: Variables }>();

documents.use('*', authMiddleware);

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

// ----- Upload -----
documents.post('/', async (c) => {
  const auth = c.get('auth');

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch (e) {
    return c.json({ error: 'Invalid multipart form data' }, 400);
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file uploaded (expected field "file")' }, 400);
  }

  // Validate
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return c.json({ error: 'Only PDF files are supported' }, 400);
  }
  if (file.size > MAX_PDF_BYTES) {
    return c.json({ error: `File too large (max ${MAX_PDF_BYTES / 1024 / 1024} MB)` }, 400);
  }
  if (file.size === 0) {
    return c.json({ error: 'File is empty' }, 400);
  }

  // Generate IDs and tenant-scoped R2 key
  const documentId = generateUUID();
  const r2Key = `${auth.tenantId}/${documentId}.pdf`;
  const now = Date.now();

  // 1. Upload to R2 first
  await c.env.DOCS.put(r2Key, file.stream(), {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: {
      tenant_id: auth.tenantId,
      user_id: auth.userId,
      original_filename: file.name,
    },
  });

  // 2. Insert document row (status: processing)
  await c.env.DB.prepare(
    `INSERT INTO documents (id, tenant_id, user_id, filename, r2_key, size_bytes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'processing', ?)`
  ).bind(documentId, auth.tenantId, auth.userId, file.name, r2Key, file.size, now).run();

  // 3. Process inline (extract, chunk, embed, store)
  // For larger PDFs you'd defer this to a Queue, but inline is fine for v1.
  try {
    const result = await processDocument(c.env, documentId, auth.tenantId, r2Key);

    await logAudit(c.env, {
      tenantId: auth.tenantId,
      userId: auth.userId,
      action: 'document_uploaded',
      resourceType: 'document',
      resourceId: documentId,
      metadata: { filename: file.name, sizeBytes: file.size, chunks: result.chunkCount },
      ipAddress: c.req.header('CF-Connecting-IP'),
    });

    return c.json({
      id: documentId,
      filename: file.name,
      sizeBytes: file.size,
      chunkCount: result.chunkCount,
      pageCount: result.pageCount,
      status: 'ready',
    });
  } catch (e: any) {
    // Mark as failed
    await c.env.DB.prepare(
      `UPDATE documents SET status = 'failed', error_message = ? WHERE id = ? AND tenant_id = ?`
    ).bind(e.message?.slice(0, 500) || 'Unknown error', documentId, auth.tenantId).run();

    await logAudit(c.env, {
      tenantId: auth.tenantId,
      userId: auth.userId,
      action: 'document_upload_failed',
      resourceType: 'document',
      resourceId: documentId,
      metadata: { filename: file.name, error: e.message },
    });

    return c.json({ error: 'Document processing failed', message: e.message }, 500);
  }
});

// ----- List -----
documents.get('/', async (c) => {
  const auth = c.get('auth');

  const result = await c.env.DB.prepare(
    `SELECT id, filename, size_bytes, page_count, chunk_count, status, error_message, created_at, processed_at
     FROM documents
     WHERE tenant_id = ?
     ORDER BY created_at DESC
     LIMIT 100`
  ).bind(auth.tenantId).all();

  return c.json({ documents: result.results });
});

// ----- Get one -----
documents.get('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');

  const doc = await c.env.DB.prepare(
    `SELECT id, filename, size_bytes, page_count, chunk_count, status, error_message, created_at, processed_at
     FROM documents
     WHERE id = ? AND tenant_id = ?`
  ).bind(id, auth.tenantId).first();

  if (!doc) return c.json({ error: 'Not found' }, 404);
  return c.json(doc);
});

// ----- Delete -----
documents.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');

  try {
    await deleteDocument(c.env, id, auth.tenantId);
  } catch (e: any) {
    return c.json({ error: e.message }, 404);
  }

  await logAudit(c.env, {
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: 'document_deleted',
    resourceType: 'document',
    resourceId: id,
  });

  return c.json({ success: true });
});

export default documents;
