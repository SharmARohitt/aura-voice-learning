import {
  canonicalClass,
  expand,
  knowledgeIndex,
  tokenize,
  TtlCache,
  type IndexedChunk,
} from "@/lib/rag/index.server";
import type { LectureChunk, RetrievalResult, RetrievedEvidence } from "@/lib/types";

/**
 * Hybrid retrieval over the precomputed educational index.
 *
 * Channels run over precomputed postings: BM25 lexical + concept-space
 * semantic, fused with reciprocal rank fusion, then reranked. Metadata-aware
 * (class, exam, subject, chapter), multi-level (direct + neighbour +
 * prerequisite) and cached per normalised query.
 */

export interface RetrievalFilter {
  course_id?: string;
  subject?: string;
  subjects?: string[];
  chapter?: string;
  class_level?: string;
  exam?: string;
}

export interface KnowledgeRepository {
  search(query: string, filter: RetrievalFilter, limit?: number): Promise<RetrievedEvidence[]>;
  byConcept(concepts: string[], excludeIds: string[], limit?: number): Promise<LectureChunk[]>;
  neighbours(chunkId: string): LectureChunk[];
  size(): number;
}

function rrf(rank: number): number {
  return 1 / (60 + rank);
}

function idf(term: string): number {
  const index = knowledgeIndex();
  const df = index.df.get(term) ?? index.prefixDf.get(term.slice(0, 4)) ?? 0;
  if (df === 0) return 0;
  return Math.log(1 + (index.size - df + 0.5) / (df + 0.5));
}

/** Term frequency with cheap prefix matching against the precomputed map. */
function termFrequency(doc: IndexedChunk, term: string): number {
  const direct = doc.tf.get(term);
  if (direct) return direct;
  let tf = 0;
  for (const [t, count] of doc.tf) {
    if (t.startsWith(term) || term.startsWith(t)) tf += count;
  }
  return tf;
}

function bm25(tokens: string[], doc: IndexedChunk): number {
  const k1 = 1.5;
  const b = 0.75;
  const avg = knowledgeIndex().avgLength;
  let score = 0;
  for (const term of tokens) {
    const tf = termFrequency(doc, term);
    if (tf === 0) continue;
    score += idf(term) * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * doc.length) / avg)));
  }
  return score;
}

/** Concept-space overlap — the dense/semantic channel of the hybrid search. */
function conceptSimilarity(tokens: string[], doc: IndexedChunk): number {
  if (doc.conceptTokens.size === 0) return 0;
  let hits = 0;
  for (const t of tokens) {
    for (const c of doc.conceptTokens) {
      if (c === t || c.startsWith(t) || t.startsWith(c)) {
        hits += 1;
        break;
      }
    }
  }
  return hits / Math.max(tokens.length, 1);
}

export class IndexedKnowledgeRepository implements KnowledgeRepository {
  size(): number {
    return knowledgeIndex().size;
  }

  private pool(filter: RetrievalFilter): IndexedChunk[] {
    const wantedClass = canonicalClass(filter.class_level);
    return knowledgeIndex().chunks.filter(
      (d) =>
        d.chunk.approval_status === "approved" &&
        (!filter.course_id || d.chunk.course_id === filter.course_id) &&
        (!filter.subject || d.chunk.subject === filter.subject) &&
        (!filter.subjects?.length || filter.subjects.includes(d.chunk.subject)) &&
        (!filter.chapter || d.chunk.chapter === filter.chapter) &&
        (!wantedClass || d.classCanonical === wantedClass) &&
        (!filter.exam || d.chunk.exams.includes(filter.exam)),
    );
  }

  neighbours(chunkId: string): LectureChunk[] {
    const index = knowledgeIndex();
    const doc = index.byId.get(chunkId);
    if (!doc) return [];
    return [doc.prevId, doc.nextId]
      .map((id) => (id ? index.byId.get(id)?.chunk : undefined))
      .filter((c): c is LectureChunk => Boolean(c));
  }

  async byConcept(concepts: string[], excludeIds: string[], limit = 2): Promise<LectureChunk[]> {
    const wanted = concepts.map((c) => c.toLowerCase()).filter(Boolean);
    if (wanted.length === 0) return [];
    const out: LectureChunk[] = [];
    for (const doc of knowledgeIndex().chunks) {
      if (out.length >= limit) break;
      const c = doc.chunk;
      if (c.approval_status !== "approved" || excludeIds.includes(c.chunk_id)) continue;
      const labels = [...c.concepts, c.topic].map((l) => l.toLowerCase());
      if (labels.some((l) => wanted.some((w) => l.includes(w) || w.includes(l)))) out.push(c);
    }
    return out;
  }

  async search(query: string, filter: RetrievalFilter, limit = 4): Promise<RetrievedEvidence[]> {
    const pool = this.pool(filter);
    if (pool.length === 0) return [];

    const tokens = expand(tokenize(query));
    if (tokens.length === 0) return [];

    // Both channels score the same candidate pool — cheap because every doc
    // already carries its term-frequency map.
    const lexical = pool
      .map((doc) => ({ doc, score: bm25(tokens, doc) }))
      .sort((a, b) => b.score - a.score);
    const semantic = pool
      .map((doc) => ({ doc, score: conceptSimilarity(tokens, doc) }))
      .sort((a, b) => b.score - a.score);

    const maxLex = Math.max(...lexical.map((l) => l.score), 1e-6);
    const fused = new Map<string, RetrievedEvidence & { fusion: number }>();

    lexical.forEach((entry, i) => {
      fused.set(entry.doc.chunk.chunk_id, {
        chunk: entry.doc.chunk,
        lexical: entry.score / maxLex,
        semantic: 0,
        relevance: 0,
        level: "direct",
        fusion: rrf(i),
      });
    });
    semantic.forEach((entry, i) => {
      const existing = fused.get(entry.doc.chunk.chunk_id);
      if (existing) {
        existing.semantic = entry.score;
        existing.fusion += rrf(i);
      }
    });

    return [...fused.values()]
      .map((e) => {
        const raw = 0.55 * e.lexical + 0.35 * e.semantic + 8 * e.fusion;
        return { ...e, relevance: Math.max(0, Math.min(1, raw)) };
      })
      .filter((e) => e.lexical > 0 || e.semantic > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit)
      .map(({ chunk, relevance, lexical: l, semantic: s, level }) => ({
        chunk,
        level,
        relevance: Number(relevance.toFixed(3)),
        lexical: Number(l.toFixed(3)),
        semantic: Number(s.toFixed(3)),
      }));
  }
}

/** Below this the system refuses to claim course grounding. */
export const GROUNDING_THRESHOLD = 0.45;

const repository: KnowledgeRepository = new IndexedKnowledgeRepository();
const retrievalCache = new TtlCache<RetrievalResult>(5 * 60_000, 150);

export function knowledgeSize(): number {
  return repository.size();
}

export function neighboursOf(chunkId: string): LectureChunk[] {
  return repository.neighbours(chunkId);
}

/**
 * Retrieval cascade: strict metadata filter first, then progressively widen so
 * a student is never blocked by their own onboarding answers.
 */
export async function retrieve(
  query: string,
  filter: RetrievalFilter = {},
): Promise<RetrievalResult> {
  const started = performance.now();
  const cacheKey = `${query.trim().toLowerCase()}|${JSON.stringify(filter)}`;
  const cachedResult = retrievalCache.get(cacheKey);
  if (cachedResult) {
    return {
      ...cachedResult,
      cached: true,
      latencyMs: Number((performance.now() - started).toFixed(1)),
    };
  }

  const cascade: { label: string; filter: RetrievalFilter }[] = [
    { label: "exact", filter },
    {
      label: "course",
      filter: {
        ...(filter.course_id ? { course_id: filter.course_id } : {}),
        ...(filter.subject ? { subject: filter.subject } : {}),
      },
    },
    {
      label: "subjects",
      filter: filter.subjects?.length ? { subjects: filter.subjects } : {},
    },
    { label: "class", filter: filter.class_level ? { class_level: filter.class_level } : {} },
    { label: "global", filter: {} },
  ];

  let evidence: RetrievedEvidence[] = [];
  let filterUsed = "global";
  for (const step of cascade) {
    evidence = await repository.search(query, step.filter, 4);
    if (evidence.length > 0 && (evidence[0]?.relevance ?? 0) >= GROUNDING_THRESHOLD) {
      filterUsed = step.label;
      break;
    }
    if (evidence.length > 0) filterUsed = step.label;
  }

  const rerankStart = performance.now();
  const topRelevance = evidence[0]?.relevance ?? 0;

  // Multi-level: pull the prerequisite evidence behind the top hit.
  const prerequisiteGaps = evidence[0]?.chunk.prerequisites ?? [];
  if (evidence.length > 0 && prerequisiteGaps.length > 0) {
    const supporting = await repository.byConcept(
      prerequisiteGaps,
      evidence.map((e) => e.chunk.chunk_id),
      2,
    );
    for (const chunk of supporting) {
      evidence.push({
        chunk,
        relevance: Number((topRelevance * 0.6).toFixed(3)),
        lexical: 0,
        semantic: 0,
        level: "prerequisite",
      });
    }
  }
  const rerankMs = Number((performance.now() - rerankStart).toFixed(1));

  const result: RetrievalResult = {
    evidence,
    topRelevance,
    grounded: topRelevance >= GROUNDING_THRESHOLD,
    latencyMs: Number((performance.now() - started).toFixed(1)),
    rerankMs,
    candidates: repository.size(),
    filterUsed,
    prerequisiteGaps,
    cached: false,
  };
  retrievalCache.set(cacheKey, result);
  return result;
}
