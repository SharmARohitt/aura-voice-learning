import { CORPUS } from "@/lib/knowledge/corpus";
import type { LectureChunk, RetrievalResult, RetrievedEvidence } from "@/lib/types";

/**
 * Hybrid retrieval over approved course knowledge:
 *   metadata filter -> BM25-style lexical scoring + concept/semantic overlap
 *   -> reciprocal-rank fusion -> rerank -> confidence.
 *
 * The repository interface below is what a pgvector / Qdrant / Chroma backend
 * would implement; only `search()` needs to change to swap the store.
 */
export interface KnowledgeRepository {
  search(query: string, filter: RetrievalFilter, limit: number): Promise<RetrievedEvidence[]>;
}

export interface RetrievalFilter {
  course_id?: string;
  subject?: string;
  chapter?: string;
}

const STOPWORDS = new Set([
  "the","a","an","is","are","and","or","of","to","in","on","for","with","how","what","why","sir",
  "ma'am","mujhe","mera","meri","nahi","aa","raha","rahi","hai","ka","ki","ke","kya","kyu","kyun",
  "samajh","please","me","my","i","it","this","that","do","does","can","you","explain","batao",
]);

const SYNONYMS: Record<string, string[]> = {
  potential: ["voltage", "v", "potential"],
  field: ["field", "e"],
  relation: ["relation", "relationship", "connect", "difference"],
  recursion: ["recursion", "recursive", "call"],
  base: ["base", "terminating"],
  charge: ["charge", "coulomb"],
};

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function expand(tokens: string[]): string[] {
  const out = new Set(tokens);
  for (const t of tokens) for (const s of SYNONYMS[t] ?? []) out.add(s);
  return [...out];
}

function bm25(queryTokens: string[], chunk: LectureChunk, corpus: LectureChunk[]): number {
  const k1 = 1.5;
  const b = 0.75;
  const docTokens = tokenize(chunk.text + " " + chunk.concepts.join(" "));
  const docLen = docTokens.length || 1;
  const avgLen =
    corpus.reduce((sum, c) => sum + tokenize(c.text).length, 0) / Math.max(corpus.length, 1) || 1;

  let score = 0;
  for (const term of queryTokens) {
    const tf = docTokens.filter((t) => t === term || t.startsWith(term)).length;
    if (tf === 0) continue;
    const df = corpus.filter((c) => tokenize(c.text).some((t) => t.startsWith(term))).length || 1;
    const idf = Math.log(1 + (corpus.length - df + 0.5) / (df + 0.5));
    score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * docLen) / avgLen)));
  }
  return score;
}

/** Concept-space overlap — stands in for the dense vector similarity channel. */
function conceptSimilarity(queryTokens: string[], chunk: LectureChunk): number {
  const conceptTokens = new Set(tokenize(chunk.concepts.join(" ")));
  if (conceptTokens.size === 0) return 0;
  let hits = 0;
  for (const t of queryTokens) {
    for (const c of conceptTokens) {
      if (c === t || c.startsWith(t) || t.startsWith(c)) {
        hits += 1;
        break;
      }
    }
  }
  return hits / Math.max(queryTokens.length, 1);
}

function rrf(rank: number): number {
  return 1 / (60 + rank);
}

export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly corpus: LectureChunk[] = CORPUS) {}

  async search(
    query: string,
    filter: RetrievalFilter,
    limit = 4,
  ): Promise<RetrievedEvidence[]> {
    const pool = this.corpus.filter(
      (c) =>
        c.approval_status === "approved" &&
        (!filter.course_id || c.course_id === filter.course_id) &&
        (!filter.subject || c.subject === filter.subject) &&
        (!filter.chapter || c.chapter === filter.chapter),
    );
    if (pool.length === 0) return [];

    const tokens = expand(tokenize(query));
    if (tokens.length === 0) return [];

    const lexical = pool
      .map((chunk) => ({ chunk, score: bm25(tokens, chunk, pool) }))
      .sort((a, b) => b.score - a.score);
    const semantic = pool
      .map((chunk) => ({ chunk, score: conceptSimilarity(tokens, chunk) }))
      .sort((a, b) => b.score - a.score);

    const maxLex = Math.max(...lexical.map((l) => l.score), 1e-6);
    const fused = new Map<string, RetrievedEvidence & { fusion: number }>();

    lexical.forEach((entry, i) => {
      fused.set(entry.chunk.chunk_id, {
        chunk: entry.chunk,
        lexical: entry.score / maxLex,
        semantic: 0,
        relevance: 0,
        fusion: rrf(i),
      });
    });
    semantic.forEach((entry, i) => {
      const existing = fused.get(entry.chunk.chunk_id);
      if (existing) {
        existing.semantic = entry.score;
        existing.fusion += rrf(i);
      }
    });

    // Rerank: fusion rank + direct channel strengths, squashed into 0..1.
    const reranked = [...fused.values()]
      .map((e) => {
        const raw = 0.55 * e.lexical + 0.35 * e.semantic + 8 * e.fusion;
        return { ...e, relevance: Math.max(0, Math.min(1, raw)) };
      })
      .filter((e) => e.lexical > 0 || e.semantic > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

    return reranked.map(({ chunk, relevance, lexical: l, semantic: s }) => ({
      chunk,
      relevance: Number(relevance.toFixed(3)),
      lexical: Number(l.toFixed(3)),
      semantic: Number(s.toFixed(3)),
    }));
  }
}

/** Below this the system refuses to answer from curriculum rather than guess. */
export const GROUNDING_THRESHOLD = 0.45;

const repository: KnowledgeRepository = new InMemoryKnowledgeRepository();

export async function retrieve(
  query: string,
  filter: RetrievalFilter = {},
): Promise<RetrievalResult> {
  const started = Date.now();
  let evidence = await repository.search(query, filter, 4);
  // Course context known but nothing found inside it: widen only to the course.
  if (evidence.length === 0 && filter.chapter) {
    evidence = await repository.search(
      query,
      filter.course_id ? { course_id: filter.course_id } : {},
      4,
    );
  }
  const topRelevance = evidence[0]?.relevance ?? 0;
  return {
    evidence,
    topRelevance,
    grounded: topRelevance >= GROUNDING_THRESHOLD,
    latencyMs: Date.now() - started,
  };
}
