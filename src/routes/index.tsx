import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TopNav } from "@/components/classroom/TopNav";
import { TranscriptPanel } from "@/components/classroom/TranscriptPanel";
import { TeacherAvatar } from "@/components/classroom/TeacherAvatar";
import { AnswerPanel } from "@/components/classroom/AnswerPanel";
import { ContextPanel } from "@/components/classroom/ContextPanel";
import { PracticePanel } from "@/components/classroom/PracticePanel";
import { MicControl } from "@/components/classroom/MicControl";
import { DiagnosticsPanel } from "@/components/classroom/DiagnosticsPanel";
import { WelcomeHub, type HubAction } from "@/components/classroom/WelcomeHub";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { profileFor, useVoiceSession } from "@/hooks/useVoiceSession";
import { clearContext, LANGUAGES, loadContext, saveContext } from "@/lib/learner-context";
import { suggestTopics } from "@/lib/knowledge/corpus";
import type { LanguagePref, LearnerContext, TeachingMode, VoiceState } from "@/lib/types";

const TITLE = "Voice Bingo — the AI classroom that listens and teaches";
const DESCRIPTION =
  "Ask your doubt out loud in Hinglish. Voice Bingo finds the exact lecture moment, explains it your way, spots your misconception and gives you practice.";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { ask?: string } => ({
    ask: typeof search.ask === "string" && search.ask.trim() ? search.ask : undefined,
  }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const STAGE_BY_STATE: Record<VoiceState, string | null> = {
  IDLE: null,
  LISTENING: "MIC",
  TRANSCRIBING: "STT",
  UNDERSTANDING: "INTENT",
  RETRIEVING: "RAG",
  REASONING: "LLM",
  RESPONDING: "TTS",
  CHECKING: "PEDAGOGY",
  PRACTICE: "PEDAGOGY",
  ERROR: null,
};

const MODES: { key: TeachingMode; label: string }[] = [
  { key: "explain", label: "Explain" },
  { key: "deep_dive", label: "Deep Dive" },
  { key: "quick_revision", label: "Revision" },
  { key: "exam_mode", label: "Exam Mode" },
  { key: "practice", label: "Practice" },
  { key: "socratic", label: "Socratic" },
  { key: "beginner", label: "Beginner" },
];

function Home() {
  const [context, setContext] = useState<LearnerContext | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setContext(loadContext());
    setReady(true);
  }, []);

  if (!ready) return <div className="min-h-screen bg-canvas" />;
  if (!context)
    return (
      <Onboarding
        onDone={(next) => {
          saveContext(next);
          setContext(next);
        }}
      />
    );

  return (
    <Classroom
      key={context.onboarded_at}
      context={context}
      onResetProfile={() => {
        clearContext();
        setContext(null);
      }}
    />
  );
}

function Classroom({
  context,
  onResetProfile,
}: {
  context: LearnerContext;
  onResetProfile: () => void;
}) {
  const session = useVoiceSession(context);
  const { answer, state } = session;
  const { ask } = Route.useSearch();
  const busy = ["UNDERSTANDING", "RETRIEVING", "REASONING"].includes(state);
  const learner = useMemo(() => profileFor(context), [context]);
  const topics = useMemo(
    () => suggestTopics({ class_level: context.class_level, subjects: context.subjects, goal: context.goal }),
    [context],
  );
  const practiceRef = useRef<HTMLDivElement>(null);
  const started = Boolean(answer) || busy || session.question.length > 0;

  const askedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ask || askedRef.current === ask) return;
    askedRef.current = ask;
    session.askTyped(ask);
  }, [ask, session]);

  const runAction = (action: HubAction, topic?: string) => {
    const subject = context.subjects[0] ?? "your syllabus";
    const focus = topic ?? topics[0]?.topic ?? subject;
    switch (action) {
      case "ask":
        document.getElementById("typed-doubt")?.focus();
        return;
      case "study":
        session.changeMode("explain");
        session.askTyped(`Teach me ${focus} from the start, with an example.`);
        return;
      case "test":
        session.changeMode("exam_mode");
        session.askTyped(`Test me on ${focus} with exam-level questions.`);
        return;
      case "revise":
        session.changeMode("quick_revision");
        session.askTyped(`Quick revision of ${focus} — only the key points and formulas.`);
        return;
      case "practice":
        session.changeMode("practice");
        session.askTyped(`Give me graded practice questions on ${focus}.`);
        practiceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas text-cream">
      <div
        className="pointer-events-none absolute -top-48 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-amber/25 blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-[-200px] left-[-100px] h-[500px] w-[600px] rounded-full bg-rose/20 blur-[130px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-[-150px] top-1/3 h-[500px] w-[500px] rounded-full bg-amber/15 blur-[120px]"
        aria-hidden
      />

      <TopNav connected={session.sttMode !== "unavailable"} />

      <main className="relative z-10 mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        {/* Mode + language rail — every control re-runs the pipeline for real. */}
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-cream/10 bg-surface/40 p-3 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-mono text-[9px] uppercase tracking-widest text-muted">
              Mode
            </span>
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => session.changeMode(m.key)}
                aria-pressed={session.mode === m.key}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  session.mode === m.key
                    ? "border-amber/50 bg-amber/15 text-amber"
                    : "border-cream/12 bg-canvas/40 text-cream/85 hover:border-amber/40"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-mono text-[9px] uppercase tracking-widest text-muted">
              Language
            </span>
            {LANGUAGES.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => session.changeLanguage(l.key as LanguagePref)}
                aria-pressed={session.language === l.key}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  session.language === l.key
                    ? "border-rose/50 bg-rose/15 text-rose"
                    : "border-cream/12 bg-canvas/40 text-cream/85 hover:border-rose/40"
                }`}
              >
                {l.label}
              </button>
            ))}
            {session.speaking && (
              <button
                type="button"
                onClick={session.stopSpeaking}
                className="rounded-full border border-cream/20 bg-canvas/60 px-3 py-1.5 text-[11px] font-semibold text-cream"
              >
                Stop voice
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <section className="order-2 lg:order-1 lg:col-span-3">
            <div className="space-y-5">
              <TranscriptPanel
                question={session.question}
                partial={session.partial}
                listening={session.listening}
                answer={answer}
              />
              <DiagnosticsPanel
                answer={answer}
                events={session.events}
                activeStage={STAGE_BY_STATE[state]}
              />
            </div>
          </section>

          <section className="order-1 lg:order-2 lg:col-span-6">
            <div className="space-y-5">
              {!started && (
                <WelcomeHub
                  context={context}
                  topics={topics}
                  onAction={runAction}
                  onEditProfile={onResetProfile}
                />
              )}

              <div className="relative overflow-hidden rounded-3xl border border-cream/10 bg-gradient-to-b from-surface/50 to-canvas/30 p-5 backdrop-blur-xl sm:p-6">
                <div
                  className="pointer-events-none absolute -top-24 left-1/2 h-[300px] w-[420px] -translate-x-1/2 rounded-full bg-amber/20 blur-[80px]"
                  aria-hidden
                />
                <TeacherAvatar state={state} speaking={session.speaking} />

                {session.error && (
                  <div
                    role="alert"
                    className="rise-in mt-6 rounded-2xl border border-rose/25 bg-rose/10 p-4"
                  >
                    <p className="font-display text-[14px] text-cream">{session.error}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={session.retry}
                        className="rounded-lg bg-amber px-3 py-1.5 text-[11px] font-semibold text-canvas"
                      >
                        Try again
                      </button>
                      <button
                        type="button"
                        onClick={session.escalate}
                        className="rounded-lg border border-cream/15 bg-canvas/40 px-3 py-1.5 text-[11px] font-medium text-cream"
                      >
                        Send to teacher
                      </button>
                    </div>
                  </div>
                )}

                {answer && (
                  <AnswerPanel
                    answer={answer}
                    busy={busy}
                    onStrategy={session.explainDifferently}
                    onFollowUp={session.askTyped}
                    onEscalate={session.escalate}
                    onQuizMe={() =>
                      practiceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
                    }
                  />
                )}
              </div>
            </div>
          </section>

          <section className="order-3 lg:col-span-3">
            <div className="space-y-5">
              <ContextPanel learner={learner} answer={answer} weakConcepts={session.weakConcepts} />
              <div id="practice-panel" ref={practiceRef}>
                <PracticePanel
                  questions={answer?.practice ?? []}
                  concept={answer?.concepts[0] ?? null}
                  onAttempt={session.recordPracticeAttempt}
                />
              </div>
            </div>
          </section>
        </div>

        <MicControl
          state={state}
          listening={session.listening}
          speaking={session.speaking}
          sttMode={session.sttMode}
          latencyMs={answer?.latency.total_ms ?? null}
          onStart={session.startListening}
          onStop={session.stopListening}
          onTyped={session.askTyped}
        />
      </main>
    </div>
  );
}
