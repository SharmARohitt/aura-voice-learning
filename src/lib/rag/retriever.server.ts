import { CORPUS } from "@/lib/knowledge/corpus";
import type { LectureChunk, RetrievalResult, RetrievedEvidence } from "@/lib/types";

/**
 * Hybrid retrieval over the approved educational index.
 *
 * Channels: BM25-style lexical + concept-space semantic, fused with reciprocal
 * rank fusion and reranked. Metadata-aware (class, exam, subject, chapter),
 * multi-level (direct + prerequisite evidence) and prerequisite-aware.
 *
 * The repository interface is the swap point for pgvector / Qdrant / Chroma —
 * nothing above this file knows where the vectors live.
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
  size(): number;
}

const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","of","to","in","on","for","and","or","kya","hai","ka",
  "ki","ke","se","ko","mein","me","na","nahi","par","aur","yeh","woh","bata","batao","samjhao",
  "samajh","please","my","i","it","this","that","do","does","can","you","explain","kaise","kyun",
  "kyu","what","why","how","when","which","with","about","tell","mujhe","sir","maam",
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
  heat: ["heat", "thermodynamics"],
  trigonometry: ["trigonometry", "sin", "cos", "identities"],
  gati: ["motion", "newton", "force"],
  bal: ["force", "newton"],
  urja: ["energy", "work"],
  prakash: ["light", "photosynthesis"],
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
  const docTokens = tokenize(`${chunk.text} ${chunk.concepts.join(" ")} ${chunk.topic} ${chunk.chapter}`);
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
  const conceptTokens = new Set(tokenize(`${chunk.concepts.join(" ")} ${chunk.topic}`));
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

  size(): number {
    return this.corpus.length;
  }

  private pool(filter: RetrievalFilter): LectureChunk[] {
    return this.corpus.filter(
      (c) =>
        c.approval_status === "approved" &&
        (!filter.course_id || c.course_id === filter.course_id) &&
        (!filter.subject || c.subject === filter.subject) &&
        (!filter.subjects?.length || filter.subjects.includes(c.subject)) &&
        (!filter.chapter || c.chapter === filter.chapter) &&
        (!filter.class_level || c.class_level === filter.class_level) &&
        (!filter.exam || c.exams.includes(filter.exam)),
    );
  }

  async byConcept(concepts: string[], excludeIds: string[], limit = 2): Promise<LectureChunk[]> {
    const wanted = new Set(concepts.map((c) => c.toLowerCase()));
    if (wanted.size === 0) return [];
    return this.corpus
      .filter(
        (c) =>
          c.approval_status === "approved" &&
          !excludeIds.includes(c.chunk_id) &&
          [...c.concepts, c.topic].some((concept) =>
            [...wanted].some(
              (w) =>
                concept.toLowerCase().includes(w) || w.includes(concept.toLowerCase()),
            ),
          ),
      )
      .slice(0, limit);
  }

  async search(query: string, filter: RetrievalFilter, limit = 4): Promise<RetrievedEvidence[]> {
    const pool = this.pool(filter);
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
        level: "direct",
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

const repository: KnowledgeRepository = new InMemoryKnowledgeRepository();

export function knowledgeSize(): number {
  return repository.size();
}

/**
 * Retrieval cascade: strict metadata filter first, then progressively widen so
 * a student is never blocked by their own onboarding answers.
 */
export async function retrieve(
  query: string,
  filter: RetrievalFilter = {},
): Promise<RetrievalResult> {
  const started = Date.now();

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

  const rerankStart = Date.now();
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
  const rerankMs = Date.now() - rerankStart;

  return {
    evidence,
    topRelevance,
    grounded: topRelevance >= GROUNDING_THRESHOLD,
    latencyMs: Date.now() - started,
    rerankMs,
    candidates: repository.size(),
    filterUsed,
    prerequisiteGaps,
  };
}
