import { useState } from "react";
import { CLASS_LEVELS, GOALS, LANGUAGES, SUBJECTS } from "@/lib/learner-context";
import type { LanguagePref, LearnerContext } from "@/lib/types";

const STEPS = ["You", "Class", "Goal", "Subjects", "Language"];

export function Onboarding({ onDone }: { onDone: (context: LearnerContext) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [classLevel, setClassLevel] = useState<string>("Class 12");
  const [goal, setGoal] = useState<string>("JEE");
  const [subjects, setSubjects] = useState<string[]>(["Physics"]);
  const [language, setLanguage] = useState<LanguagePref>("hinglish");

  const canContinue =
    (step === 0 && name.trim().length > 0) || (step === 3 ? subjects.length > 0 : step > 0);

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    onDone({
      name: name.trim() || "Student",
      class_level: classLevel,
      goal,
      subjects,
      language,
      onboarded_at: new Date().toISOString(),
    });
  };

  const toggleSubject = (s: string) =>
    setSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-canvas px-4 py-10 text-cream">
      <div
        className="pointer-events-none absolute -left-32 top-0 size-[520px] rounded-full bg-amber/15 blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-32 bottom-0 size-[520px] rounded-full bg-rose/15 blur-[120px]"
        aria-hidden
      />

      <div className="relative w-full max-w-xl rounded-3xl border border-cream/10 bg-surface/50 p-6 backdrop-blur-xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-amber to-rose font-display text-sm font-bold text-canvas">
            VB
          </div>
          <div>
            <h1 className="font-display text-[18px] font-bold leading-none">Voice Bingo · Aura</h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              Set up your learning profile
            </p>
          </div>
        </div>

        <ol className="mb-7 flex gap-1.5" aria-label="Onboarding progress">
          {STEPS.map((label, i) => (
            <li key={label} className="flex-1">
              <div
                className={`h-1 rounded-full transition-colors ${
                  i <= step ? "bg-gradient-to-r from-amber to-rose" : "bg-line"
                }`}
              />
              <span
                className={`mt-1.5 block font-mono text-[9px] uppercase tracking-widest ${
                  i === step ? "text-amber" : "text-muted"
                }`}
              >
                {label}
              </span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <Field title="Aapka naam kya hai?" hint="So Aura can teach you by name.">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canContinue && next()}
              placeholder="e.g. Aarav"
              className="w-full rounded-xl border border-cream/15 bg-canvas/50 px-4 py-3 text-[15px] text-cream placeholder:text-muted focus-visible:outline-2 focus-visible:outline-amber"
            />
          </Field>
        )}

        {step === 1 && (
          <Field title="Which class are you in?" hint="Retrieval is filtered to your level.">
            <Chips options={[...CLASS_LEVELS]} selected={[classLevel]} onSelect={setClassLevel} />
          </Field>
        )}

        {step === 2 && (
          <Field title="What are you preparing for?" hint="Changes exam framing and difficulty.">
            <Chips options={[...GOALS]} selected={[goal]} onSelect={setGoal} />
          </Field>
        )}

        {step === 3 && (
          <Field title="Which subjects?" hint="Pick one or more — you can ask beyond them too.">
            <Chips options={[...SUBJECTS]} selected={subjects} onSelect={toggleSubject} multi />
          </Field>
        )}

        {step === 4 && (
          <Field title="Preferred language?" hint="You can change this any time by just saying so.">
            <div className="grid gap-2 sm:grid-cols-2">
              {LANGUAGES.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => setLanguage(l.key)}
                  className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                    language === l.key
                      ? "border-amber/50 bg-amber/10"
                      : "border-cream/12 bg-canvas/40 hover:border-amber/40"
                  }`}
                >
                  <span className="block font-display text-[15px] text-cream">{l.label}</span>
                  <span className="mt-0.5 block text-[11px] text-muted">{l.hint}</span>
                </button>
              ))}
            </div>
          </Field>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-xl border border-cream/15 px-4 py-2.5 text-[12px] font-medium text-cream/80 disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            onClick={next}
            disabled={!canContinue}
            className="rounded-xl bg-gradient-to-r from-amber to-rose px-6 py-2.5 text-[13px] font-semibold text-canvas disabled:opacity-50"
          >
            {step === STEPS.length - 1 ? "Enter classroom" : "Continue"}
          </button>
        </div>
      </div>
    </main>
  );
}

function Field({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rise-in">
      <h2 className="font-display text-[21px] font-semibold text-cream">{title}</h2>
      <p className="mb-4 mt-1 text-[12px] text-muted">{hint}</p>
      {children}
    </div>
  );
}

function Chips({
  options,
  selected,
  onSelect,
  multi,
}: {
  options: string[];
  selected: string[];
  onSelect: (value: string) => void;
  multi?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role={multi ? "group" : "radiogroup"}>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(option)}
            className={`rounded-full border px-4 py-2 text-[13px] font-medium transition-colors ${
              active
                ? "border-amber/50 bg-amber/15 text-amber"
                : "border-cream/15 bg-canvas/40 text-cream hover:border-amber/40"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
