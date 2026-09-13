import type { ContentBlock } from "@/lib/ingestion/extract.server";

/**
 * Semantic chunking.
 *
 * Chunks follow the document's own structure: a new heading always starts a
 * new chunk, blocks accumulate until a size budget, and each chunk carries a
 * short overlap with the previous one so a definition split across a boundary
 * is still retrievable. Formulas and worked examples are pulled out as
 * first-class fields rather than left buried in prose.
 */

export interface DraftChunk {
  content: string;
  section: string;
  page: number | null;
  formulas: string[];
  examples: string[];
  /** Rough token estimate, used for budgeting only. */
  tokens: number;
}

const TARGET_CHARS = 1100;
const MAX_CHARS = 1600;
const MIN_CHARS = 220;
const OVERLAP_CHARS = 160;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function tailOverlap(text: string): string {
  if (text.length <= OVERLAP_CHARS) return text;
  const tail = text.slice(-OVERLAP_CHARS);
  const boundary = tail.search(/[.!?।]\s/);
  return boundary >= 0 ? tail.slice(boundary + 1).trim() : tail.trim();
}

export function chunkBlocks(blocks: ContentBlock[]): DraftChunk[] {
  const chunks: DraftChunk[] = [];
  let buffer: ContentBlock[] = [];
  let section = "";
  let page: number | null = null;
  let carry = "";

  const flush = () => {
    const body = buffer
      .map((b) => b.text)
      .join("\n")
      .trim();
    buffer = [];
    if (body.length < MIN_CHARS) {
      // Too small to stand alone — hand it to the next chunk as context.
      carry = carry ? `${carry}\n${body}` : body;
      return;
    }
    const content = (carry ? `${carry}\n${body}` : body).trim();
    chunks.push({
      content,
      section,
      page,
      formulas: body
        .split("\n")
        .filter((l) => /[=∫∑√±]|\\frac/.test(l) && l.length < 220)
        .slice(0, 4),
      examples: body
        .split("\n")
        .filter((l) => /^(example|illustration|solved|problem)\b/i.test(l))
        .slice(0, 3),
      tokens: estimateTokens(content),
    });
    carry = tailOverlap(body);
  };

  for (const block of blocks) {
    if (block.kind === "heading") {
      flush();
      section = block.section || block.text;
      if (block.page !== null) page = block.page;
      continue;
    }
    if (block.page !== null) page = block.page;

    const projected = buffer.reduce((n, b) => n + b.text.length + 1, 0) + block.text.length;
    if (projected > MAX_CHARS && buffer.length > 0) flush();
    buffer.push(block);
    if (buffer.reduce((n, b) => n + b.text.length + 1, 0) >= TARGET_CHARS) flush();
  }
  flush();

  // Anything still carried and substantial deserves its own chunk.
  if (carry.length >= MIN_CHARS && !chunks.some((c) => c.content.endsWith(carry))) {
    chunks.push({
      content: carry,
      section,
      page,
      formulas: [],
      examples: [],
      tokens: estimateTokens(carry),
    });
  }
  return chunks;
}
