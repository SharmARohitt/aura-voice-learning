/**
 * Content extraction and structure detection.
 *
 * Turns raw HTML or pasted text into ordered blocks that remember where they
 * sit in the document: heading path, block kind, and approximate page. Chunking
 * later relies on this structure instead of blindly slicing characters.
 */

export type BlockKind = "heading" | "paragraph" | "list" | "formula" | "example" | "table";

export interface ContentBlock {
  kind: BlockKind;
  /** Heading depth for headings; 0 otherwise. */
  level: number;
  text: string;
  /** Nearest enclosing heading trail, e.g. "Electrostatics › Potential". */
  section: string;
  page: number | null;
}

const BLOCK_TAGS = "h1|h2|h3|h4|h5|h6|p|li|pre|blockquote|td|figcaption";

function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)));
}

function stripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|nav|footer|header|aside|form|noscript)[\s\S]*?<\/\1>/gi, " ");
}

function classify(text: string, tag: string): BlockKind {
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "li") return "list";
  if (tag === "td") return "table";
  if (/^(example|illustration|solved|q\d|problem)\b/i.test(text)) return "example";
  if (/[=∫∑√±]|\\frac|\^\d|_\{/.test(text) && text.length < 220) return "formula";
  return "paragraph";
}

/** Extract ordered blocks from an HTML document. */
export function extractHtml(html: string): ContentBlock[] {
  const cleaned = stripNoise(html);
  const blocks: ContentBlock[] = [];
  const trail: string[] = [];
  const pattern = new RegExp(`<(${BLOCK_TAGS})\\b[^>]*>([\\s\\S]*?)</\\1>`, "gi");

  for (const match of cleaned.matchAll(pattern)) {
    const tag = match[1].toLowerCase();
    const text = decode(match[2].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 3) continue;

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      trail.length = Math.max(0, level - 1);
      trail[level - 1] = text;
      blocks.push({ kind: "heading", level, text, section: trail.filter(Boolean).join(" › "), page: null });
      continue;
    }
    blocks.push({
      kind: classify(text, tag),
      level: 0,
      text,
      section: trail.filter(Boolean).join(" › "),
      page: null,
    });
  }
  return blocks;
}

/**
 * Extract blocks from plain text (pasted notes, transcripts, parsed PDFs).
 * Page markers of the form "--- page 12 ---" or "[Page 12]" are honoured.
 */
export function extractText(text: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const trail: string[] = [];
  let page: number | null = null;

  for (const raw of text.split(/\n{2,}/)) {
    const paragraph = raw.replace(/[ \t]+/g, " ").trim();
    if (!paragraph) continue;

    const pageMatch = paragraph.match(/^(?:-{2,}\s*)?\[?page\s+(\d+)\]?/i);
    if (pageMatch) {
      page = Number(pageMatch[1]);
      const rest = paragraph.slice(pageMatch[0].length).trim();
      if (!rest) continue;
    }

    const isHeading =
      paragraph.length < 90 &&
      !/[.?!]$/.test(paragraph) &&
      (/^(chapter|unit|section|topic|lesson)\b/i.test(paragraph) ||
        /^\d+(\.\d+)*\s+\S/.test(paragraph) ||
        paragraph === paragraph.toUpperCase());

    if (isHeading) {
      const level = /^(chapter|unit)\b/i.test(paragraph) ? 1 : 2;
      trail.length = Math.max(0, level - 1);
      trail[level - 1] = paragraph;
      blocks.push({ kind: "heading", level, text: paragraph, section: trail.filter(Boolean).join(" › "), page });
      continue;
    }

    blocks.push({
      kind: classify(paragraph, "p"),
      level: 0,
      text: paragraph,
      section: trail.filter(Boolean).join(" › "),
      page,
    });
  }
  return blocks;
}

export function extract(body: string, contentType: string): ContentBlock[] {
  return /html/i.test(contentType) || /<\/?(html|body|div|p)\b/i.test(body.slice(0, 400))
    ? extractHtml(body)
    : extractText(body);
}

/** A readable title for the document, best-effort. */
export function guessTitle(body: string, blocks: ContentBlock[], fallback: string): string {
  const tagged = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (tagged) return decode(tagged).replace(/\s+/g, " ").trim().slice(0, 160);
  const heading = blocks.find((b) => b.kind === "heading");
  return (heading?.text ?? fallback).slice(0, 160);
}
