import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type { Database } from "@/integrations/supabase/types";

/**
 * Server-only Supabase access for the knowledge engine.
 *
 * Reads go through the publishable (anon) client: approved knowledge is
 * publicly readable by policy, so a student query never needs elevated
 * credentials. Writes always travel on the caller's own authenticated client,
 * where the editor-role policies apply.
 */

export type KnowledgeDb = SupabaseClient<Database>;

let cached: KnowledgeDb | null = null;

/** Public read client. Returns null when the backend is not configured. */
export function knowledgeReadClient(): KnowledgeDb | null {
  if (cached) return cached;
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  cached = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text.trim().toLowerCase()).digest("hex");
}

export type ChunkRow = Database["public"]["Tables"]["knowledge_chunks"]["Row"];
export type ChunkInsert = Database["public"]["Tables"]["knowledge_chunks"]["Insert"];
export type SourceRow = Database["public"]["Tables"]["sources"]["Row"];
export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
export type JobRow = Database["public"]["Tables"]["ingestion_jobs"]["Row"];
