import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { chatJson, GatewayError, transcribeAudio } from "@/lib/ai-gateway.server";
import { retrieve, GROUNDING_THRESHOLD } from "@/lib/rag/retriever.server";
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

const MODE_INSTRUCTION: Record<TeachingMode, string> = {
  explain: "Explain the concept clearly at the student's level.",
  deep_dive: "Go deep: derivation, edge cases, and why the concept exists at all.",
  quick_revision: "Rapid revision: only the key points, formulas and one-line recalls.",
  exam_mode: "Exam focus: marking-scheme wording, common traps, time-saving shortcuts.",
  practice: "Keep the explanation short and put most of the effort into strong practice items.",
  socratic: "Lead with guiding questions that make the student reach the answer themselves.",
  beginner: "Assume zero background; define every term in plain words before using it.",
  teacher: "Explain the way a teacher would present it to a full class, with board structure.",
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
  practice: {
    level: "easy" | "similar" | "transfer";
    question: string;
    options: string[];
    answer_index: number;
    explanation: string;
  }[];
  confidence: number;
  escalation_required: boolean;
}

const JSON_SHAPE = `{"intent":string,"subject":string,"chapter":string,"concepts":string[],"language":"hinglish"|"hindi"|"english","intent_confidence":number(0-1),"learner_level":string,"difficulty":"easy"|"medium"|"hard","short_answer":string(max 2 sentences),"sections":[{"label":string,"body":string}],"formula":string|null,"check_question":string,"prerequisite":string|null,"suggested_next":string[],"misconception":{"concept":string,"likely_misconception":string,"confidence":number(0-1),"prerequisite":string,"recommended_intervention":string}|null,"practice":[{"level":"easy"|"similar"|"transfer","question":string,"options":string[],"answer_index":number,"explanation":string}],"confidence":number(0-1),"escalation_required":boolean}
sections must contain 2-4 entries with labels chosen from: Intuition, Relationship, Worked Example, Step-by-Step, Exam Tip. Provide exactly 3 practice items (easy, similar, transfer), each with 3-4 options. suggested_next: 3 short follow-up topics. Never expose internal reasoning steps.`;

export const askTutor = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AskInput.parse(input))
  .handler(async ({ data }): Promise<TutorAnswer> => {
    const started = Date.now();
    const intentStart = Date.now();
    const retrieval = await retrieve(data.question, {
      ...(data.course_id ? { course_id: data.course_id } : {}),
      ...(data.chapter ? { chapter: data.chapter } : {}),
      ...(data.subjects.length ? { subjects: data.subjects } : {}),
      ...(data.class_level ? { class_level: data.class_level } : {}),
    });
    const intentMs = Date.now() - intentStart - retrieval.latencyMs;

    const grounded = retrieval.grounded;
    const evidenceBlock = retrieval.evidence
      .map(
        (e, i) =>
          `[E${i + 1}] (${e.level}) ${e.chunk.subject} · ${e.chunk.chapter} · Lecture ${e.chunk.lecture_number} (${e.chunk.timestamp_start}-${e.chunk.timestamp_end}) relevance ${e.relevance}\n${e.chunk.text}\nconcepts: ${e.chunk.concepts.join(", ")}\nprerequisites: ${e.chunk.prerequisites.join(", ")}`,
      )
      .join("\n\n");

    const learnerBlock = `Student: ${data.student_name} · ${data.class_level || "level unknown"} · goal: ${data.goal || "general learning"} · subjects: ${data.subjects.join(", ") || "any"}
Known weak concepts: ${data.weak_concepts.join(", ") || "none recorded"}`;

    const systemPrompt = grounded
      ? `You are Aura, an AI tutor for Indian students. Answer using the supplied APPROVED COURSE EVIDENCE as the primary source; do not invent formulas the evidence contradicts.
${STRATEGY_INSTRUCTION[data.strategy]}
${MODE_INSTRUCTION[data.mode]}
${LANGUAGE_INSTRUCTION[data.language]}
Infer the likely misconception behind the question, not just the topic. Be honest in the misconception confidence.
Return ONLY JSON with this exact shape:
${JSON_SHAPE}`
      : `You are Aura, an AI tutor for Indian students. The student's own course material does NOT cover this question, so answer from reliable general educational knowledge instead — never refuse, never stall. Be accurate and say plainly in the first section that this is general knowledge, outside their uploaded course.
${STRATEGY_INSTRUCTION[data.strategy]}
${MODE_INSTRUCTION[data.mode]}
${LANGUAGE_INSTRUCTION[data.language]}
Return ONLY JSON with this exact shape:
${JSON_SHAPE}`;

    const userPrompt = grounded
      ? `Student doubt (verbatim): "${data.question}"
${learnerBlock}

APPROVED COURSE EVIDENCE:
${evidenceBlock}`
      : `Student doubt (verbatim): "${data.question}"
${learnerBlock}

No approved course evidence cleared the grounding threshold (top relevance ${retrieval.topRelevance.toFixed(2)} < ${GROUNDING_THRESHOLD}). Answer from general educational knowledge.`;

    const llmStart = Date.now();
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
    const llmMs = Date.now() - llmStart;

    const top = retrieval.evidence[0];
    const practice: PracticeQuestion[] = (model.practice ?? []).slice(0, 3).map((p, i) => ({
      id: `q-${Date.now().toString(36)}-${i}`,
      level: p.level ?? "similar",
      question: p.question,
      options: p.options ?? [],
      answer_index: p.answer_index ?? 0,
      explanation: p.explanation ?? "",
    }));

    return {
      grounded,
      source: grounded ? "course" : "general",
      intent: model.intent ?? "conceptual doubt",
      subject: model.subject || top?.chunk.subject || data.subjects[0] || "General",
      chapter: model.chapter || top?.chunk.chapter || "",
      concepts: model.concepts ?? [],
      language: model.language ?? "hinglish",
      intent_confidence: clamp(model.intent_confidence),
      learner_level: model.learner_level || data.class_level || "unknown",
      difficulty: model.difficulty ?? "medium",
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
      practice,
      evidence: grounded ? retrieval.evidence : [],
      confidence: clamp(model.confidence ?? retrieval.topRelevance),
      escalation_required: Boolean(model.escalation_required),
      fallback_reason: grounded
        ? null
        : `Not found in your course index (top relevance ${retrieval.topRelevance.toFixed(2)} < ${GROUNDING_THRESHOLD}) — answered from general knowledge.`,
      latency: {
        intent_ms: Math.max(0, intentMs),
        retrieval_ms: retrieval.latencyMs,
        rerank_ms: retrieval.rerankMs,
        llm_ms: llmMs,
        total_ms: Date.now() - started,
      },
    };
  });

function clamp(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

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
