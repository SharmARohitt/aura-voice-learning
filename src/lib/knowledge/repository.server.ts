import { knowledgeReadClient, type ChunkRow } from "@/lib/knowledge/db.server";
import { TtlCache } from "@/lib/rag/index.server";
import type { LectureChunk } from "@/lib/types";

/**
 * Database-backed knowledge repository.
 *
 * Nothing here loads the knowledge base into memory. Every call is an indexed,
 * limited query, so the same code path serves 18 rows or a million.
 */

export interface DbFilter {
  subject?: string | null;
  class_level?: string | null;
  chapter?: string | null;
  exam?: string | null;
}

export function rowToChunk(row: ChunkRow): LectureChunk {
  return {
    chunk_id: row.external_id ?? row.id,
    record_id: row.id,
    lecture_id: row.lecture_id ?? row.document_id ?? row.id,
    lecture_title: row.lecture_title ?? row.title ?? "",
    lecture_number: row.lecture_number ?? 0,
    course_id: row.course_id ?? "",
    batch_id: "",
    class_level: row.class_level,
    exams: row.exams ?? [],
    subject: row.subject,
    chapter: row.chapter,
    topic: row.topic,
    teacher: row.teacher ?? "",
    timestamp_start: row.timestamp_start ?? "",
    timestamp_end: row.timestamp_end ?? "",
    text: row.content,
    concepts: row.concepts ?? [],
    difficulty: (row.difficulty as LectureChunk["difficulty"]) ?? "medium",
    language: (row.language as LectureChunk["language"]) ?? "en",
    prerequisites: row.prerequisites ?? [],
    source_type: (row.source_type as LectureChunk["source_type"]) ?? "lecture_transcript",
    approval_status: (row.approval_status as LectureChunk["approval_status"]) ?? "approved",
    subtopic: row.subtopic ?? undefined,
    keywords: row.keywords ?? [],
    source_url: row.source_url ?? undefined,
    document_id: row.document_id,
    source_id: row.source_id,
    source_name: row.source_name || "Knowledge base",
    board: row.board ?? "",
    section: row.section,
    page_number: row.page_number,
    subtopic_concept: row.concept,
    learning_objective: row.learning_objective,
    formulas: row.formulas ?? [],
    examples: row.examples ?? [],
    confidence: Number(row.confidence ?? 0.8),
    origin: "database",
  } as LectureChunk;
}

const availability = new TtlCache<number>(60_000, 4);

/** Approved chunk count, cached — also doubles as the "is the DB live?" probe. */
export async function approvedChunkCount(): Promise<number> {
  const hit = availability.get("count");
  if (hit !== undefined) return hit;
  const db = knowledgeReadClient();
  if (!db) return 0;
  const { count, error } = await db
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true })
    .eq("approval_status", "approved");
  if (error) {
    console.error("[knowledge] count failed", error.message);
    return 0;
  }
  const value = count ?? 0;
  availability.set("count", value);
  return value;
}

export function invalidateKnowledgeStats(): void {
  availability.set("count", -1);
}

/** Only send the filters that are actually set; the SQL treats them as optional. */
function rpcFilter(filter: DbFilter) {
  return {
    ...(filter.subject ? { filter_subject: filter.subject } : {}),
    ...(filter.class_level ? { filter_class: filter.class_level } : {}),
    ...(filter.chapter ? { filter_chapter: filter.chapter } : {}),
    ...(filter.exam ? { filter_exam: filter.exam } : {}),
  };
}

/** Lexical candidate pull — full-text index first, trigram as the safety net. */
export async function lexicalCandidates(
  query: string,
  filter: DbFilter,
  limit = 24,
): Promise<LectureChunk[]> {
  const db = knowledgeReadClient();
  if (!db) return [];
  const { data, error } = await db.rpc("search_knowledge_chunks", {
    query_text: query,
    match_count: limit,
    ...rpcFilter(filter),
  });
  if (error) {
    console.error("[knowledge] lexical search failed", error.message);
    return [];
  }
  return ((data ?? []) as ChunkRow[]).map(rowToChunk);
}

/** Vector candidate pull, executed inside the database. */
export async function vectorCandidates(
  embedding: number[],
  filter: DbFilter,
  limit = 12,
): Promise<{ chunk: LectureChunk; similarity: number }[]> {
  const db = knowledgeReadClient();
  if (!db) return [];
  const { data, error } = await db.rpc("match_knowledge_chunks", {
    query_embedding: embedding as unknown as string,
    match_count: limit,
    ...rpcFilter(filter),
  });
  if (error) {
    console.error("[knowledge] vector search failed", error.message);
    return [];
  }
  const hits = (data ?? []) as { id: string; similarity: number }[];
  if (hits.length === 0) return [];
  const rows = await chunksByIds(hits.map((h) => h.id));
  const byId = new Map(rows.map((r) => [r.record_id, r]));
  return hits
    .map((h) => ({ chunk: byId.get(h.id), similarity: h.similarity }))
    .filter((h): h is { chunk: LectureChunk; similarity: number } => Boolean(h.chunk));
}

export async function chunksByIds(ids: string[]): Promise<LectureChunk[]> {
  const db = knowledgeReadClient();
  if (!db || ids.length === 0) return [];
  const { data, error } = await db.from("knowledge_chunks").select("*").in("id", ids);
  if (error) {
    console.error("[knowledge] fetch by id failed", error.message);
    return [];
  }
  return (data as ChunkRow[]).map(rowToChunk);
}

/**
 * Concept-graph channel: resolve aliases (including Hindi / Hinglish terms) to
 * canonical concept names, then pull chunks tagged with them.
 */
export async function conceptCandidates(
  terms: string[],
  filter: DbFilter,
  limit = 8,
): Promise<LectureChunk[]> {
  const db = knowledgeReadClient();
  if (!db || terms.length === 0) return [];

  const canonical = new Set<string>();
  for (const term of terms.slice(0, 8)) canonical.add(term.toLowerCase());

  const { data: conceptRows } = await db
    .from("concepts")
    .select("name, aliases, hindi_terms, hinglish_terms")
    .or(terms.slice(0, 6).map((t) => `name.ilike.%${t.replace(/[%,]/g, "")}%`).join(","))
    .limit(12);
  for (const row of conceptRows ?? []) canonical.add(row.name.toLowerCase());

  let query = db
    .from("knowledge_chunks")
    .select("*")
    .eq("approval_status", "approved")
    .overlaps("concepts", [...canonical]);
  if (filter.subject) query = query.eq("subject", filter.subject);
  if (filter.class_level) query = query.eq("class_level", filter.class_level);
  if (filter.chapter) query = query.eq("chapter", filter.chapter);
  if (filter.exam) query = query.contains("exams", [filter.exam]);

  const { data, error } = await query.limit(limit).returns<ChunkRow[]>();

  if (error) {
    console.error("[knowledge] concept search failed", error.message);
    return [];
  }
  return (data ?? []).map(rowToChunk);
}

/** Adjacent material in the same document — the continuity channel. */
export async function neighbourChunks(chunk: LectureChunk): Promise<LectureChunk[]> {
  const db = knowledgeReadClient();
  if (!db || !chunk.document_id) return [];
  const { data, error } = await db
    .from("knowledge_chunks")
    .select("*")
    .eq("document_id", chunk.document_id)
    .eq("approval_status", "approved")
    .neq("id", chunk.record_id ?? "")
    .order("page_number", { ascending: true, nullsFirst: true })
    .limit(2);
  if (error) return [];
  return (data as ChunkRow[]).map(rowToChunk);
}

/** Prerequisite channel: follow the concept graph one hop back. */
export async function prerequisiteChunks(
  concepts: string[],
  excludeIds: string[],
  limit = 2,
): Promise<LectureChunk[]> {
  const db = knowledgeReadClient();
  if (!db || concepts.length === 0) return [];
  const { data, error } = await db
    .from("knowledge_chunks")
    .select("*")
    .eq("approval_status", "approved")
    .overlaps("concepts", concepts.map((c) => c.toLowerCase()))
    .limit(limit + excludeIds.length);
  if (error) return [];
  return (data as ChunkRow[])
    .map(rowToChunk)
    .filter((c) => !excludeIds.includes(c.chunk_id))
    .slice(0, limit);
}
