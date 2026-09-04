import type { VoiceState } from "@/lib/types";

const STATES: { key: VoiceState; short: string }[] = [
  { key: "LISTENING", short: "L" },
  { key: "TRANSCRIBING", short: "T" },
  { key: "UNDERSTANDING", short: "U" },
  { key: "RETRIEVING", short: "R" },
  { key: "REASONING", short: "TH" },
  { key: "RESPONDING", short: "TEACH" },
  { key: "CHECKING", short: "CHECK" },
];

const CAPTION: Record<VoiceState, string> = {
  IDLE: "Ready when you are — bolo, kya doubt hai?",
  LISTENING: "Listening…",
  TRANSCRIBING: "Catching your words…",
  UNDERSTANDING: "Understanding your doubt…",
  RETRIEVING: "Searching your course lectures…",
  REASONING: "Working out the clearest explanation…",
  RESPONDING: "Let me explain it step by step.",
  CHECKING: "Let's check if you've got it.",
  PRACTICE: "Practice logged — that updates your learning profile.",
  ERROR: "Something interrupted us.",
};

export function TeacherAvatar({ state, speaking }: { state: VoiceState; speaking: boolean }) {
  const activeIndex = STATES.findIndex((s) => s.key === state);

  return (
    <div>
      <div className="floaty relative mx-auto w-fit">
        <div className="absolute inset-0 -m-10 rounded-full bg-amber/15 blur-2xl" aria-hidden />
        <div className="ring-pulse absolute inset-0 -m-4 rounded-full border border-amber/30" aria-hidden />
        <div
          className="ring-pulse absolute inset-0 -m-9 rounded-full border border-rose/20"
          style={{ animationDelay: "1s" }}
          aria-hidden
        />
        <div className="relative grid size-40 place-items-center rounded-full bg-gradient-to-br from-amber/90 via-rose/80 to-rose/60 shadow-[0_0_60px_oklch(0.71_0.153_8/0.35)] sm:size-44">
          <div className="grid size-28 place-items-center rounded-full bg-canvas/30 backdrop-blur-sm sm:size-32">
            <div className="flex h-10 items-end gap-1">
              {[0, 0.15, 0.3, 0.45, 0.2, 0.35, 0.1].map((delay, i) => (
                <span
                  key={i}
                  className={`w-1.5 rounded-full bg-cream/90 ${speaking ? "wave-bar" : ""}`}
                  style={{ animationDelay: `${delay}s`, height: speaking ? undefined : "22%" }}
                  aria-hidden
                />
              ))}
            </div>
          </div>
          <span className="absolute bottom-3 right-3 grid size-8 place-items-center rounded-full bg-canvas/60 font-mono text-[10px] text-amber ring-1 ring-cream/20 backdrop-blur-sm">
            AI
          </span>
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
            Interaction State
          </p>
          <span className="font-display text-[13px] font-bold text-amber">{state}</span>
        </div>
        <div className="flex items-center gap-1" role="img" aria-label={`Pipeline state ${state}`}>
          {STATES.map((s, i) => {
            const reached = activeIndex >= 0 && i <= activeIndex;
            return (
              <div key={s.key} className="flex flex-1 items-center gap-1">
                <div className="flex-1">
                  <div
                    className={`h-1 rounded-full transition-colors duration-500 ${
                      reached ? (i === activeIndex ? "bg-cream" : "bg-amber/70") : "bg-line"
                    }`}
                  />
                </div>
                <span
                  className={`text-[9px] ${
                    i === activeIndex ? "text-cream" : reached ? "text-amber" : "text-muted"
                  }`}
                >
                  {s.short}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 font-display text-[19px] leading-snug text-cream" aria-live="polite">
          {CAPTION[state]}
        </p>
      </div>
    </div>
  );
}
