import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/classroom/PageShell";
import { PracticePanel } from "@/components/classroom/PracticePanel";
import { askTutor } from "@/lib/tutor.functions";
import { courseIdFor, loadContext } from "@/lib/learner-context";
import { suggestTopics } from "@/lib/knowledge/corpus";
import type { LearnerContext, PracticeQuestion } from "@/lib/types";

const TITLE = "Practice Arena — Voice Bingo";
const DESCRIPTION =
  "Generate graded practice on any topic in your syllabus — easy, similar and transfer level questions with instant explanations.";

export const Route = createFileRoute("/practice")({
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
  component: PracticePage,
});

function PracticePage() {
  const ask = useServerFn(askTutor);
  const [context, setContext] = useState<LearnerContext | null>(null);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [concept, setConcept] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    setContext(loadContext());
  }, []);

  const topics = useMemo(
    () =>
      suggestTopics({
        class_level: context?.class_level ?? "",
        subjects: context?.subjects ?? [],
        goal: context?.goal ?? "",
      }),
    [context],
  );

  const generate = async (focus: string) => {
    if (!focus.trim()) return;
    setLoading(true);
    setError(null);
    setQuestions([]);
    try {
      const answer = await ask({
        data: {
          question: `Give me graded practice questions on ${focus}.`,
          strategy: "default",
          mode: "practice",
          language: context?.language ?? "adaptive",
          student_name: context?.name ?? "Student",
          class_level: context?.class_level ?? "",
          goal: context?.goal ?? "",
          subjects: context?.subjects ?? [],
          ...(context ? { course_id: courseIdFor(context) } : {}),
          weak_concepts: [],
        },
      });
      setQuestions(answer.practice);
      setConcept(answer.concepts[0] ?? focus);
      if (answer.practice.length === 0) setError("No practice could be generated for that topic.");
    } catch {
      setError("Practice generation failed. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      eyebrow="Active recall"
      title="Practice arena"
      intro="Pick a topic or type your own. Every set is generated live at three levels: easy, similar and transfer."
    >
      <div className="rounded-3xl border border-cream/10 bg-surface/40 p-5 backdrop-blur-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void generate(topic);
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. electric potential, recursion, photosynthesis…"
            aria-label="Practice topic"
            className="w-full rounded-xl border border-cream/12 bg-canvas/50 px-3.5 py-2.5 text-[13px] text-cream outline-none placeholder:text-muted focus:border-amber/50"
          />
          <button
            type="submit"
            disabled={loading || !topic.trim()}
            className="rounded-xl bg-amber px-5 py-2.5 text-[12px] font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Generating…" : "Generate practice"}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {topics.map((t) => (
            <button
              key={`${t.subject}-${t.topic}`}
              type="button"
              disabled={loading}
              onClick={() => {
                setTopic(t.topic);
                void generate(t.topic);
              }}
              className="rounded-full border border-cream/12 bg-canvas/40 px-3 py-1.5 text-[11px] text-cream/85 transition-colors hover:border-amber/40 disabled:opacity-50"
            >
              {t.topic}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-4 text-[13px] text-rose">
            {error}
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <PracticePanel
            questions={questions}
            concept={concept}
            onAttempt={(correct) =>
              setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }))
            }
          />
        </div>
        <aside className="lg:col-span-4">
          <div className="rounded-3xl border border-cream/10 bg-surface/40 p-5 backdrop-blur-xl">
            <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-muted">
              This session
            </h2>
            <p className="mt-4 font-display text-4xl font-bold text-amber">
              {score.correct}
              <span className="text-xl text-muted">/{score.total}</span>
            </p>
            <p className="mt-2 text-[13px] text-muted">
              {score.total === 0
                ? "Attempt a question to start tracking accuracy."
                : `Accuracy ${Math.round((score.correct / score.total) * 100)}%`}
            </p>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
