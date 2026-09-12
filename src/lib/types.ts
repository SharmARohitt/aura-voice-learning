import type { DiagramSpec } from "@/lib/diagram/spec";

// Shared domain contracts for the Voice Bingo / Aura-PW learning pipeline.

export type VoiceState =
  | "IDLE"
  | "LISTENING"
  | "TRANSCRIBING"
  | "UNDERSTANDING"
  | "RETRIEVING"
  | "REASONING"
  | "RESPONDING"
  | "CHECKING"
  | "PRACTICE"
  | "ERROR";

export type TeachingStrategy =
  | "default"
  | "simple_hindi"
  | "hinglish"
  | "english"
  | "analogy"
  | "example"
  | "formula_first"
  | "exam_mode"
  | "step_by_step";

/** Pedagogical mode — changes backend instructions, not just a UI label. */
export type TeachingMode =
  | "explain"
  | "deep_dive"
  | "quick_revision"
  | "exam_mode"
  | "practice"
  | "socratic"
  | "beginner"
  | "teacher";

export type LanguagePref = "english" | "hindi" | "hinglish" | "adaptive";

/** Captured during onboarding; drives RAG metadata filters and pedagogy. */
export interface LearnerContext {
  name: string;
  class_level: string; // "Class 10", "Class 12", "College", ...
  goal: string; // "JEE", "Boards", "Placements", ...
  subjects: string[]; // ["Physics", "Mathematics"]
  language: LanguagePref;
  onboarded_at: string;
}

export interface LectureChunk {
  chunk_id: string;
  lecture_id: string;
  lecture_title: string;
  lecture_number: number;
  course_id: string;
  batch_id: string;
  class_level: string;
  exams: string[];
  subject: string;
  chapter: string;
  topic: string;
  teacher: string;
  timestamp_start: string;
  timestamp_end: string;
  text: string;
  concepts: string[];
  difficulty: "easy" | "medium" | "hard";
  language: "en" | "hi" | "hinglish";
  prerequisites: string[];
  source_type: "lecture_transcript" | "notes" | "solved_example" | "question_bank";
  approval_status: "approved" | "pending";

  // ── Source / replay metadata (optional so ingestion can fill it over time) ──
  subtopic?: string;
  keywords?: string[];
  /** Where the original material lives. "internal" = indexed transcript only. */
  source_platform?: "internal" | "youtube" | "web";
  source_id?: string;
  source_url?: string;
  /** Last known access state; the resolver re-verifies and caches at runtime. */
  access_status?: SourceAccessStatus;
  last_verified_at?: string;
}

export type SourceAccessStatus =
  | "PUBLIC"
  | "ACCESSIBLE"
  | "TEMPORARILY_UNAVAILABLE"
  | "PRIVATE"
  | "RESTRICTED"
  | "REMOVED"
  | "UNKNOWN";

/** A verified, openable destination for a Replay / Learn action. */
export interface ReplayTarget {
  provider: string;
  title: string;
  author: string | null;
  url: string;
  /** Seconds into the resource; null when no trustworthy timestamp exists. */
  start_seconds: number | null;
  end_seconds: number | null;
  label: string;
  access_status: SourceAccessStatus;
}

export interface SourceResolution {
  chunk_id: string;
  /** "primary" = the indexed lecture itself is accessible. */
  kind: "primary" | "alternative" | "search" | "unavailable";
  target: ReplayTarget | null;
  reason: string | null;
  content_relevance: number;
  source_usability: number;
  validation_ms: number;
  cached: boolean;
}

export interface RetrievedEvidence {
  chunk: LectureChunk;
  relevance: number; // 0..1 after fusion + rerank
  lexical: number;
  semantic: number;
  /** Multi-level retrieval role of this evidence. */
  level: "direct" | "concept" | "prerequisite" | "example" | "practice";
}

export interface RetrievalResult {
  evidence: RetrievedEvidence[];
  topRelevance: number;
  grounded: boolean;
  latencyMs: number;
  rerankMs: number;
  candidates: number;
  filterUsed: string;
  prerequisiteGaps: string[];
  /** True when this exact query+filter was served from the retrieval cache. */
  cached?: boolean;
}

export interface Misconception {
  misconception_id: string;
  concept: string;
  likely_misconception: string;
  confidence: number;
  prerequisite: string;
  recommended_intervention: string;
}

export interface PracticeQuestion {
  id: string;
  level: "easy" | "similar" | "transfer";
  question: string;
  options: string[];
  answer_index: number;
  explanation: string;
}

export interface AnswerSection {
  label: string;
  body: string;
}

export interface TutorAnswer {
  grounded: boolean;
  /** Where the knowledge came from — never blur these two. */
  source: "course" | "general" | "none";
  intent: string;
  subject: string;
  chapter: string;
  concepts: string[];
  language: "hinglish" | "hindi" | "english";
  intent_confidence: number;
  learner_level: string;
  difficulty: "easy" | "medium" | "hard";
  answer_strategy: TeachingStrategy;
  mode: TeachingMode;
  short_answer: string;
  sections: AnswerSection[];
  formula: string | null;
  check_question: string;
  misconception: Misconception | null;
  prerequisite: string | null;
  prerequisite_gaps: string[];
  suggested_next: string[];
  practice: PracticeQuestion[];
  evidence: RetrievedEvidence[];
  confidence: number;
  escalation_required: boolean;
  fallback_reason: string | null;
  /** Optional AI-generated mini diagram (structured, never markup). */
  visual?: DiagramSpec | null;
  latency: PipelineLatency;
}

export interface PipelineLatency {
  intent_ms: number;
  retrieval_ms: number;
  rerank_ms: number;
  llm_ms: number;
  total_ms: number;
  /** Deterministic query understanding (no LLM). */
  parse_ms?: number;
  /** Retrieval served from the TTL cache. */
  retrieval_cached?: boolean;
  /** Background practice generation, measured client-side. */
  practice_ms?: number;
  /** Time to first spoken audio, measured client-side. */
  tts_ttfa_ms?: number;
  /** Speech-to-text finalisation, measured client-side. */
  stt_ms?: number;
  /** Time to the first useful text shown to the student. */
  llm_ttft_ms?: number;
  /** Background diagram generation, measured client-side. */
  diagram_ms?: number;
}

export interface LearnerProfile {
  student_id: string;
  name: string;
  course: string;
  chapter: string;
  lecture: string;
  prerequisite: string;
  mastery: { concept: string; score: number }[];
  weak_concepts: string[];
  recent_misconceptions: string[];
}

export interface LearningEvent {
  id: string;
  type:
    | "doubt.raised"
    | "answer.grounded"
    | "answer.general"
    | "answer.ungrounded"
    | "misconception.detected"
    | "practice.attempted"
    | "mode.changed"
    | "language.changed"
    | "escalation.raised";
  concept: string | null;
  detail: string;
  created_at: string;
}
