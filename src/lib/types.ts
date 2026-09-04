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
  latency: PipelineLatency;
}

export interface PipelineLatency {
  intent_ms: number;
  retrieval_ms: number;
  rerank_ms: number;
  llm_ms: number;
  total_ms: number;
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
