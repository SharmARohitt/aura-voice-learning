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
  validateSearch: (search: Record<string, unknown>): { ask?: string | undefined } => {
    const raw = search["ask"];
    return typeof raw === "string" && raw.trim() ? { ask: raw } : {};
  },
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

  const orbMode = orbModeFor(state, session.listening, session.speaking);
  const orbSize = useOrbSize();
  const caption = CAPTIONS[orbMode];
  const spoken = session.partial || session.question;

  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas text-cream">
      <div
        className="pointer-events-none absolute left-1/2 top-[-260px] h-[620px] w-[900px] -translate-x-1/2 rounded-full bg-amber/12 blur-[150px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-[-260px] left-1/2 h-[420px] w-[700px] -translate-x-1/2 rounded-full bg-rose/10 blur-[150px]"
        aria-hidden
      />

      <TopNav connected={session.sttMode !== "unavailable"} />

      <main className="relative z-10 mx-auto max-w-[1200px] px-4 pb-16 pt-4 sm:px-6">
        {/* ── Mode + language rail: premium glass chips ───────────────── */}
        <div className="mx-auto mb-6 flex max-w-4xl flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => session.changeMode(m.key)}
                aria-pressed={session.mode === m.key}
                className={`rounded-full border px-3.5 py-1.5 text-[11px] font-medium backdrop-blur-xl transition-all duration-300 ease-out ${
                  session.mode === m.key
                    ? "border-amber/55 bg-amber/15 text-amber shadow-[0_0_18px_-4px_oklch(0.83_0.135_74/0.55)]"
                    : "border-cream/10 bg-surface/40 text-cream/75 hover:border-amber/35 hover:text-cream"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {LANGUAGES.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => session.changeLanguage(l.key as LanguagePref)}
                aria-pressed={session.language === l.key}
                className={`rounded-full border px-3 py-1 text-[10px] font-medium backdrop-blur-xl transition-all duration-300 ${
                  session.language === l.key
                    ? "border-rose/50 bg-rose/12 text-rose"
                    : "border-cream/10 bg-surface/30 text-cream/60 hover:border-rose/35"
                }`}
              >
                {l.label}
              </button>
            ))}
            {session.speaking && (
              <button
                type="button"
                onClick={session.stopSpeaking}
                className="rounded-full border border-cream/20 bg-surface/60 px-3 py-1 text-[10px] font-semibold text-cream backdrop-blur-xl"
              >
                Stop voice
              </button>
            )}
          </div>
        </div>

        {/* ── The hero: AI fire core ──────────────────────────────────── */}
        <section className="flex flex-col items-center">
          <FireOrb mode={orbMode} size={orbSize} label={`Voice Bingo AI core — ${caption}`} />

          <p
            className="mt-2 font-display text-[17px] font-semibold tracking-tight text-cream sm:text-[19px]"
            aria-live="polite"
          >
            {caption}
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.3em] text-amber/80">
            {state}
          </p>

          {spoken && (
            <p className="rise-in mt-5 max-w-xl text-center text-[14px] leading-relaxed text-cream/85 sm:text-[15px]">
              “{spoken}”
              {session.partial && <span className="ml-0.5 animate-pulse text-amber">▍</span>}
            </p>
          )}

          <div className="mt-7 w-full">
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
          </div>
        </section>

        {!started && (
          <div className="mx-auto mt-10 max-w-3xl">
            <WelcomeHub
              context={context}
              topics={topics}
              onAction={runAction}
              onEditProfile={onResetProfile}
            />
          </div>
        )}

        {session.error && (
          <div
            role="alert"
            className="rise-in mx-auto mt-8 max-w-xl rounded-2xl border border-rose/25 bg-rose/10 p-4 backdrop-blur-xl"
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

        {/* ── Answer surface stays below the orb; the session never ends ── */}
        {answer && (
          <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-cream/10 bg-surface/35 p-5 backdrop-blur-xl sm:p-6">
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
          </div>
        )}

        <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <TranscriptPanel
            question={session.question}
            partial={session.partial}
            listening={session.listening}
            answer={answer}
          />
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
          <DiagnosticsPanel
            answer={answer}
            events={session.events}
            activeStage={STAGE_BY_STATE[state]}
          />
        </div>
      </main>
    </div>
  );
}

const CAPTIONS: Record<OrbMode, string> = {
  idle: "Ready — bolo, kya doubt hai?",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  error: "Something interrupted us.",
};

/** Hero on desktop, compact on mobile — keeps the mic above the fold. */
function useOrbSize() {
  const [size, setSize] = useState(300);
  useEffect(() => {
    const measure = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const byWidth = w < 480 ? w * 0.62 : w < 1024 ? 280 : 340;
      setSize(Math.round(Math.max(180, Math.min(byWidth, h * 0.38))));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return size;
}
