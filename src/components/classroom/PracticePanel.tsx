import { useState } from "react";
import type { PracticeQuestion } from "@/lib/types";

interface Props {
  questions: PracticeQuestion[];
  concept: string | null;
  onAttempt: (correct: boolean, question: string, concept: string | null) => void;
}

const LEVEL_LABEL: Record<PracticeQuestion["level"], string> = {
  easy: "Easy",
  similar: "Similar",
  transfer: "Transfer",
};

export function PracticePanel({ questions, concept, onAttempt }: Props) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const current = questions[index];

  if (!current) {
    return (
      <div className="rounded-3xl border border-cream/10 bg-surface/40 p-5 backdrop-blur-xl">
        <h2 className="mb-2 font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-muted">
          Practice This
        </h2>
        <p className="text-[13px] leading-relaxed text-muted">
          Ask a doubt and practice questions built from that exact explanation appear here.
        </p>
      </div>
    );
  }

  const correct = picked !== null && picked === current.answer_index;

  return (
    <div className="rounded-3xl border border-cream/10 bg-surface/40 p-5 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-muted">
          Practice This
        </h2>
        <span className="font-mono text-[9px] text-rose">{LEVEL_LABEL[current.level]}</span>
      </div>
      <p className="text-[13px] leading-relaxed text-cream/90">{current.question}</p>

      <div className="mt-3 space-y-2">
        {current.options.map((option, i) => {
          const isAnswer = i === current.answer_index;
          const chosen = picked === i;
          const revealed = picked !== null;
          const tone = revealed
            ? isAnswer
              ? "border-mint/40 bg-mint/10 text-mint"
              : chosen
                ? "border-rose/40 bg-rose/10 text-rose"
                : "border-cream/10 bg-canvas/40 text-cream/60"
            : "border-cream/15 bg-canvas/40 text-cream/85 hover:border-amber/50";
          return (
            <button
              key={option + i}
              type="button"
              disabled={revealed}
              onClick={() => {
                setPicked(i);
                onAttempt(isAnswer, current.question, concept);
              }}
              className={`w-full rounded-xl border px-3 py-2.5 text-left text-[12px] transition-colors ${tone}`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className="rise-in mt-3 rounded-xl border border-cream/10 bg-canvas/40 p-3">
          <p
            className={`font-mono text-[10px] uppercase tracking-widest ${
              correct ? "text-mint" : "text-rose"
            }`}
          >
            {correct ? "Correct" : "Not quite"}
          </p>
          <p className="mt-1 text-[12px] leading-snug text-cream/85">{current.explanation}</p>
          {index < questions.length - 1 && (
            <button
              type="button"
              onClick={() => {
                setIndex(index + 1);
                setPicked(null);
              }}
              className="mt-2.5 rounded-lg bg-amber px-3 py-1.5 text-[11px] font-semibold text-canvas"
            >
              Next question
            </button>
          )}
        </div>
      )}
    </div>
  );
}
