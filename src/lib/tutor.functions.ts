import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { chatJson, chatText, GatewayError, transcribeAudio } from "@/lib/ai-gateway.server";
import { retrieve, neighboursOf, GROUNDING_THRESHOLD } from "@/lib/rag/retriever.server";
import { understand } from "@/lib/rag/query.server";
import type { PracticeQuestion, TeachingMode, TutorAnswer } from "@/lib/types";

const AskInput = z.object({
  question: z.string().min(2).max(1000),
  strategy: z
    .enum([
      "default",
      "simple_hindi",
      "hinglish",
      "english",
      "analogy",
      "example",
      "formula_first",
      "exam_mode",
      "step_by_step",
    ])
    .default("default"),
  mode: z
    .enum([
      "explain",
      "deep_dive",
      "quick_revision",
      "exam_mode",
      "practice",
      "socratic",
      "beginner",
      "teacher",
    ])
    .default("explain"),
  language: z.enum(["english", "hindi", "hinglish", "adaptive"]).default("adaptive"),
  student_name: z.string().max(60).default("Student"),
  class_level: z.string().max(32).default(""),
  goal: z.string().max(32).default(""),
  subjects: z.array(z.string().max(40)).max(6).default([]),
  course_id: z.string().max(64).optional(),
  chapter: z.string().max(64).optional(),
  weak_concepts: z.array(z.string().max(64)).max(10).default([]),
  /** Compact conversation context so follow-ups inherit subject/chapter. */
  context_subject: z.string().max(48).optional(),
  context_chapter: z.string().max(64).optional(),
});

const STRATEGY_INSTRUCTION: Record<string, string> = {
  default: "Teach in the student's own language mix, clear and encouraging.",
  simple_hindi: "Answer in simple Hindi (Devanagari), avoiding heavy technical English.",
  hinglish: "Answer in natural Hinglish, the way an Indian teacher speaks in class.",
  english: "Answer in clear, simple English.",
  analogy: "Lead with a vivid everyday analogy before any formalism.",
  example: "Lead with a concrete worked example with numbers.",
  formula_first: "Lead with the formula, then derive meaning from it.",
  exam_mode: "Answer exam-style: crisp points, common traps, marking-scheme keywords.",
  step_by_step: "Answer as numbered steps, one idea per step.",
};

/** Each mode dictates the actual teaching shape, not just a tone. */
const MODE_INSTRUCTION: Record<TeachingMode, string> = {
  explain: "Shape: intuition → concept → simple example → formula if needed → common mistake.",
  deep_dive: "Shape: intuition → derivation → deeper reasoning → example → edge cases.",
  quick_revision: "Shape: short summary → formulas → key points → one-line recall. Be terse.",
  exam_mode: "Shape: definition → key formula → exam approach → common traps.",
  practice: "Shape: one worked example, then keep the explanation short — practice follows separately.",
  socratic: "Ask guiding questions that lead the student to the answer; do not state it outright.",
  beginner: "Assume zero background; define every term in plain words before using it.",
  teacher: "Explain the way a teacher presents to a class, with clear board structure.",
};

const LANGUAGE_INSTRUCTION: Record<string, string> = {
  english: "Reply strictly in English.",
  hindi: "Reply in Hindi (Devanagari script).",
  hinglish: "Reply in natural Hinglish (Roman script, Hindi + English mixed).",
  adaptive: "Mirror the exact language mix the student used in their question.",
};

interface ModelOutput {
  intent: string;
  subject: string;
  chapter: string;
  concepts: string[];
  language: "hinglish" | "hindi" | "english";
  intent_confidence: number;
  learner_level: string;
  difficulty: "easy" | "medium" | "hard";
  short_answer: string;
  sections: { label: string; body: string }[];
  formula: string | null;
  check_question: string;
  prerequisite: string | null;
  suggested_next?: string[];
  misconception: {
    concept: string;
    likely_misconception: string;
    confidence: number;
    prerequisite: string;
    recommended_intervention: string;
  } | null;
  confidence: number;
  escalation_required: boolean;
}

/**
 * The interactive answer JSON. Practice items are deliberately NOT here — they
 * are generated in a background call after the answer is on screen, which cuts
 * roughly a third of the output tokens off the critical path.
 */
const JSON_SHAPE = `{"intent":string,"subject":string,"chapter":string,"concepts":string[],"language":"hinglish"|"hindi"|"english","intent_confidence":number(0-1),"learner_level":string,"difficulty":"easy"|"medium"|"hard","short_answer":string(max 2 sentences),"sections":[{"label":string,"body":string}],"formula":string|null,"check_question":string,"prerequisite":string|null,"suggested_next":string[],"misconception":{"concept":string,"likely_misconception":string,"confidence":number(0-1),"prerequisite":string,"recommended_intervention":string}|null,"confidence":number(0-1),"escalation_required":boolean}
sections: 2-3 entries, labels from: Intuition, Relationship, Worked Example, Step-by-Step, Exam Tip, Common Mistake. Keep each section under 70 words. suggested_next: 3 short follow-up topics. Never expose internal reasoning steps.`;

export const askTutor = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AskInput.parse(input))
  .handler(async ({ data }): Promise<TutorAnswer> => {
    const started = performance.now();

    // 1. Compact, deterministic query understanding — no LLM classifier call.
    const parsed = understand(data.question, {
      subject: data.context_subject ?? null,
      chapter: data.context_chapter ?? null,
      class_level: data.class_level,
    });

    // 2. Hybrid retrieval (cached per query+filter).
    const retrieval = await retrieve(data.question, {
      ...(data.course_id ? { course_id: data.course_id } : {}),
      ...(data.chapter || parsed.chapter ? { chapter: data.chapter ?? parsed.chapter! } : {}),
      ...(data.subjects.length ? { subjects: data.subjects } : {}),
      ...(data.class_level ? { class_level: data.class_level } : {}),
      ...(parsed.exam ? { exam: parsed.exam } : {}),
    });

    const grounded = retrieval.grounded;

    // 3. Context packing: strongest evidence + one neighbouring segment for
    //    continuity + lecture metadata. Never whole lectures.
    const strongest = retrieval.evidence.slice(0, 3);
    const neighbourText = grounded && strongest[0]
      ? neighboursOf(strongest[0].chunk.chunk_id)
          .slice(0, 1)
          .map((n) => `[CONTEXT] ${n.timestamp_start}-${n.timestamp_end}: ${n.text}`)
          .join("\n")
      : "";

    const evidenceBlock = strongest
      .map(
        (e, i) =>
          `[E${i + 1}] (${e.level}) ${e.chunk.subject} · ${e.chunk.chapter} · Lecture ${e.chunk.lecture_number} (${e.chunk.timestamp_start}-${e.chunk.timestamp_end}) relevance ${e.relevance}\n${e.chunk.text}\nconcepts: ${e.chunk.concepts.join(", ")}`,
      )
      .join("\n\n");

    const learnerBlock = `Student: ${data.student_name} · ${data.class_level || "level unknown"} · goal: ${data.goal || "general learning"} · subjects: ${data.subjects.join(", ") || "any"}
Detected: topic ${parsed.topic ?? "unknown"} · intent ${parsed.intent} · language ${parsed.language} · level ${parsed.difficulty}
Known weak concepts: ${data.weak_concepts.join(", ") || "none recorded"}`;

    const systemPrompt = grounded
      ? `You are Aura, an AI tutor for Indian students. Answer using the supplied APPROVED COURSE EVIDENCE as the primary source; do not invent formulas the evidence contradicts. Never invent lecture numbers, teachers, timestamps or URLs.
${STRATEGY_INSTRUCTION[data.strategy]}
${MODE_INSTRUCTION[data.mode]}
${LANGUAGE_INSTRUCTION[data.language]}
Infer the likely misconception behind the question, not just the topic. Be honest in the misconception confidence.
Return ONLY JSON with this exact shape:
${JSON_SHAPE}`
      : `You are Aura, an AI tutor for Indian students. The student's own course material does NOT cover this question, so answer from reliable general educational knowledge instead — never refuse, never stall. Say plainly in the first section that this is general knowledge, outside their course index. Never invent a lecture, teacher or timestamp.
${STRATEGY_INSTRUCTION[data.strategy]}
${MODE_INSTRUCTION[data.mode]}
${LANGUAGE_INSTRUCTION[data.language]}
Return ONLY JSON with this exact shape:
${JSON_SHAPE}`;

    const userPrompt = grounded
      ? `Student doubt (verbatim): "${data.question}"
${learnerBlock}

APPROVED COURSE EVIDENCE:
${evidenceBlock}
${neighbourText}`
      : `Student doubt (verbatim): "${data.question}"
${learnerBlock}

No approved course evidence cleared the grounding threshold (top relevance ${retrieval.topRelevance.toFixed(2)} < ${GROUNDING_THRESHOLD}). Answer from general educational knowledge.`;

    const llmStart = performance.now();
    let model: ModelOutput;
    try {
      model = await chatJson<ModelOutput>([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError(500, "The tutor could not complete this answer.", true);
    }
    const llmMs = Math.round(performance.now() - llmStart);

    const top = retrieval.evidence[0];

    return {
      grounded,
      source: grounded ? "course" : "general",
      intent: model.intent ?? parsed.intent,
      subject: model.subject || top?.chunk.subject || parsed.subject || data.subjects[0] || "General",
      chapter: model.chapter || top?.chunk.chapter || parsed.chapter || "",
      concepts: model.concepts ?? [],
      language: model.language ?? parsed.language,
      intent_confidence: clamp(model.intent_confidence),
      learner_level: model.learner_level || data.class_level || "unknown",
      difficulty: model.difficulty ?? parsed.difficulty,
      answer_strategy: data.strategy,
      mode: data.mode,
      short_answer: model.short_answer ?? "",
      sections: (model.sections ?? []).slice(0, 4),
      formula: model.formula ?? null,
      check_question: model.check_question ?? "",
      prerequisite: model.prerequisite ?? null,
      prerequisite_gaps: retrieval.prerequisiteGaps,
      suggested_next: (model.suggested_next ?? []).slice(0, 3),
      misconception: model.misconception
        ? {
            misconception_id: `mc-${Date.now().toString(36)}`,
            concept: model.misconception.concept,
            likely_misconception: model.misconception.likely_misconception,
            confidence: clamp(model.misconception.confidence),
            prerequisite: model.misconception.prerequisite,
            recommended_intervention: model.misconception.recommended_intervention,
          }
        : null,
      practice: [], // filled by generatePractice in the background
      evidence: grounded ? retrieval.evidence : [],
      confidence: clamp(model.confidence ?? retrieval.topRelevance),
      escalation_required: Boolean(model.escalation_required),
      fallback_reason: grounded
        ? null
        : `Not found in your course index (top relevance ${retrieval.topRelevance.toFixed(2)} < ${GROUNDING_THRESHOLD}) — answered from general knowledge.`,
      latency: {
        intent_ms: Math.round(parsed.parse_ms),
        parse_ms: Math.round(parsed.parse_ms),
        retrieval_ms: Math.round(retrieval.latencyMs),
        retrieval_cached: Boolean(retrieval.cached),
        rerank_ms: Math.round(retrieval.rerankMs),
        llm_ms: llmMs,
        total_ms: Math.round(performance.now() - started),
      },
    };
  });

function clamp(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// ── Background practice generation ────────────────────────────────────────
// Runs AFTER the answer is on screen, so it never delays first token/audio.

const PracticeInput = z.object({
  question: z.string().min(2).max(1000),
  concept: z.string().max(120).default(""),
  language: z.enum(["english", "hindi", "hinglish", "adaptive"]).default("adaptive"),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
});

interface PracticeOutput {
  practice: {
    level: "easy" | "similar" | "transfer";
    question: string;
    options: string[];
    answer_index: number;
    explanation: string;
  }[];
}

export const generatePractice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PracticeInput.parse(input))
  .handler(async ({ data }): Promise<PracticeQuestion[]> => {
    const model = await chatJson<PracticeOutput>([
      {
        role: "system",
        content: `You write practice questions for Indian students. ${LANGUAGE_INSTRUCTION[data.language]}
Return ONLY JSON: {"practice":[{"level":"easy"|"similar"|"transfer","question":string,"options":string[3-4],"answer_index":number,"explanation":string}]}
Exactly 3 items — easy, similar, transfer — pitched at ${data.difficulty} level.`,
      },
      {
        role: "user",
        content: `Student doubt: "${data.question}"\nConcept: ${data.concept || "as implied by the doubt"}`,
      },
    ]);

    return (model.practice ?? []).slice(0, 3).map((p, i) => ({
      id: `q-${Date.now().toString(36)}-${i}`,
      level: p.level ?? "similar",
      question: p.question,
      options: p.options ?? [],
      answer_index: p.answer_index ?? 0,
      explanation: p.explanation ?? "",
    }));
  });

const TranscribeInput = z.object({
  audio_base64: z.string().min(16).max(6_000_000),
  mime_type: z.string().max(64).default("audio/webm"),
});

/** Server-side STT fallback for browsers without streaming speech recognition. */
export const transcribeSpeech = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TranscribeInput.parse(input))
  .handler(async ({ data }) => {
    const binary = Uint8Array.from(atob(data.audio_base64), (c) => c.charCodeAt(0));
    const blob = new Blob([binary], { type: data.mime_type });
    const text = await transcribeAudio(blob, "speech.webm");
    return { text };
  });

// ── Fast first response ───────────────────────────────────────────────────
// A tiny, capped, plain-text answer that lands in about a second so the
// student sees and hears help immediately while the full structured
// explanation is still being generated in parallel.

const QuickInput = z.object({
  question: z.string().min(2).max(1000),
  language: z.enum(["english", "hindi", "hinglish", "adaptive"]).default("adaptive"),
  mode: z
    .enum([
      "explain",
      "deep_dive",
      "quick_revision",
      "exam_mode",
      "practice",
      "socratic",
      "beginner",
      "teacher",
    ])
    .default("explain"),
  class_level: z.string().max(32).default(""),
  subjects: z.array(z.string().max(40)).max(6).default([]),
  course_id: z.string().max(64).optional(),
});

export const quickAnswer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => QuickInput.parse(input))
  .handler(async ({ data }): Promise<{ text: string; grounded: boolean; ms: number }> => {
    const started = performance.now();
    const retrieval = await retrieve(data.question, {
      ...(data.course_id ? { course_id: data.course_id } : {}),
      ...(data.subjects.length ? { subjects: data.subjects } : {}),
      ...(data.class_level ? { class_level: data.class_level } : {}),
    });
    const top = retrieval.evidence[0];
    const evidence =
      retrieval.grounded && top
        ? `Course evidence (${top.chunk.subject} · ${top.chunk.chapter}): ${top.chunk.text}`
        : "No course evidence cleared the grounding threshold — answer from general knowledge.";

    const text = await chatText(
      [
        {
          role: "system",
          content: `You are Aura, a warm Indian tutor. Give the opening 2 sentences of your explanation — the core idea only, no lists, no formulas, no markdown. ${LANGUAGE_INSTRUCTION[data.language]} ${MODE_INSTRUCTION[data.mode]} Never invent lecture numbers, teachers or timestamps.`,
        },
        { role: "user", content: `Doubt: "${data.question}"\n${evidence}` },
      ],
      120,
    );

    return {
      text,
      grounded: retrieval.grounded,
      ms: Math.round(performance.now() - started),
    };
  });
