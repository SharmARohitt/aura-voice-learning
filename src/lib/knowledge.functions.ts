import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { knowledgeReadClient } from "@/lib/knowledge/db.server";

/**
 * Knowledge-engine control surface.
 *
 * Reads used by the classroom diagnostics are public; everything that changes
 * the knowledge base runs as the signed-in user, where the editor-role RLS
 * policies decide what is allowed.
 */

// ── Public: how big and how healthy is the knowledge base ──────────────────

export const knowledgeOverview = createServerFn({ method: "GET" }).handler(async () => {
  const db = knowledgeReadClient();
  if (!db) {
    return { available: false, chunks: 0, documents: 0, sources: 0, subjects: [] as string[] };
  }
  const [chunks, documents, sources, subjectRows] = await Promise.all([
    db.from("knowledge_chunks").select("id", { count: "exact", head: true }).eq("approval_status", "approved"),
    db.from("documents").select("id", { count: "exact", head: true }),
    db.from("sources").select("id", { count: "exact", head: true }),
    db.from("knowledge_chunks").select("subject").eq("approval_status", "approved").limit(500),
  ]);

  const subjects = [...new Set((subjectRows.data ?? []).map((r) => r.subject).filter(Boolean))].sort();
  return {
    available: true,
    chunks: chunks.count ?? 0,
    documents: documents.count ?? 0,
    sources: sources.count ?? 0,
    subjects,
  };
});

// ── Editor identity ────────────────────────────────────────────────────────

export const myKnowledgeRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
    return { roles, editor: roles.includes("admin") || roles.includes("editor") };
  });

/**
 * Bootstrap: the first signed-in person becomes the knowledge admin. Once an
 * admin exists this does nothing, so it cannot be used to escalate.
 */
export const claimKnowledgeAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) return { granted: false, reason: "An administrator already exists." };

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (error) return { granted: false, reason: error.message };
    return { granted: true, reason: null };
  });

// ── Ingestion ──────────────────────────────────────────────────────────────

const ImportInput = z.object({
  sourceName: z.string().min(2).max(120),
  sourceType: z.enum(["textbook", "notes", "lecture_transcript", "question_bank", "web"]),
  url: z.string().url().max(500).optional(),
  title: z.string().max(180).optional(),
  rawText: z.string().max(600_000).optional(),
  publisher: z.string().max(120).optional(),
  license: z.string().max(80).optional(),
  subject: z.string().max(60).optional(),
  class_level: z.string().max(40).optional(),
  board: z.string().max(40).optional(),
  chapter: z.string().max(120).optional(),
  exams: z.array(z.string().max(24)).max(6).default([]),
});

export const importKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImportInput.parse(input))
  .handler(async ({ data, context }) => {
    if (!data.url && !data.rawText) throw new Error("Provide a link or paste the material.");
    const { runIngestion } = await import("@/lib/ingestion/pipeline.server");
    return runIngestion(context.supabase, context.userId, {
      sourceName: data.sourceName,
      sourceType: data.sourceType,
      url: data.url,
      title: data.title,
      rawText: data.rawText,
      publisher: data.publisher,
      license: data.license,
      hints: {
        ...(data.subject ? { subject: data.subject } : {}),
        ...(data.class_level ? { class_level: data.class_level } : {}),
        ...(data.board ? { board: data.board } : {}),
        ...(data.chapter ? { chapter: data.chapter } : {}),
        exams: data.exams,
      },
    });
  });

export const seedKnowledgeBase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { seedCorpusIntoDatabase } = await import("@/lib/ingestion/seed.server");
    return seedCorpusIntoDatabase(context.supabase);
  });

export const rebuildEmbeddings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ limit: z.number().min(1).max(200).default(64) }).parse(input))
  .handler(async ({ data, context }) => {
    const { backfillEmbeddings } = await import("@/lib/ingestion/pipeline.server");
    return backfillEmbeddings(context.supabase, data.limit);
  });

// ── Jobs ───────────────────────────────────────────────────────────────────

export const listIngestionJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ingestion_jobs")
      .select("id, job_type, status, stage, input_title, input_url, chunks_created, documents_created, duplicates_skipped, embeddings_created, embedding_failures, duration_ms, error, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ── Chunk review + editing ─────────────────────────────────────────────────

const ListInput = z.object({
  search: z.string().max(120).default(""),
  subject: z.string().max(60).default(""),
  status: z.enum(["all", "approved", "pending", "rejected"]).default("all"),
  limit: z.number().min(1).max(100).default(25),
});

export const listKnowledgeChunks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListInput.parse(input))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("knowledge_chunks")
      .select(
        "id, title, content, subject, class_level, board, chapter, topic, section, page_number, concepts, difficulty, confidence, approval_status, source_name, source_url, embedding_version, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(data.limit);

    if (data.subject) query = query.eq("subject", data.subject);
    if (data.status !== "all") query = query.eq("approval_status", data.status);
    if (data.search) query = query.ilike("content", `%${data.search.replace(/[%_]/g, "")}%`);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  content: z.string().min(20).max(20_000).optional(),
  subject: z.string().max(60).optional(),
  class_level: z.string().max(40).optional(),
  board: z.string().max(40).optional(),
  chapter: z.string().max(120).optional(),
  topic: z.string().max(120).optional(),
  concepts: z.array(z.string().max(60)).max(12).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  approval_status: z.enum(["approved", "pending", "rejected"]).optional(),
});

export const updateKnowledgeChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: before } = await context.supabase
      .from("knowledge_chunks")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!before) throw new Error("That piece of knowledge no longer exists.");

    const updates: Record<string, unknown> = { ...patch };

    // Editing the text invalidates the vector: re-embed immediately so search
    // can never return a stale match for edited content.
    if (patch.content && patch.content !== before.content) {
      const { contentHash } = await import("@/lib/knowledge/db.server");
      const { embeddingProvider } = await import("@/lib/embeddings/provider.server");
      updates.content_hash = contentHash(patch.content);
      try {
        const provider = embeddingProvider();
        const [vector] = await provider.embed([patch.content]);
        if (vector) {
          updates.embedding = JSON.stringify(vector);
          updates.embedding_version = provider.version;
          updates.embedded_at = new Date().toISOString();
        }
      } catch (error) {
        console.error("[knowledge] re-embed after edit failed", error);
        updates.embedding = null;
        updates.embedding_version = null;
      }
    }

    const { error } = await context.supabase.from("knowledge_chunks").update(updates).eq("id", id);
    if (error) throw new Error(error.message);

    await context.supabase.from("knowledge_edits").insert({
      chunk_id: id,
      action: patch.approval_status ? `status:${patch.approval_status}` : "edit",
      field: Object.keys(patch).join(","),
      before_value: before as never,
      after_value: patch as never,
      edited_by: context.userId,
    });

    const { invalidateKnowledgeStats } = await import("@/lib/knowledge/repository.server");
    invalidateKnowledgeStats();
    return { ok: true };
  });

export const deleteKnowledgeChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: before } = await context.supabase
      .from("knowledge_chunks")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("knowledge_chunks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("knowledge_edits").insert({
      action: "delete",
      before_value: (before ?? null) as never,
      edited_by: context.userId,
    });
    const { invalidateKnowledgeStats } = await import("@/lib/knowledge/repository.server");
    invalidateKnowledgeStats();
    return { ok: true };
  });
