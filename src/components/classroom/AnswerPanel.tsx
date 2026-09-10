import { SourceCard } from "@/components/classroom/SourceCard";
import type { TeachingStrategy, TutorAnswer } from "@/lib/types";

const STRATEGIES: { key: TeachingStrategy; label: string }[] = [
  { key: "simple_hindi", label: "Simple Hindi" },
  { key: "analogy", label: "Analogy" },
  { key: "example", label: "Example" },
  { key: "formula_first", label: "Formula First" },
  { key: "exam_mode", label: "Exam Mode" },
  { key: "step_by_step", label: "Step-by-Step" },
];

interface Props {
  answer: TutorAnswer;
  busy: boolean;
  onStrategy: (strategy: TeachingStrategy) => void;
  onFollowUp: (text: string) => void;
  onQuizMe: () => void;
  onEscalate: () => void;
}

export function AnswerPanel({
  answer,
  busy,
  onStrategy,
  onFollowUp,
  onQuizMe,
  onEscalate,
}: Props) {
  const top = answer.evidence[0];

  return (
    <div className="mt-6 space-y-3">
      {!answer.grounded && (
        <section className="rise-in rounded-2xl border border-rose/25 bg-rose/8 p-4">
          <p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-rose">
            General knowledge · outside your course
          </p>
          <p className="text-[12px] leading-relaxed text-muted">
            {answer.fallback_reason ??
              "This topic isn't in your uploaded course material, so it was answered from general knowledge."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onFollowUp(`${answer.short_answer ? "Explain again more simply: " : ""}${answer.chapter || answer.subject}`)}
              className="rounded-lg border border-cream/15 bg-canvas/40 px-3 py-1.5 text-[11px] font-medium text-cream disabled:opacity-50"
            >
              Ask differently
            </button>
            <button
              type="button"
              onClick={onEscalate}
              className="rounded-lg bg-amber px-3 py-1.5 text-[11px] font-semibold text-canvas"
            >
              Send to teacher
            </button>
          </div>
        </section>
      )}
      <section className="rise-in rounded-2xl border border-cream/10 bg-canvas/40 p-4">
        <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-amber">
          Short Answer
        </p>
        <p className="text-[13px] leading-relaxed text-cream/90">{answer.short_answer}</p>
      </section>

      {answer.sections.map((section, i) => (
        <section
          key={section.label + i}
          className="rise-in rounded-2xl border border-cream/10 bg-canvas/40 p-4"
          style={{ animationDelay: `${80 * (i + 1)}ms` }}
        >
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-amber">
            {section.label}
          </p>
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-cream/90">
            {section.body}
          </p>
        </section>
      ))}

      {answer.formula && (
        <section className="rise-in rounded-2xl border border-cream/10 bg-canvas/40 p-4">
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-rose">Formula</p>
          <p className="font-mono text-[14px] text-cream">{answer.formula}</p>
        </section>
      )}

      {top && <SourceCard evidence={top} busy={busy} onFollowUp={onFollowUp} />}

      <div className="mt-5">
        <p className="mb-2.5 font-mono text-[9px] uppercase tracking-widest text-muted">
          Explain Differently
        </p>
        <div className="flex flex-wrap gap-2">
          {STRATEGIES.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={busy}
              onClick={() => onStrategy(s.key)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                answer.answer_strategy === s.key
                  ? "border-amber/40 bg-amber/10 text-amber"
                  : "border-cream/15 bg-canvas/40 text-cream hover:border-amber/50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {answer.check_question && (
        <section className="rise-in mt-5 rounded-2xl border border-cream/10 bg-canvas/40 p-4">
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-amber">
            Check Your Understanding
          </p>
          <p className="text-[14px] leading-relaxed text-cream">{answer.check_question}</p>
        </section>
      )}

      {answer.suggested_next.length > 0 && (
        <div className="mt-5">
          <p className="mb-2.5 font-mono text-[9px] uppercase tracking-widest text-muted">
            What next
          </p>
          <div className="flex flex-wrap gap-2">
            {answer.suggested_next.map((topic) => (
              <button
                key={topic}
                type="button"
                disabled={busy}
                onClick={() => onFollowUp(`Teach me ${topic}`)}
                className="rounded-full border border-cream/15 bg-canvas/40 px-3 py-1.5 text-[11px] text-cream transition-colors hover:border-amber/50 hover:text-amber disabled:opacity-50"
              >
                {topic}
              </button>
            ))}
          </div>
        </div>
      )}

      <section className="mt-5 rounded-2xl border border-cream/10 bg-canvas/40 p-4">
        <p className="mb-3 font-display text-[13px] text-cream">Did this make sense?</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => onFollowUp(`I understood: ${answer.short_answer}. What comes next?`)}
            className="rounded-xl border border-mint/30 bg-mint/15 px-2 py-2 text-[11px] font-semibold text-mint disabled:opacity-50"
          >
            YES
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onStrategy("simple_hindi")}
            className="rounded-xl border border-cream/10 bg-canvas/40 px-2 py-2 text-[11px] font-medium text-cream/80 disabled:opacity-50"
          >
            Explain Again
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onStrategy("example")}
            className="rounded-xl border border-cream/10 bg-canvas/40 px-2 py-2 text-[11px] font-medium text-cream/80 disabled:opacity-50"
          >
            Example
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onQuizMe}
            className="rounded-xl border border-cream/10 bg-canvas/40 px-2 py-2 text-[11px] font-medium text-cream/80 disabled:opacity-50"
          >
            Quiz Me
          </button>
        </div>
      </section>
    </div>
  );
}
