import { extractText, getDocumentProxy } from 'unpdf';
import type { Bindings } from './types';
import { generateUUID } from './crypto';
import { chunkText, estimateTokens } from './chunker';

export type ProcessResult = {
  documentId: string;
  chunkCount: number;
  pageCount: number;
};

/**
 * The core document processing pipeline:
 * 1. Read PDF from R2
 * 2. Extract text using unpdf
 * 3. Chunk it sensibly
 * 4. Embed each chunk via Workers AI (BGE)
 * 5. Insert chunks into D1
 * 6. Insert vectors into Vectorize (with tenant_id in metadata for filtering)
 * 7. Mark document as ready
 */
export async function processDocument(
  env: Bindings,
  documentId: string,
  tenantId: string,
  r2Key: string
): Promise<ProcessResult> {
  const obj = await env.DOCS.get(r2Key);
  if (!obj) throw new Error(`PDF not found in R2: ${r2Key}`);
  const pdfBuffer = await obj.arrayBuffer();

  const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const fullText = Array.isArray(text) ? text.join('\n\n') : text;

  if (!fullText || fullText.trim().length < 50) {
    throw new Error('PDF appears to be empty or contains only images (OCR not supported in v1)');
  }

  const chunks = chunkText(fullText);
  if (chunks.length === 0) throw new Error('No chunks produced from document');

  const BATCH_SIZE = 20;
  const now = Date.now();

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => c.text);

    // Embed
    const embedResult = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: texts,
    }) as { shape: number[]; data: number[][] };

    if (!embedResult.data || embedResult.data.length !== batch.length) {
      throw new Error(`Embedding batch failed: expected ${batch.length}, got ${embedResult.data?.length}`);
    }

    const chunkRows = batch.map((chunk, idx) => ({
      id: generateUUID(),
      tenantId,
      documentId,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      tokenCount: estimateTokens(chunk.text),
      embedding: embedResult.data[idx],
    }));

    await env.DB.batch(
      chunkRows.map(row =>
        env.DB.prepare(
          `INSERT INTO chunks (id, tenant_id, document_id, chunk_index, page_number, text, token_count, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          row.id,
          row.tenantId,
          row.documentId,
          row.chunkIndex,
          null,
          row.text,
          row.tokenCount,
          now
        )
      )
    );

    await env.VECTORS.upsert(
      chunkRows.map(row => ({
        id: row.id,
        values: row.embedding,
        metadata: {
          tenant_id: row.tenantId,
          document_id: row.documentId,
          chunk_index: row.chunkIndex,
        },
      }))
    );
  }

  await env.DB.prepare(
    `UPDATE documents
     SET status = 'ready', chunk_count = ?, page_count = ?, processed_at = ?
     WHERE id = ? AND tenant_id = ?`
  ).bind(chunks.length, totalPages, now, documentId, tenantId).run();

  return {
    documentId,
    chunkCount: chunks.length,
    pageCount: totalPages,
  };
}

export async function deleteDocument(
  env: Bindings,
  documentId: string,
  tenantId: string
): Promise<void> {
  const doc = await env.DB.prepare(
    'SELECT id, r2_key FROM documents WHERE id = ? AND tenant_id = ?'
  ).bind(documentId, tenantId).first<{ id: string; r2_key: string }>();

  if (!doc) throw new Error('Document not found or access denied');

  const chunks = await env.DB.prepare(
    'SELECT id FROM chunks WHERE document_id = ? AND tenant_id = ?'
  ).bind(documentId, tenantId).all<{ id: string }>();

  const chunkIds = chunks.results.map(r => r.id);

  if (chunkIds.length > 0) {
    const VEC_BATCH = 100;
    for (let i = 0; i < chunkIds.length; i += VEC_BATCH) {
      await env.VECTORS.deleteByIds(chunkIds.slice(i, i + VEC_BATCH));
    }
  }

  await env.DB.prepare(
    'DELETE FROM documents WHERE id = ? AND tenant_id = ?'
  ).bind(documentId, tenantId).run();

  await env.DOCS.delete(doc.r2_key);
}
