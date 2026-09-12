import type { LearnerProfile, TutorAnswer } from "@/lib/types";

interface Props {
  learner: LearnerProfile;
  answer: TutorAnswer | null;
  weakConcepts: string[];
}

export function ContextPanel({ learner, answer, weakConcepts }: Props) {
  return (
    <div className="border-t border-line pt-6">
      <h2 className="mb-4 font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-muted">
        Learning Context
      </h2>
      <dl className="space-y-3">
        <Row label="Course" value={answer?.subject || learner.course} />
        <Row label="Chapter" value={answer?.chapter || learner.chapter} />
        <Row label="Lecture" value={learner.lecture} accent />
        <Row label="Prerequisite" value={answer?.prerequisite || learner.prerequisite} />
      </dl>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Mastery
          </span>
          <span className="font-mono text-[12px] text-amber">{learner.mastery[0]!.score}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-canvas/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber to-rose transition-[width] duration-700"
            style={{ width: `${learner.mastery[0]!.score}%` }}
          />
        </div>
        <div className="mt-3 space-y-2.5">
          {learner.mastery.slice(1).map((m) => (
            <div key={m.concept}>
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="text-cream/80">{m.concept}</span>
                <span className="font-mono text-muted">{m.score}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-canvas/60">
                <div
                  className="h-full rounded-full bg-mint/70"
                  style={{ width: `${m.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {weakConcepts.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted">
            Weak topics
          </p>
          <ul className="space-y-1.5">
            {weakConcepts.map((c) => (
              <li
                key={c}
                className="rounded-lg border border-rose/20 bg-rose/8 px-2.5 py-1.5 text-[11px] text-cream/85"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</dt>
      <dd
        className={`text-right text-[13px] font-medium ${accent ? "text-amber" : "text-cream"}`}
      >
        {value}
      </dd>
    </div>
  );
}
