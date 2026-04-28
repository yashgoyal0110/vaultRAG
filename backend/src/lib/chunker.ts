/**
 * Splits text into overlapping chunks suitable for embedding.
 *
 * Strategy: sentence-aware chunking with overlap.
 * - Target chunk size: ~500 tokens (~2000 chars, since 1 token ≈ 4 chars in English)
 * - Overlap: ~50 tokens (~200 chars) to preserve context across chunk boundaries
 * - We split on sentences first, then group sentences until we hit the target size
 */

export type Chunk = {
  text: string;
  chunkIndex: number;
  charStart: number;
  charEnd: number;
};

const TARGET_CHUNK_CHARS = 2000;
const OVERLAP_CHARS = 200;
const MIN_CHUNK_CHARS = 100;

export function chunkText(text: string): Chunk[] {
  // Normalize whitespace
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  if (cleaned.length < MIN_CHUNK_CHARS) {
    return cleaned.length > 0
      ? [{ text: cleaned, chunkIndex: 0, charStart: 0, charEnd: cleaned.length }]
      : [];
  }

  // Split into sentences (rough but good enough)
  const sentences = splitIntoSentences(cleaned);

  const chunks: Chunk[] = [];
  let currentChunk = '';
  let currentStart = 0;
  let cursor = 0;
  let chunkIndex = 0;

  for (const sentence of sentences) {
    const sentenceStart = cleaned.indexOf(sentence, cursor);
    cursor = sentenceStart + sentence.length;

    // If adding this sentence would exceed target, flush current chunk
    if (currentChunk.length > 0 && currentChunk.length + sentence.length > TARGET_CHUNK_CHARS) {
      chunks.push({
        text: currentChunk.trim(),
        chunkIndex: chunkIndex++,
        charStart: currentStart,
        charEnd: currentStart + currentChunk.length,
      });

      // Start new chunk with overlap from end of previous chunk
      const overlapText = currentChunk.slice(-OVERLAP_CHARS);
      currentChunk = overlapText + ' ' + sentence;
      currentStart = currentStart + currentChunk.length - overlapText.length - sentence.length - 1;
    } else {
      if (currentChunk.length === 0) currentStart = sentenceStart;
      currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence;
    }
  }

  if (currentChunk.trim().length >= MIN_CHUNK_CHARS) {
    chunks.push({
      text: currentChunk.trim(),
      chunkIndex: chunkIndex++,
      charStart: currentStart,
      charEnd: currentStart + currentChunk.length,
    });
  }

  return chunks;
}

function splitIntoSentences(text: string): string[] {
  const parts: string[] = [];
  let buffer = '';
  for (let i = 0; i < text.length; i++) {
    buffer += text[i];
    const next = text[i + 1];
    const nextNext = text[i + 2];
    if (
      (text[i] === '.' || text[i] === '!' || text[i] === '?') &&
      next === ' ' &&
      nextNext &&
      nextNext.toUpperCase() === nextNext &&
      /[A-Z]/.test(nextNext)
    ) {
      parts.push(buffer.trim());
      buffer = '';
    } else if (text[i] === '\n' && next === '\n') {
      parts.push(buffer.trim());
      buffer = '';
      i++;
    }
  }
  if (buffer.trim().length > 0) parts.push(buffer.trim());
  return parts.filter(p => p.length > 0);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
