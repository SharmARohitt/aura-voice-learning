import { CORPUS } from "@/lib/knowledge/corpus";
import type { LectureChunk } from "@/lib/types";

/**
 * Precomputed knowledge index.
 *
 * Everything expensive (tokenising, term frequencies, document frequencies,
 * concept sets, neighbour links) happens ONCE at module load — never inside a
 * student's request. Query time only does map lookups and arithmetic.
 *
 * Swapping the in-memory maps for pgvector / Qdrant means re-implementing this
 * file; nothing above it knows where the postings live.
 */

const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","of","to","in","on","for","and","or","kya","hai","ka",
  "ki","ke","se","ko","mein","me","na","nahi","par","aur","yeh","woh","bata","batao","samjhao",
  "samajh","samjha","please","my","i","it","this","that","do","does","can","you","explain","kaise",
  "kyun","kyu","what","why","how","when","which","with","about","tell","mujhe","sir","maam","bhai",
  "simple","way","matlab","hota","hoti","hote","kro","karo","de","do",
]);

const SYNONYMS: Record<string, string[]> = {
  potential: ["voltage", "potential"],
  voltage: ["potential", "voltage"],
  field: ["field", "electric"],
  relation: ["relation", "relationship", "difference", "connect"],
  difference: ["difference", "relation"],
  recursion: ["recursion", "recursive"],
  base: ["base", "terminating"],
  charge: ["charge", "coulomb"],
  derivative: ["derivative", "differentiation"],
  differentiate: ["differentiation", "derivative"],
  integration: ["integration", "integral", "antiderivative"],
  integral: ["integration", "integral"],
  mole: ["mole", "avogadro", "molar"],
  photosynthesis: ["photosynthesis", "light", "calvin", "chloroplast"],
  light: ["light", "photosynthesis"],
  complexity: ["complexity", "big"],
  force: ["force", "newton"],
  heat: ["heat", "thermodynamics", "entropy"],
  entropy: ["entropy", "thermodynamics", "disorder"],
  thermodynamics: ["thermodynamics", "entropy", "heat"],
  trigonometry: ["trigonometry", "sin", "cos", "identities"],
  resonance: ["resonance", "delocalisation", "delocalization"],
  gati: ["motion", "newton", "force"],
  bal: ["force", "newton"],
  urja: ["energy", "work"],
  prakash: ["light", "photosynthesis"],
  garmi: ["heat", "thermodynamics"],
  ganit: ["mathematics"],
  vidyut: ["electric", "charge"],
};

export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function expand(tokens: string[]): string[] {
  const out = new Set(tokens);
  for (const t of tokens) for (const s of SYNONYMS[t] ?? []) out.add(s);
  return [...out];
}

/** "11th Physics", "Class XI", "class 11" → "Class 11". */
export function canonicalClass(raw: string | undefined): string {
  if (!raw) return "";
  const s = raw.toLowerCase();
  const roman: Record<string, string> = { ix: "9", x: "10", xi: "11", xii: "12" };
  const romanHit = Object.keys(roman).find((r) => new RegExp(`\\b${r}\\b`).test(s));
  const digits = s.match(/\b(9|10|11|12)\b/)?.[1] ?? (romanHit ? roman[romanHit] : undefined);
  if (digits) return `Class ${digits}`;
  if (/college|graduation|b\.?tech|ug/.test(s)) return "College";
  return raw;
}

export interface IndexedChunk {
  chunk: LectureChunk;
  /** token -> frequency across text + concepts + topic + chapter + keywords */
  tf: Map<string, number>;
  length: number;
  conceptTokens: Set<string>;
  classCanonical: string;
  /** Adjacent segments of the same lecture, in timestamp order. */
  prevId: string | null;
  nextId: string | null;
}

export interface KnowledgeIndex {
  chunks: IndexedChunk[];
  byId: Map<string, IndexedChunk>;
  /** token -> number of documents containing it */
  df: Map<string, number>;
  /** prefix (first 4 chars) -> document count, for prefix-matched IDF */
  prefixDf: Map<string, number>;
  avgLength: number;
  size: number;
}

function build(corpus: LectureChunk[]): KnowledgeIndex {
  const chunks: IndexedChunk[] = corpus.map((c) => {
    const tokens = tokenize(
      `${c.text} ${c.concepts.join(" ")} ${c.topic} ${c.chapter} ${c.subtopic ?? ""} ${(c.keywords ?? []).join(" ")}`,
    );
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return {
      chunk: c,
      tf,
      length: tokens.length || 1,
      conceptTokens: new Set(tokenize(`${c.concepts.join(" ")} ${c.topic} ${c.subtopic ?? ""}`)),
      classCanonical: canonicalClass(c.class_level),
      prevId: null,
      nextId: null,
    };
  });

  const df = new Map<string, number>();
  const prefixDf = new Map<string, number>();
  for (const doc of chunks) {
    const seenPrefix = new Set<string>();
    for (const term of doc.tf.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
      const p = term.slice(0, 4);
      if (!seenPrefix.has(p)) {
        seenPrefix.add(p);
        prefixDf.set(p, (prefixDf.get(p) ?? 0) + 1);
      }
    }
  }

  // Neighbour relationships: lecture -> segment -> timestamp order preserved.
  const byLecture = new Map<string, IndexedChunk[]>();
  for (const doc of chunks) {
    const list = byLecture.get(doc.chunk.lecture_id) ?? [];
    list.push(doc);
    byLecture.set(doc.chunk.lecture_id, list);
  }
  for (const list of byLecture.values()) {
    list.sort((a, b) => a.chunk.timestamp_start.localeCompare(b.chunk.timestamp_start));
    list.forEach((doc, i) => {
      doc.prevId = list[i - 1]?.chunk.chunk_id ?? null;
      doc.nextId = list[i + 1]?.chunk.chunk_id ?? null;
    });
  }

  return {
    chunks,
    byId: new Map(chunks.map((d) => [d.chunk.chunk_id, d])),
    df,
    prefixDf,
    avgLength: chunks.reduce((s, d) => s + d.length, 0) / Math.max(chunks.length, 1) || 1,
    size: chunks.length,
  };
}

let cached: KnowledgeIndex | null = null;

/** Built once per server instance; ingestion reloads by calling invalidateIndex(). */
export function knowledgeIndex(): KnowledgeIndex {
  if (!cached) cached = build(CORPUS);
  return cached;
}

export function invalidateIndex(): void {
  cached = null;
}

/** Timestamp string ("01:17:32") to seconds — used by replay + context packing. */
export function toSeconds(stamp: string): number {
  const parts = stamp.split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** Small TTL cache used for query embeddings, retrieval results and health. */
export class TtlCache<T> {
  private readonly store = new Map<string, { value: T; expires: number }>();
  constructor(
    private readonly ttlMs: number,
    private readonly max = 200,
  ) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // refresh recency
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.max) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}
