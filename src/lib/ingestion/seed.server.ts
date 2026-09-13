import { embeddingProvider } from "@/lib/embeddings/provider.server";
import { CORPUS } from "@/lib/knowledge/corpus";
import { contentHash, type KnowledgeDb } from "@/lib/knowledge/db.server";
import { invalidateKnowledgeStats } from "@/lib/knowledge/repository.server";

/**
 * Migrate the bundled seed corpus into the knowledge database.
 *
 * Idempotent: content hashes make a second run a no-op. The in-memory corpus
 * stays in the codebase as the offline fallback, but once this has run the
 * database is the primary store.
 */

const SOURCE_NAME = "Bundled course index";
const BATCH = 24;

export async function seedCorpusIntoDatabase(db: KnowledgeDb): Promise<{
  inserted: number;
  skipped: number;
  embedded: number;
  total: number;
}> {
  const { data: existingSource } = await db
    .from("sources")
    .select("id")
    .eq("name", SOURCE_NAME)
    .maybeSingle();

  let sourceId = existingSource?.id ?? null;
  if (!sourceId) {
    const { data, error } = await db
      .from("sources")
      .insert({
        name: SOURCE_NAME,
        source_type: "lecture_transcript",
        publisher: "Aura",
        license: "internal",
        crawl_status: "done",
        notes: "Original in-app corpus, migrated into the knowledge database.",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    sourceId = data.id;
  }

  const { data: document } = await db
    .from("documents")
    .select("id")
    .eq("source_id", sourceId)
    .eq("title", SOURCE_NAME)
    .maybeSingle();

  let documentId = document?.id ?? null;
  if (!documentId) {
    const { data, error } = await db
      .from("documents")
      .insert({
        source_id: sourceId,
        title: SOURCE_NAME,
        source_type: "lecture_transcript",
        approval_status: "approved",
        content_hash: contentHash(`seed:${CORPUS.length}`),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    documentId = data.id;
  }

  const provider = embeddingProvider();
  let inserted = 0;
  let skipped = 0;
  let embedded = 0;

  for (let i = 0; i < CORPUS.length; i += BATCH) {
    const batch = CORPUS.slice(i, i + BATCH);
    const hashes = batch.map((c) => contentHash(c.text));
    const { data: seen } = await db
      .from("knowledge_chunks")
      .select("content_hash")
      .in("content_hash", hashes);
    const known = new Set((seen ?? []).map((r) => r.content_hash));

    const fresh = batch.filter((c) => {
      if (known.has(contentHash(c.text))) {
        skipped += 1;
        return false;
      }
      return true;
    });
    if (fresh.length === 0) continue;

    let vectors: number[][] = [];
    try {
      vectors = await provider.embed(fresh.map((c) => c.text));
      embedded += vectors.length;
    } catch (error) {
      console.error("[seed] embedding failed for batch", error);
    }

    const rows = fresh.map((c, k) => ({
      source_id: sourceId,
      document_id: documentId,
      external_id: c.chunk_id,
      title: c.lecture_title,
      content: c.text,
      content_hash: contentHash(c.text),
      source_name: SOURCE_NAME,
      source_type: c.source_type,
      source_url: c.source_url ?? null,
      subject: c.subject,
      class_level: c.class_level,
      chapter: c.chapter,
      topic: c.topic,
      subtopic: c.subtopic ?? null,
      concepts: c.concepts.map((x) => x.toLowerCase()),
      keywords: (c.keywords ?? []).map((x) => x.toLowerCase()),
      prerequisites: c.prerequisites.map((x) => x.toLowerCase()),
      difficulty: c.difficulty,
      language: c.language,
      exams: c.exams,
      course_id: c.course_id,
      lecture_id: c.lecture_id,
      lecture_title: c.lecture_title,
      lecture_number: c.lecture_number,
      teacher: c.teacher,
      timestamp_start: c.timestamp_start,
      timestamp_end: c.timestamp_end,
      approval_status: c.approval_status,
      confidence: 0.85,
      embedding: vectors[k] ? (JSON.stringify(vectors[k]) as unknown as string) : null,
      embedding_version: vectors[k] ? provider.version : null,
      embedded_at: vectors[k] ? new Date().toISOString() : null,
    }));

    const { error, count } = await db
      .from("knowledge_chunks")
      .insert(rows, { count: "exact" });
    if (error) throw new Error(error.message);
    inserted += count ?? rows.length;
  }

  invalidateKnowledgeStats();
  return { inserted, skipped, embedded, total: CORPUS.length };
}
