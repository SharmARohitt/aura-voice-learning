import { chunkBlocks, type DraftChunk } from "@/lib/ingestion/chunk.server";
import { enrichChunks, QUALITY_GATE, structurallyWeak } from "@/lib/ingestion/enrich.server";
import { extract, guessTitle } from "@/lib/ingestion/extract.server";
import { politeFetch, robotsAllows } from "@/lib/ingestion/fetch.server";
import { embeddingProvider } from "@/lib/embeddings/provider.server";
import { contentHash, type KnowledgeDb } from "@/lib/knowledge/db.server";
import { invalidateKnowledgeStats } from "@/lib/knowledge/repository.server";

/**
 * The ingestion pipeline, end to end.
 *
 *   fetch → extract → structure → chunk → enrich → quality gate → dedupe
 *         → embed → store → verify
 *
 * Every stage records progress on the job row, so a long import is observable
 * while it runs and diagnosable afterwards. Nothing is silently dropped: every
 * rejection has a reason attached to the job log.
 */

export interface IngestionInput {
  sourceName: string;
  sourceType: "textbook" | "notes" | "lecture_transcript" | "question_bank" | "web";
  url?: string | undefined;
  title?: string | undefined;
  rawText?: string | undefined;
  publisher?: string | undefined;
  license?: string | undefined;
  hints: {
    subject?: string | undefined;
    class_level?: string | undefined;
    board?: string | undefined;
    chapter?: string | undefined;
    exams?: string[] | undefined;
  };
}

export interface IngestionSummary {
  job_id: string;
  status: "succeeded" | "failed";
  documents_created: number;
  chunks_created: number;
  duplicates_skipped: number;
  rejected: number;
  embeddings_created: number;
  embedding_failures: number;
  duration_ms: number;
  log: { stage: string; detail: string }[];
  error: string | null;
}

/** Batch size for embedding + insert, keeps memory flat on large documents. */
const WRITE_BATCH = 32;

export async function runIngestion(
  db: KnowledgeDb,
  userId: string,
  input: IngestionInput,
): Promise<IngestionSummary> {
  const started = Date.now();
  const log: { stage: string; detail: string }[] = [];
  const note = (stage: string, detail: string) => {
    log.push({ stage, detail });
  };

  const { data: job, error: jobError } = await db
    .from("ingestion_jobs")
    .insert({
      job_type: input.url ? "url" : "paste",
      status: "running",
      stage: "fetch",
      input_url: input.url ?? null,
      input_title: input.title ?? input.sourceName,
      created_by: userId,
      started_at: new Date().toISOString(),
      payload: input as never,
    })
    .select("id")
    .single();

  if (jobError || !job) throw new Error(jobError?.message ?? "Could not start the import job.");

  // Persisted counters map 1:1 onto the job row; `rejected` is reported to the
  // caller and the log but has no column of its own.
  const counters = {
    documents_created: 0,
    chunks_created: 0,
    duplicates_skipped: 0,
    embeddings_created: 0,
    embedding_failures: 0,
  };
  let rejected = 0;

  const finish = async (status: "succeeded" | "failed", error: string | null): Promise<IngestionSummary> => {
    const duration = Date.now() - started;
    await db
      .from("ingestion_jobs")
      .update({
        status,
        stage: status === "succeeded" ? "done" : "failed",
        finished_at: new Date().toISOString(),
        duration_ms: duration,
        error,
        log: log as unknown as never,
        ...counters,
      })
      .eq("id", job.id);

    await db.from("ingestion_metrics").insert({
      metric: "ingestion.run",
      unit: "ms",
      value: duration,
      detail: { job_id: job.id, status, rejected, ...counters } as unknown as never,
    });

    invalidateKnowledgeStats();
    return { job_id: job.id, status, duration_ms: duration, log, error, rejected, ...counters };
  };

  const stage = async (name: string) => {
    await db.from("ingestion_jobs").update({ stage: name }).eq("id", job.id);
  };

  try {
    // ── 1. Source ──────────────────────────────────────────────────────────
    await stage("source");
    const sourceId = await upsertSource(db, input);

    // ── 2. Fetch / accept content ──────────────────────────────────────────
    await stage("fetch");
    let body = input.rawText ?? "";
    let contentType = "text/plain";
    if (input.url) {
      const allowed = await robotsAllows(input.url);
      if (!allowed) throw new Error("That site does not permit automated access to this page.");
      const page = await politeFetch(input.url);
      body = page.body;
      contentType = page.contentType;
      note("fetch", `Fetched ${page.body.length} characters (HTTP ${page.status}).`);
    } else {
      note("fetch", `Accepted ${body.length} pasted characters.`);
    }
    if (body.trim().length < 200) throw new Error("There was not enough readable content to import.");

    // ── 3. Extract + structure ─────────────────────────────────────────────
    await stage("extract");
    const blocks = extract(body, contentType);
    note("extract", `${blocks.length} structural blocks detected.`);

    // ── 4. Document row ────────────────────────────────────────────────────
    const title = input.title || guessTitle(body, blocks, input.sourceName);
    const documentText = blocks.map((b) => b.text).join("\n\n");
    const docHash = contentHash(documentText);

    const { data: existingDoc } = await db
      .from("documents")
      .select("id")
      .eq("content_hash", docHash)
      .maybeSingle();

    let documentId = existingDoc?.id ?? null;
    if (!documentId) {
      const { data: created, error } = await db
        .from("documents")
        .insert({
          source_id: sourceId,
          title,
          content: documentText.slice(0, 400_000),
          content_hash: docHash,
          source_type: input.sourceType,
          source_url: input.url ?? null,
          subject: input.hints.subject ?? "",
          class_level: input.hints.class_level ?? "",
          board: input.hints.board ?? "",
          chapter: input.hints.chapter ?? "",
          exams: input.hints.exams ?? [],
          approval_status: "approved",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      documentId = created.id;
      counters.documents_created = 1;
    } else {
      note("document", "This document was already imported — refreshing its chunks.");
    }

    // ── 5. Chunk ───────────────────────────────────────────────────────────
    await stage("chunk");
    const drafts = chunkBlocks(blocks);
    note("chunk", `${drafts.length} candidate chunks.`);
    if (drafts.length === 0) throw new Error("The content could not be split into teachable pieces.");

    // ── 6. Enrich + gate + embed + store, in batches ───────────────────────
    const provider = embeddingProvider();
    for (let i = 0; i < drafts.length; i += WRITE_BATCH) {
      const batch = drafts.slice(i, i + WRITE_BATCH);
      await stage(`enrich ${i + 1}-${i + batch.length} of ${drafts.length}`);

      const keep: DraftChunk[] = [];
      for (const draft of batch) {
        const weak = structurallyWeak(draft);
        if (weak) {
          rejected += 1;
          note("gate", weak);
          continue;
        }
        keep.push(draft);
      }
      if (keep.length === 0) continue;

      const metadata = await enrichChunks(keep, input.hints);
      const accepted = keep
        .flatMap((draft, k) => {
          const meta = metadata[k];
          if (!meta) return [];
          if (meta.quality < QUALITY_GATE) {
            rejected += 1;
            note("gate", meta.reject_reason ?? "Below the quality threshold.");
            return [];
          }
          return [{ draft, meta }];
        });
      if (accepted.length === 0) continue;

      // Dedupe against what is already stored.
      const hashes = accepted.map(({ draft }) => contentHash(draft.content));
      const { data: seen } = await db
        .from("knowledge_chunks")
        .select("content_hash")
        .in("content_hash", hashes);
      const known = new Set((seen ?? []).map((r) => r.content_hash));

      const fresh = accepted.filter(({ draft }) => {
        const hash = contentHash(draft.content);
        if (known.has(hash)) {
          counters.duplicates_skipped += 1;
          return false;
        }
        known.add(hash);
        return true;
      });
      if (fresh.length === 0) continue;

      await stage(`embed ${i + 1}-${i + batch.length} of ${drafts.length}`);
      let vectors: number[][] = [];
      try {
        vectors = await provider.embed(fresh.map(({ draft }) => draft.content));
        counters.embeddings_created += vectors.length;
      } catch (error) {
        counters.embedding_failures += fresh.length;
        note("embed", `Embedding failed for this batch; chunks stored for later: ${(error as Error).message}`);
      }

      const rows = fresh.map(({ draft, meta }, k) => ({
        source_id: sourceId,
        document_id: documentId,
        title,
        content: draft.content,
        content_hash: contentHash(draft.content),
        section: draft.section || null,
        page_number: draft.page,
        formulas: draft.formulas,
        examples: draft.examples,
        source_name: input.sourceName,
        source_type: input.sourceType,
        source_url: input.url ?? null,
        subject: meta.subject,
        class_level: meta.class_level,
        board: meta.board,
        chapter: meta.chapter,
        topic: meta.topic,
        concept: meta.concept,
        concepts: meta.concepts,
        keywords: meta.keywords,
        prerequisites: meta.prerequisites,
        difficulty: meta.difficulty,
        language: meta.language,
        exams: meta.exams,
        learning_objective: meta.learning_objective,
        confidence: meta.quality,
        approval_status: "approved",
        embedding: vectors[k] ? (JSON.stringify(vectors[k]) as unknown as string) : null,
        embedding_version: vectors[k] ? provider.version : null,
        embedded_at: vectors[k] ? new Date().toISOString() : null,
      }));

      await stage(`store ${i + 1}-${i + batch.length} of ${drafts.length}`);
      const { error: insertError, count } = await db
        .from("knowledge_chunks")
        .insert(rows, { count: "exact" });
      if (insertError) {
        note("store", insertError.message);
        throw new Error(insertError.message);
      }
      counters.chunks_created += count ?? rows.length;

      await db
        .from("ingestion_jobs")
        .update({ ...counters })
        .eq("id", job.id);
    }

    // ── 7. Verify ──────────────────────────────────────────────────────────
    await stage("verify");
    const { count: stored } = await db
      .from("knowledge_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId);
    note("verify", `${stored ?? 0} chunks now stored for this document.`);

    await db
      .from("sources")
      .update({
        last_crawled_at: new Date().toISOString(),
        crawl_status: "done",
        document_count: counters.documents_created,
        chunk_count: counters.chunks_created,
      })
      .eq("id", sourceId);

    return finish("succeeded", null);
  } catch (error) {
    const message = (error as Error).message || "Import failed.";
    note("error", message);
    return finish("failed", message);
  }
}

async function upsertSource(db: KnowledgeDb, input: IngestionInput): Promise<string> {
  const { data: existing } = await db
    .from("sources")
    .select("id")
    .eq("name", input.sourceName)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await db
    .from("sources")
    .insert({
      name: input.sourceName,
      source_type: input.sourceType,
      url: input.url ?? null,
      publisher: input.publisher ?? "",
      license: input.license ?? "unspecified",
      robots_allowed: input.url ? await robotsAllows(input.url) : null,
      crawl_status: "running",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/**
 * Embed chunks that are missing a vector or were embedded with an older model
 * version. Runs in bounded batches so it can be called repeatedly.
 */
export async function backfillEmbeddings(db: KnowledgeDb, limit = 64): Promise<{
  processed: number;
  failed: number;
  remaining: number;
}> {
  const provider = embeddingProvider();
  const { data, error } = await db
    .from("knowledge_chunks")
    .select("id, content, embedding_version")
    .or(`embedding_version.is.null,embedding_version.neq.${provider.version}`)
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += WRITE_BATCH) {
    const batch = rows.slice(i, i + WRITE_BATCH);
    try {
      const vectors = await provider.embed(batch.map((r) => r.content));
      for (const [k, row] of batch.entries()) {
        const vector = vectors[k];
        if (!vector) continue;
        const { error: updateError } = await db
          .from("knowledge_chunks")
          .update({
            embedding: JSON.stringify(vector) as unknown as string,
            embedding_version: provider.version,
            embedded_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (updateError) failed += 1;
        else processed += 1;
      }
    } catch (error) {
      console.error("[ingestion] backfill batch failed", error);
      failed += batch.length;
    }
  }

  const { count } = await db
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true })
    .or(`embedding_version.is.null,embedding_version.neq.${provider.version}`);

  invalidateKnowledgeStats();
  return { processed, failed, remaining: count ?? 0 };
}
