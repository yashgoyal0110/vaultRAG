import type { Bindings } from './types';

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  filename: string;
  text: string;
  chunkIndex: number;
  score: number;
};

const TOP_K = 5;
const MIN_SCORE = 0.3; // Filter out very weak matches

/**
 * Embed a query and retrieve the most relevant chunks for this tenant.
 *
 * CRITICAL: This function enforces tenant isolation in TWO places:
 * 1. Vectorize query is filtered by tenant_id metadata
 * 2. D1 lookup of chunk text uses tenant_id in the WHERE clause
 *
 * If either layer is bypassed, the other still prevents data leakage.
 */
export async function retrieveRelevantChunks(
  env: Bindings,
  tenantId: string,
  query: string,
  options?: { topK?: number; documentIds?: string[] }
): Promise<RetrievedChunk[]> {
  const topK = options?.topK ?? TOP_K;

  // ----- 1. Embed the query -----
  const embedResult = (await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [query],
  })) as { data: number[][] };

  const queryVector = embedResult.data[0];
  if (!queryVector) throw new Error('Query embedding failed');

  // ----- 2. Search Vectorize, scoped to tenant -----
  const filter: Record<string, any> = { tenant_id: { $eq: tenantId } };
  if (options?.documentIds && options.documentIds.length > 0) {
    filter.document_id = { $in: options.documentIds };
  }

  const matches = await env.VECTORS.query(queryVector, {
    topK,
    filter,
    returnMetadata: 'indexed',
  });

  if (!matches.matches || matches.matches.length === 0) return [];

  // Filter weak matches
  const relevant = matches.matches.filter(m => m.score >= MIN_SCORE);
  if (relevant.length === 0) return [];

  // ----- 3. Fetch chunk text from D1 (with tenant_id double-check) -----
  const chunkIds = relevant.map(m => m.id);
  const placeholders = chunkIds.map(() => '?').join(',');

  const rows = await env.DB.prepare(
    `SELECT
       c.id as chunk_id,
       c.document_id,
       c.chunk_index,
       c.text,
       d.filename
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE c.id IN (${placeholders})
       AND c.tenant_id = ?
       AND d.tenant_id = ?`
  ).bind(...chunkIds, tenantId, tenantId).all<{
    chunk_id: string;
    document_id: string;
    chunk_index: number;
    text: string;
    filename: string;
  }>();

  // Build a map for ordering by Vectorize score
  const rowMap = new Map(rows.results.map(r => [r.chunk_id, r]));

  return relevant
    .map(match => {
      const row = rowMap.get(match.id);
      if (!row) return null;
      return {
        chunkId: row.chunk_id,
        documentId: row.document_id,
        filename: row.filename,
        text: row.text,
        chunkIndex: row.chunk_index,
        score: match.score,
      };
    })
    .filter((c): c is RetrievedChunk => c !== null);
}

/**
 * Build the prompt sent to the LLM.
 * The system message is strict: only answer from context, cite sources, say "I don't know" if unclear.
 */
export function buildPrompt(question: string, chunks: RetrievedChunk[]): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `You are VaultRAG, a precise document Q&A assistant. Your job is to answer questions using ONLY the provided context.

RULES:
1. Answer only from the provided context. If the context doesn't contain the answer, say "I couldn't find that in your documents." Do not use outside knowledge.
2. When you reference information, cite the source using [^N] where N is the source number, e.g., "Revenue grew 12% in 2023 [^1]."
3. Be concise but complete. Do not pad answers with filler.
4. If multiple sources contain relevant info, synthesize them and cite each.
5. Do not invent quotes. Paraphrase from the context.`;

  const contextBlocks = chunks
    .map((c, i) => `[Source ${i + 1}: "${c.filename}", chunk ${c.chunkIndex}]\n${c.text}`)
    .join('\n\n---\n\n');

  const userPrompt = `Context from the user's documents:

${contextBlocks}

---

Question: ${question}

Answer using only the context above. Cite sources with [^N] notation.`;

  return { systemPrompt, userPrompt };
}

/**
 * Compute a stable cache key for a question + tenant.
 * Uses SHA-256 of (tenant + normalized question) as the key.
 */
export async function cacheKeyForQuery(tenantId: string, question: string): Promise<string> {
  const normalized = question.toLowerCase().trim().replace(/\s+/g, ' ');
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(`${tenantId}:${normalized}`));
  const hex = Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `qcache:${hex.slice(0, 32)}`;
}
