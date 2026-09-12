import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TopNav } from "@/components/classroom/TopNav";
import { TranscriptPanel } from "@/components/classroom/TranscriptPanel";
import { FireOrb, orbModeFor, type OrbMode } from "@/components/classroom/FireOrb";
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
  const scrollBehavior = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" as const : "smooth" as const;

  return (
    <div className="min-h-screen bg-canvas text-cream">
      <TopNav connected={session.sttMode !== "unavailable"} />

      <main className="mx-auto grid max-w-[1500px] lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-line bg-sage/10 px-5 py-6 lg:min-h-[calc(100vh-4rem)] lg:border-b-0 lg:border-r lg:px-6 lg:py-8">
          <p className="eyebrow">Learning mode</p>
          <div className="mt-3 grid grid-cols-2 gap-1.5 lg:grid-cols-1">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => session.changeMode(m.key)}
                aria-pressed={session.mode === m.key}
                className={`rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors ${
                  session.mode === m.key
                    ? "border-forest/30 bg-forest text-paper"
                    : "border-transparent bg-surface/55 text-muted hover:border-sage hover:text-ink"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="eyebrow mt-7">Tutor language</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {LANGUAGES.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => session.changeLanguage(l.key as LanguagePref)}
                aria-pressed={session.language === l.key}
                className={`rounded-md border px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${
                  session.language === l.key
                    ? "border-rose bg-rose/35 text-ink"
                    : "border-line bg-surface text-muted hover:border-rose"
                }`}
              >
                {l.label}
              </button>
            ))}
            {session.speaking && (
              <button
                type="button"
                onClick={session.stopSpeaking}
                className="rounded-md border border-line bg-surface px-3 py-1 text-[10px] font-semibold text-ink"
              >
                Stop voice
              </button>
            )}
          </div>
          <div className="mt-8 hidden lg:block">
            <ContextPanel learner={learner} answer={answer} weakConcepts={session.weakConcepts} />
          </div>
        </aside>

        <div className="min-w-0 px-5 pb-16 pt-8 sm:px-8 lg:px-12">
        <section className="flex min-h-[660px] flex-col items-center justify-center border-b border-line pb-12">
          <FireOrb mode={orbMode} size={orbSize} label={`Voice Bingo AI core — ${caption}`} />

          <p
            className="mt-1 font-display text-xl font-semibold text-ink sm:text-2xl"
            aria-live="polite"
          >
            {caption}
          </p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-amber/80">
            {state}
          </p>

          {spoken && (
            <p className="rise-in mt-6 max-w-2xl text-center text-base leading-7 text-ink/85">
              “{spoken}”
              {session.partial && <span className="ml-0.5 animate-pulse text-amber">▍</span>}
            </p>
          )}

          <div className="mt-8 w-full">
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
          <div className="mx-auto mt-10 max-w-5xl">
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
            className="rise-in mx-auto mt-8 max-w-2xl rounded-md border border-rose bg-rose/20 p-4"
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

        {/* Fast first response — shown while the full explanation loads. */}
        {!answer && session.preview && (
          <div className="editorial-surface rise-in mx-auto mt-10 max-w-4xl rounded-lg p-6">
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-amber">
              First answer
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-cream">{session.preview}</p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted">
              Full explanation, sources and practice loading…
            </p>
          </div>
        )}

        {/* ── Answer surface stays below the orb; the session never ends ── */}
        {answer && (
          <div className="mx-auto mt-10 max-w-5xl border-y border-line py-7">
            <AnswerPanel
              answer={answer}
              busy={busy}
              activeLine={session.activeLine}
              visual={session.visual}
              visualPending={session.visualPending}
              onStrategy={session.explainDifferently}
              onFollowUp={session.askTyped}
              onEscalate={session.escalate}
              onQuizMe={() =>
                practiceRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "center" })
              }
            />
          </div>
        )}

        <div className="mt-10 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <TranscriptPanel
            question={session.question}
            partial={session.partial}
            listening={session.listening}
            answer={answer}
          />
          <div className="space-y-5">
            <div className="lg:hidden"><ContextPanel learner={learner} answer={answer} weakConcepts={session.weakConcepts} /></div>
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
