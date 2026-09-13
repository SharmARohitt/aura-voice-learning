import { embedQuery } from "@/lib/embeddings/provider.server";
import {
  approvedChunkCount,
  conceptCandidates,
  lexicalCandidates,
  neighbourChunks,
  prerequisiteChunks,
  vectorCandidates,
  type DbFilter,
} from "@/lib/knowledge/repository.server";
import { expand, tokenize, TtlCache } from "@/lib/rag/index.server";
import {
  GROUNDING_THRESHOLD,
  retrieveSeed,
  type RetrievalFilter,
} from "@/lib/rag/retriever.server";
import type {
  GroundingLevel,
  LectureChunk,
  RetrievalResult,
  RetrievedEvidence,
  SourceAttribution,
} from "@/lib/types";

/**
 * Hybrid retrieval across five channels.
 *
 *   lexical (database full-text)  ─┐
 *   vector  (database pgvector)   ─┤
 *   concept (concept graph)       ─┼─► weighted RRF ─► rerank ─► small set
 *   seed    (bundled BM25 corpus) ─┤
 *   prerequisite / neighbour      ─┘   (expansion, not competition)
 *
 * The goal is deliberately *fewer* pieces of evidence than a naive top-k:
 * candidates are pulled wide per channel, fused, reranked on real signal, then
 * cut to the few that actually earn a place in the prompt.
 */

/** Weight per channel in the fusion step. */
const WEIGHT = { lexical: 1.0, vector: 1.15, concept: 0.8, seed: 0.9 } as const;
const RRF_K = 60;

/** Partial grounding sits between "answer from the course" and "general knowledge". */
export const PARTIAL_THRESHOLD = 0.28;

interface Candidate {
  chunk: LectureChunk;
  fusion: number;
  lexical: number;
  semantic: number;
  channels: Set<keyof typeof WEIGHT>;
}

const hybridCache = new TtlCache<RetrievalResult>(5 * 60_000, 200);

function dbFilter(filter: RetrievalFilter): DbFilter {
  return {
    subject: filter.subject ?? filter.subjects?.[0] ?? null,
    class_level: filter.class_level ?? null,
    chapter: filter.chapter ?? null,
    exam: filter.exam ?? null,
  };
}

/** Lexical overlap of query tokens against a candidate's own text. */
function overlapScore(tokens: string[], chunk: LectureChunk): number {
  if (tokens.length === 0) return 0;
  const text = tokenize(
    `${chunk.text} ${chunk.concepts.join(" ")} ${chunk.topic} ${chunk.chapter} ${(chunk.keywords ?? []).join(" ")}`,
  );
  const set = new Set(text);
  let hits = 0;
  for (const t of tokens) {
    if (set.has(t)) hits += 1;
    else if ([...set].some((w) => w.startsWith(t) || t.startsWith(w))) hits += 0.5;
  }
  return Math.min(1, hits / tokens.length);
}

/** Metadata agreement — class, exam, chapter and subject awareness. */
function metadataBonus(chunk: LectureChunk, filter: RetrievalFilter): number {
  let bonus = 0;
  if (filter.class_level && chunk.class_level === filter.class_level) bonus += 0.06;
  if (filter.chapter && chunk.chapter === filter.chapter) bonus += 0.06;
  if (filter.subject && chunk.subject === filter.subject) bonus += 0.04;
  if (filter.subjects?.includes(chunk.subject)) bonus += 0.03;
  if (filter.exam && chunk.exams.includes(filter.exam)) bonus += 0.04;
  return bonus;
}

function add(
  pool: Map<string, Candidate>,
  chunk: LectureChunk,
  rank: number,
  channel: keyof typeof WEIGHT,
  scores: { lexical?: number; semantic?: number } = {},
): void {
  const key = chunk.chunk_id;
  const existing = pool.get(key);
  const contribution = (WEIGHT[channel] * 1) / (RRF_K + rank);
  if (existing) {
    existing.fusion += contribution;
    existing.lexical = Math.max(existing.lexical, scores.lexical ?? 0);
    existing.semantic = Math.max(existing.semantic, scores.semantic ?? 0);
    existing.channels.add(channel);
    return;
  }
  pool.set(key, {
    chunk,
    fusion: contribution,
    lexical: scores.lexical ?? 0,
    semantic: scores.semantic ?? 0,
    channels: new Set([channel]),
  });
}

export function attributionFor(evidence: RetrievedEvidence): SourceAttribution {
  const c = evidence.chunk;
  return {
    chunk_id: c.chunk_id,
    source_name: c.source_name || (c.lecture_title ? `Lecture · ${c.lecture_title}` : "Course index"),
    source_url: c.source_url ?? null,
    subject: c.subject,
    class_level: c.class_level,
    board: c.board ?? "",
    chapter: c.chapter,
    topic: c.topic,
    section: c.section ?? c.subtopic ?? null,
    page_number: c.page_number ?? null,
    origin: c.origin ?? "seed",
    relevance: evidence.relevance,
  };
}

export async function retrieveHybrid(
  query: string,
  filter: RetrievalFilter = {},
): Promise<RetrievalResult> {
  const started = performance.now();
  const cacheKey = `${query.trim().toLowerCase()}|${JSON.stringify(filter)}`;
  const cached = hybridCache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true, latencyMs: Number((performance.now() - started).toFixed(1)) };
  }

  const dbSize = await approvedChunkCount();
  const tokens = expand(tokenize(query));
  const f = dbFilter(filter);

  // The seed corpus always runs: it is cheap, in-memory and keeps the app
  // answering if the database is empty or unreachable.
  const seedPromise = retrieveSeed(query, filter);

  let embeddingMs = 0;
  const counts = { lexical: 0, vector: 0, concept: 0, seed: 0 };
  const pool = new Map<string, Candidate>();

  if (dbSize > 0) {
    const embedStart = performance.now();
    const [lexical, concepts, embedding] = await Promise.all([
      lexicalCandidates(query, f, 24),
      conceptCandidates(tokens, f, 8),
      embedQuery(query),
    ]);
    embeddingMs = Number((performance.now() - embedStart).toFixed(1));

    lexical.forEach((chunk, i) => {
      counts.lexical += 1;
      add(pool, chunk, i, "lexical", { lexical: overlapScore(tokens, chunk) });
    });
    concepts.forEach((chunk, i) => {
      counts.concept += 1;
      add(pool, chunk, i, "concept", { lexical: overlapScore(tokens, chunk) });
    });

    if (embedding) {
      const vectors = await vectorCandidates(embedding, f, 12);
      vectors.forEach((hit, i) => {
        counts.vector += 1;
        add(pool, hit.chunk, i, "vector", { semantic: hit.similarity });
      });
    }
  }

  const seed = await seedPromise;
  seed.evidence.forEach((e, i) => {
    counts.seed += 1;
    add(pool, { ...e.chunk, origin: e.chunk.origin ?? "seed" }, i, "seed", {
      lexical: e.lexical,
      semantic: e.semantic,
    });
  });

  // ── Rerank ───────────────────────────────────────────────────────────────
  const rerankStart = performance.now();
  const maxFusion = Math.max(...[...pool.values()].map((c) => c.fusion), 1e-6);

  const ranked = [...pool.values()]
    .map((c) => {
      const textual = c.lexical || overlapScore(tokens, c.chunk);
      const raw =
        0.4 * (c.fusion / maxFusion) +
        0.32 * textual +
        0.28 * c.semantic +
        metadataBonus(c.chunk, filter) +
        // Agreement across independent channels is the strongest signal there is.
        (c.channels.size > 1 ? 0.08 : 0);
      return {
        chunk: c.chunk,
        level: "direct" as const,
        relevance: Number(Math.max(0, Math.min(1, raw)).toFixed(3)),
        lexical: Number(textual.toFixed(3)),
        semantic: Number(c.semantic.toFixed(3)),
      };
    })
    .filter((e) => e.relevance > 0.05)
    .sort((a, b) => b.relevance - a.relevance);

  // Fewer, better: keep the top piece plus anything close behind it.
  const best = ranked[0]?.relevance ?? 0;
  const evidence: RetrievedEvidence[] = ranked
    .filter((e, i) => i === 0 || e.relevance >= best * 0.55)
    .slice(0, 4);

  // ── Expansion channels (context, not competition) ────────────────────────
  const usedIds = evidence.map((e) => e.chunk.chunk_id);
  const prerequisiteGaps = evidence[0]?.chunk.prerequisites ?? [];
  if (evidence[0] && prerequisiteGaps.length > 0 && dbSize > 0) {
    const supporting = await prerequisiteChunks(prerequisiteGaps, usedIds, 1);
    for (const chunk of supporting) {
      evidence.push({
        chunk,
        relevance: Number((best * 0.6).toFixed(3)),
        lexical: 0,
        semantic: 0,
        level: "prerequisite",
      });
    }
  }

  const rerankMs = Number((performance.now() - rerankStart).toFixed(1));

  const groundingLevel: GroundingLevel =
    best >= GROUNDING_THRESHOLD ? "grounded" : best >= PARTIAL_THRESHOLD ? "partial" : "general";

  const result: RetrievalResult = {
    evidence,
    topRelevance: best,
    grounded: groundingLevel !== "general",
    groundingLevel,
    latencyMs: Number((performance.now() - started).toFixed(1)),
    rerankMs,
    embeddingMs,
    candidates: pool.size,
    filterUsed: dbSize > 0 ? "hybrid" : seed.filterUsed,
    prerequisiteGaps,
    cached: false,
    channels: counts,
    databaseBacked: dbSize > 0,
    attributions: evidence.map(attributionFor),
  };
  hybridCache.set(cacheKey, result);
  return result;
}

/** Continuity segments around the strongest hit, from either knowledge store. */
export async function contextNeighbours(chunk: LectureChunk): Promise<LectureChunk[]> {
  if (chunk.origin === "database") return neighbourChunks(chunk);
  const { neighboursOf } = await import("@/lib/rag/retriever.server");
  return neighboursOf(chunk.chunk_id);
}
