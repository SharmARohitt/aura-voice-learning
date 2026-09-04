import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { chatJson, GatewayError, transcribeAudio } from "@/lib/ai-gateway.server";
import { retrieve, GROUNDING_THRESHOLD } from "@/lib/rag/retriever.server";
import type { TutorAnswer } from "@/lib/types";

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

export const askTutor = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AskInput.parse(input))
  .handler(async ({ data }): Promise<TutorAnswer> => {
    const started = Date.now();
    const retrieval = await retrieve(data.question, {
      ...(data.course_id ? { course_id: data.course_id } : {}),
      ...(data.chapter ? { chapter: data.chapter } : {}),
    });

    // Grounding policy: never answer curriculum questions without evidence.
    if (!retrieval.grounded) {
      return {
        grounded: false,
        intent: "unresolved",
        subject: "",
        chapter: data.chapter ?? "",
        concepts: [],
        language: "hinglish",
        intent_confidence: 0,
        learner_level: "unknown",
        difficulty: "medium",
        answer_strategy: data.strategy,
        short_answer:
          "I couldn't find enough trusted material in your course to answer this accurately.",
        sections: [],
        formula: null,
        check_question: "",
        misconception: null,
        prerequisite: null,
        practice: [],
        evidence: retrieval.evidence,
        confidence: retrieval.topRelevance,
        escalation_required: true,
        fallback_reason: `Top evidence relevance ${retrieval.topRelevance.toFixed(
          2,
        )} is below the grounding threshold ${GROUNDING_THRESHOLD}.`,
        latency: {
          retrieval_ms: retrieval.latencyMs,
          llm_ms: 0,
          total_ms: Date.now() - started,
        },
      };
    }

    const evidenceBlock = retrieval.evidence
      .map(
        (e, i) =>
          `[E${i + 1}] ${e.chunk.subject} · ${e.chunk.chapter} · Lecture ${e.chunk.lecture_number} (${e.chunk.timestamp_start}-${e.chunk.timestamp_end}) relevance ${e.relevance}\n${e.chunk.text}\nconcepts: ${e.chunk.concepts.join(", ")}\nprerequisites: ${e.chunk.prerequisites.join(", ")}`,
      )
      .join("\n\n");

    const llmStart = Date.now();
    let model: ModelOutput;
    try {
      model = await chatJson<ModelOutput>([
        {
          role: "system",
          content: `You are Aura, an AI tutor for Indian students (PhysicsWallah-style batches). You answer ONLY from the supplied approved course evidence. Never invent facts or formulas that are not supported by the evidence. Students speak Hinglish; mirror their language naturally.
${STRATEGY_INSTRUCTION[data.strategy]}
Infer the likely misconception behind the question — not just the topic. Be honest about uncertainty in the misconception confidence.
Return ONLY JSON with this exact shape:
{"intent":string,"subject":string,"chapter":string,"concepts":string[],"language":"hinglish"|"hindi"|"english","intent_confidence":number(0-1),"learner_level":string,"difficulty":"easy"|"medium"|"hard","short_answer":string(max 2 sentences),"sections":[{"label":string,"body":string}],"formula":string|null,"check_question":string,"prerequisite":string|null,"misconception":{"concept":string,"likely_misconception":string,"confidence":number(0-1),"prerequisite":string,"recommended_intervention":string}|null,"practice":[{"level":"easy"|"similar"|"transfer","question":string,"options":string[],"answer_index":number,"explanation":string}],"confidence":number(0-1),"escalation_required":boolean}
sections must contain 2-4 entries with labels chosen from: Intuition, Relationship, Worked Example, Step-by-Step, Exam Tip. Provide exactly 3 practice items (easy, similar, transfer), each with 3-4 options. Never expose your internal reasoning steps.`,
        },
        {
          role: "user",
          content: `Student doubt (verbatim): "${data.question}"
Known weak concepts for this learner: ${data.weak_concepts.join(", ") || "none recorded"}
Course context: ${data.course_id ?? "unknown"} / ${data.chapter ?? "unknown chapter"}

APPROVED COURSE EVIDENCE:
${evidenceBlock}`,
        },
      ]);
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError(500, "The tutor could not complete this answer.", true);
    }
    const llmMs = Date.now() - llmStart;

    return {
      grounded: true,
      intent: model.intent ?? "conceptual doubt",
      subject: model.subject || retrieval.evidence[0]!.chunk.subject,
      chapter: model.chapter || retrieval.evidence[0]!.chunk.chapter,
      concepts: model.concepts ?? [],
      language: model.language ?? "hinglish",
      intent_confidence: clamp(model.intent_confidence),
      learner_level: model.learner_level ?? "class 11",
      difficulty: model.difficulty ?? "medium",
      answer_strategy: data.strategy,
      short_answer: model.short_answer ?? "",
      sections: (model.sections ?? []).slice(0, 4),
      formula: model.formula ?? null,
      check_question: model.check_question ?? "",
      prerequisite: model.prerequisite ?? null,
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
      practice: (model.practice ?? []).slice(0, 3).map((p, i) => ({
        id: `q-${Date.now().toString(36)}-${i}`,
        level: p.level,
        question: p.question,
        options: p.options ?? [],
        answer_index: p.answer_index ?? 0,
        explanation: p.explanation ?? "",
      })),
      evidence: retrieval.evidence,
      confidence: clamp(model.confidence ?? retrieval.topRelevance),
      escalation_required: Boolean(model.escalation_required),
      fallback_reason: null,
      latency: {
        retrieval_ms: retrieval.latencyMs,
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
