import { chatJson } from "@/lib/ai-gateway.server";
import type { DraftChunk } from "@/lib/ingestion/chunk.server";

/**
 * Metadata enrichment and the quality gate.
 *
 * Each chunk is classified once at ingestion time — subject, class, chapter,
 * topic, concepts, prerequisites, difficulty, exam relevance, language — so a
 * student's query never pays for classification. Low-quality fragments
 * (navigation text, exercise stubs, boilerplate) are rejected here rather than
 * polluting retrieval forever.
 */

export interface ChunkMetadata {
  subject: string;
  class_level: string;
  board: string;
  chapter: string;
  topic: string;
  concept: string | null;
  concepts: string[];
  keywords: string[];
  prerequisites: string[];
  difficulty: "easy" | "medium" | "hard";
  language: "en" | "hi" | "hinglish";
  exams: string[];
  learning_objective: string | null;
  /** 0-1; below the gate the chunk is dropped. */
  quality: number;
  /** Filled in when the model judges the chunk not worth indexing. */
  reject_reason: string | null;
}

export const QUALITY_GATE = 0.45;

const SHAPE = `{"items":[{"index":number,"subject":string,"class_level":string,"board":string,"chapter":string,"topic":string,"concept":string|null,"concepts":string[],"keywords":string[],"prerequisites":string[],"difficulty":"easy"|"medium"|"hard","language":"en"|"hi"|"hinglish","exams":string[],"learning_objective":string|null,"quality":number,"reject_reason":string|null}]}`;

/** Cheap structural rejection before spending a model call. */
export function structurallyWeak(chunk: DraftChunk): string | null {
  const text = chunk.content.trim();
  if (text.length < 200) return "Too short to teach anything on its own.";
  const words = text.split(/\s+/);
  if (words.length < 35) return "Not enough content.";
  const linkish = (text.match(/\b(home|login|subscribe|cookie|privacy|next page|previous)\b/gi) ?? []).length;
  if (linkish > 4) return "Looks like site navigation rather than study material.";
  const unique = new Set(words.map((w) => w.toLowerCase()));
  if (unique.size / words.length < 0.35) return "Highly repetitive text.";
  return null;
}

function fallbackMetadata(hint: Partial<ChunkMetadata>): ChunkMetadata {
  return {
    subject: hint.subject ?? "General",
    class_level: hint.class_level ?? "",
    board: hint.board ?? "",
    chapter: hint.chapter ?? "",
    topic: hint.topic ?? "",
    concept: null,
    concepts: [],
    keywords: [],
    prerequisites: [],
    difficulty: "medium",
    language: "en",
    exams: hint.exams ?? [],
    learning_objective: null,
    quality: 0.5,
    reject_reason: null,
  };
}

/** Classify a batch of chunks in a single model call. */
export async function enrichChunks(
  chunks: DraftChunk[],
  hint: { subject?: string; class_level?: string; board?: string; chapter?: string; exams?: string[] },
): Promise<ChunkMetadata[]> {
  if (chunks.length === 0) return [];

  const listing = chunks
    .map(
      (c, i) =>
        `[${i}] section: ${c.section || "(none)"}\n${c.content.slice(0, 900)}`,
    )
    .join("\n\n");

  const hints = [
    hint.subject ? `subject ${hint.subject}` : null,
    hint.class_level ? `class ${hint.class_level}` : null,
    hint.board ? `board ${hint.board}` : null,
    hint.chapter ? `chapter ${hint.chapter}` : null,
    hint.exams?.length ? `exams ${hint.exams.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  try {
    const result = await chatJson<{ items?: (ChunkMetadata & { index: number })[] }>([
      {
        role: "system",
        content: `You classify Indian school and competitive-exam study material for a tutoring knowledge base. For each passage return precise metadata. Use Indian curriculum vocabulary (CBSE, ICSE, State Board, NCERT, JEE, NEET, Boards). class_level looks like "Class 11". quality is how useful this passage is for teaching a student: 0.9 for a clear explanation, derivation or worked example; 0.5 for thin but usable; below 0.4 for navigation, exercise lists with no solution, copyright notices or fragments — set reject_reason when quality is below 0.45. Never invent a chapter that the text does not support; leave a field empty instead.
Return ONLY JSON: ${SHAPE}`,
      },
      {
        role: "user",
        content: `${hints ? `Known context: ${hints}\n\n` : ""}Passages:\n${listing}`,
      },
    ]);

    const byIndex = new Map((result.items ?? []).map((it) => [it.index, it]));
    return chunks.map((_, i) => {
      const item = byIndex.get(i);
      if (!item) return fallbackMetadata(hint);
      return {
        subject: item.subject || hint.subject || "General",
        class_level: item.class_level || hint.class_level || "",
        board: item.board || hint.board || "",
        chapter: item.chapter || hint.chapter || "",
        topic: item.topic || "",
        concept: item.concept ?? null,
        concepts: (item.concepts ?? []).slice(0, 8).map((c) => c.toLowerCase()),
        keywords: (item.keywords ?? []).slice(0, 10).map((k) => k.toLowerCase()),
        prerequisites: (item.prerequisites ?? []).slice(0, 5).map((p) => p.toLowerCase()),
        difficulty: item.difficulty ?? "medium",
        language: item.language ?? "en",
        exams: (item.exams ?? hint.exams ?? []).slice(0, 5),
        learning_objective: item.learning_objective ?? null,
        quality: typeof item.quality === "number" ? Math.max(0, Math.min(1, item.quality)) : 0.5,
        reject_reason: item.reject_reason ?? null,
      };
    });
  } catch (error) {
    console.error("[ingestion] enrichment failed, falling back to hints", error);
    return chunks.map(() => fallbackMetadata(hint));
  }
}
