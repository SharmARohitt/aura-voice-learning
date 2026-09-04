import type { LearnerContext } from "@/lib/types";

export type HubAction = "ask" | "study" | "test" | "revise" | "practice";

const ACTIONS: { key: HubAction; title: string; hint: string; glyph: string }[] = [
  { key: "ask", title: "Ask Anything", glyph: "?", hint: "Bolo apna doubt — voice ya type" },
  { key: "study", title: "Study a Topic", glyph: "▤", hint: "Full explanation from your course" },
  { key: "test", title: "Test Me", glyph: "✓", hint: "Exam-style questions, instant feedback" },
  { key: "revise", title: "Revise", glyph: "↻", hint: "Rapid recall of key points" },
  { key: "practice", title: "Practice", glyph: "∑", hint: "Graded practice set with hints" },
];

interface Props {
  context: LearnerContext;
  topics: { subject: string; chapter: string; topic: string }[];
  onAction: (action: HubAction, topic?: string) => void;
  onEditProfile: () => void;
}

export function WelcomeHub({ context, topics, onAction, onEditProfile }: Props) {
  return (
    <section className="rise-in rounded-3xl border border-cream/10 bg-surface/40 p-6 backdrop-blur-xl sm:p-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
        {context.class_level} · {context.goal} · {context.subjects.join(" / ")}
      </p>
      <h2 className="mt-3 font-display text-[28px] font-bold leading-tight text-cream sm:text-[34px]">
        Welcome, {context.name} —{" "}
        <span className="bg-gradient-to-r from-amber to-rose bg-clip-text text-transparent">
          aaj kya padhna hai?
        </span>
      </h2>
      <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted">
        Pick a way to start, or just hit the mic and speak your doubt in Hindi, English or
        Hinglish. Everything below is live — no dead buttons.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => onAction(a.key)}
            className="group rounded-2xl border border-cream/12 bg-canvas/40 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-amber/50 hover:bg-amber/8 focus-visible:outline-2 focus-visible:outline-amber"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-amber/80 to-rose/70 font-display text-[15px] text-canvas">
              {a.glyph}
            </span>
            <span className="mt-3 block font-display text-[15px] font-semibold text-cream">
              {a.title}
            </span>
            <span className="mt-1 block text-[11.5px] leading-snug text-muted">{a.hint}</span>
          </button>
        ))}
      </div>

      {topics.length > 0 && (
        <div className="mt-6">
          <p className="mb-2.5 font-mono text-[10px] uppercase tracking-widest text-muted">
            Suggested for you
          </p>
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <button
                key={`${t.subject}-${t.topic}`}
                type="button"
                onClick={() => onAction("study", `${t.topic} (${t.subject} · ${t.chapter})`)}
                className="rounded-full border border-cream/15 bg-canvas/40 px-3.5 py-1.5 text-[12px] text-cream transition-colors hover:border-amber/50 hover:text-amber"
              >
                {t.topic}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onEditProfile}
        className="mt-6 font-mono text-[10px] uppercase tracking-widest text-muted underline-offset-4 hover:text-amber hover:underline"
      >
        Change class, goal or language
      </button>
    </section>
  );
}
