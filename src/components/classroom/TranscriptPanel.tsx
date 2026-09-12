import type { TutorAnswer } from "@/lib/types";

interface Props {
  question: string;
  partial: string;
  listening: boolean;
  answer: TutorAnswer | null;
}

function highlight(text: string, concepts: string[]) {
  if (concepts.length === 0) return text;
  const escaped = concepts
    .filter((c) => c.length > 2)
    .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return text;
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return parts.map((part, i) =>
    escaped.some((c) => new RegExp(`^${c}$`, "i").test(part)) ? (
      <span key={i} className="rounded bg-amber/20 px-1 text-amber">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function TranscriptPanel({ question, partial, listening, answer }: Props) {
  const spoken = partial || question;
  const concepts = answer?.concepts ?? [];

  return (
    <div className="editorial-surface rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-muted">
          Live Transcript
        </h2>
        {listening && (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-rose">
            <span className="size-1.5 animate-pulse rounded-full bg-rose" aria-hidden />
            REC
          </span>
        )}
      </div>

      <div className="space-y-4" aria-live="polite">
        {spoken ? (
          <div className="rise-in rounded-2xl border border-amber/15 bg-amber/8 p-4">
            <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-amber">
              Student{answer ? ` · ${answer.language}` : partial ? " · live" : ""}
            </p>
            <p className="text-[14px] leading-relaxed text-cream">
              {highlight(spoken, concepts)}
              {partial && <span className="ml-0.5 animate-pulse text-amber">▍</span>}
            </p>
          </div>
        ) : (
          <p className="rounded-2xl border border-cream/10 bg-canvas/40 p-4 text-[13px] leading-relaxed text-muted">
            Press the mic and ask your doubt out loud — Hinglish, Hindi or English. Your words
            appear here as you speak.
          </p>
        )}

        {answer?.grounded && (
          <div className="rise-in rounded-2xl border border-rose/15 bg-rose/8 p-4">
            <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-rose">
              Aura · Instructor
            </p>
            <p className="text-[14px] leading-relaxed text-cream/90">{answer.short_answer}</p>
          </div>
        )}
      </div>

      {answer?.grounded && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Meta label="Intent" value={answer.intent} />
            <Meta label="Language" value={answer.language} />
            <Meta
              label="Confidence"
              value={`${Math.round(answer.intent_confidence * 100)}%`}
              accent
            />
          </div>

          {answer.misconception && (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose/20 bg-rose/8 p-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-rose/20 text-[11px] font-bold text-rose">
                !
              </span>
              <div>
                <p className="text-[11px] font-medium text-rose">
                  Possible misconception detected ·{" "}
                  {Math.round(answer.misconception.confidence * 100)}% confidence
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">
                  {answer.misconception.likely_misconception}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted">
                  Prerequisite to revisit: {answer.misconception.prerequisite}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Meta({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-cream/10 bg-canvas/40 p-2.5">
      <p className="font-mono text-[8px] uppercase tracking-widest text-muted">{label}</p>
      <p
        className={`mt-1 text-[11px] font-medium capitalize ${accent ? "text-amber" : "text-cream"}`}
      >
        {value}
      </p>
    </div>
  );
}
