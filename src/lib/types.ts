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

export interface LectureChunk {
  chunk_id: string;
  lecture_id: string;
  lecture_title: string;
  lecture_number: number;
  course_id: string;
  batch_id: string;
  subject: string;
  chapter: string;
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
}

export interface RetrievalResult {
  evidence: RetrievedEvidence[];
  topRelevance: number;
  grounded: boolean;
  latencyMs: number;
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
  intent: string;
  subject: string;
  chapter: string;
  concepts: string[];
  language: "hinglish" | "hindi" | "english";
  intent_confidence: number;
  learner_level: string;
  difficulty: "easy" | "medium" | "hard";
  answer_strategy: TeachingStrategy;
  short_answer: string;
  sections: AnswerSection[];
  formula: string | null;
  check_question: string;
  misconception: Misconception | null;
  prerequisite: string | null;
  practice: PracticeQuestion[];
  evidence: RetrievedEvidence[];
  confidence: number;
  escalation_required: boolean;
  fallback_reason: string | null;
  latency: PipelineLatency;
}

export interface PipelineLatency {
  retrieval_ms: number;
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
    | "answer.ungrounded"
    | "misconception.detected"
    | "practice.attempted";
  concept: string | null;
  detail: string;
  created_at: string;
}
