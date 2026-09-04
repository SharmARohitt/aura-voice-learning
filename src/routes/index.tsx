import { createFileRoute } from "@tanstack/react-router";
import { TopNav } from "@/components/classroom/TopNav";
import { TranscriptPanel } from "@/components/classroom/TranscriptPanel";
import { TeacherAvatar } from "@/components/classroom/TeacherAvatar";
import { AnswerPanel } from "@/components/classroom/AnswerPanel";
import { ContextPanel } from "@/components/classroom/ContextPanel";
import { PracticePanel } from "@/components/classroom/PracticePanel";
import { MicControl } from "@/components/classroom/MicControl";
import { DiagnosticsPanel } from "@/components/classroom/DiagnosticsPanel";
import { LEARNER, useVoiceSession } from "@/hooks/useVoiceSession";
import type { VoiceState } from "@/lib/types";

const TITLE = "Voice Bingo — the AI classroom that listens and teaches";
const DESCRIPTION =
  "Ask your doubt out loud in Hinglish. Voice Bingo finds the exact lecture moment, explains it your way, spots your misconception and gives you practice.";

export const Route = createFileRoute("/")({
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
  component: Classroom,
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

function Classroom() {
  const session = useVoiceSession();
  const { answer, state } = session;
  const busy = ["UNDERSTANDING", "RETRIEVING", "REASONING"].includes(state);

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
                  <button
                    type="button"
                    onClick={session.retry}
                    className="mt-3 rounded-lg bg-amber px-3 py-1.5 text-[11px] font-semibold text-canvas"
                  >
                    Try again
                  </button>
                </div>
              )}

              {answer && !answer.grounded && (
                <div className="rise-in mt-6 rounded-2xl border border-amber/25 bg-amber/8 p-4">
                  <p className="font-display text-[15px] leading-snug text-cream">
                    I couldn&apos;t find enough trusted material in your course to answer this
                    accurately.
                  </p>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted">
                    {answer.fallback_reason}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={session.retry}
                      className="rounded-lg border border-cream/15 bg-canvas/40 px-3 py-1.5 text-[11px] font-medium text-cream"
                    >
                      Ask differently
                    </button>
                    <button
                      type="button"
                      onClick={() => session.askTyped("Show me what this chapter covers")}
                      className="rounded-lg border border-cream/15 bg-canvas/40 px-3 py-1.5 text-[11px] font-medium text-cream"
                    >
                      Browse lecture
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-amber px-3 py-1.5 text-[11px] font-semibold text-canvas"
                    >
                      Escalate to teacher
                    </button>
                  </div>
                </div>
              )}

              {answer?.grounded && (
                <AnswerPanel
                  answer={answer}
                  busy={busy}
                  onStrategy={session.explainDifferently}
                  onFollowUp={session.askTyped}
                  onQuizMe={() =>
                    document
                      .getElementById("practice-panel")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                />
              )}
            </div>
          </section>

          <section className="order-3 lg:col-span-3">
            <div className="space-y-5">
              <ContextPanel
                learner={LEARNER}
                answer={answer}
                weakConcepts={session.weakConcepts}
              />
              <div id="practice-panel">
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
