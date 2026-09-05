import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/classroom/PageShell";
import { CORPUS, indexedSubjects } from "@/lib/knowledge/corpus";

const TITLE = "Learning Library — Voice Bingo";
const DESCRIPTION =
  "Browse every indexed lecture moment by subject, chapter and concept, then jump straight into the classroom to ask about it out loud.";

export const Route = createFileRoute("/learning")({
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
  component: LearningPage,
});

function LearningPage() {
  const subjects = useMemo(() => indexedSubjects(), []);
  const [subject, setSubject] = useState<string>("All");
  const [query, setQuery] = useState("");

  const chunks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CORPUS.filter((c) => c.approval_status === "approved")
      .filter((c) => subject === "All" || c.subject === subject)
      .filter(
        (c) =>
          !q ||
          c.topic.toLowerCase().includes(q) ||
          c.chapter.toLowerCase().includes(q) ||
          c.concepts.some((concept) => concept.includes(q)),
      );
  }, [subject, query]);

  return (
    <PageShell
      eyebrow="Knowledge index"
      title="Learning library"
      intro="Every approved lecture chunk the tutor can ground an answer in — searchable by chapter, topic and concept."
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-cream/10 bg-surface/40 p-3 backdrop-blur-xl sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {["All", ...subjects].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSubject(s)}
              aria-pressed={subject === s}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                subject === s
                  ? "border-amber/50 bg-amber/15 text-amber"
                  : "border-cream/12 bg-canvas/40 text-cream/85 hover:border-amber/40"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search topics or concepts…"
          aria-label="Search the learning library"
          className="w-full rounded-xl border border-cream/12 bg-canvas/50 px-3 py-2 text-[13px] text-cream outline-none placeholder:text-muted focus:border-amber/50 sm:ml-auto sm:max-w-xs"
        />
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted">
        {chunks.length} lecture moments
      </p>

      <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {chunks.map((c) => (
          <article
            key={c.chunk_id}
            className="flex flex-col rounded-3xl border border-cream/10 bg-surface/40 p-5 backdrop-blur-xl transition-colors hover:border-amber/35"
          >
            <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-muted">
              <span>
                {c.subject} · {c.class_level}
              </span>
              <span className="text-amber">{c.difficulty}</span>
            </div>
            <h2 className="mt-2 font-display text-[15px] font-semibold leading-snug">{c.topic}</h2>
            <p className="mt-1 text-[12px] text-muted">
              {c.chapter} · Lecture {c.lecture_number} · {c.teacher}
            </p>
            <p className="mt-3 line-clamp-4 text-[13px] leading-relaxed text-cream/80">{c.text}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.concepts.slice(0, 4).map((concept) => (
                <span
                  key={concept}
                  className="rounded-full border border-cream/12 bg-canvas/40 px-2.5 py-1 text-[10px] text-cream/75"
                >
                  {concept}
                </span>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted">
                {c.timestamp_start}–{c.timestamp_end}
              </span>
              <Link
                to="/"
                search={{ ask: `Explain ${c.topic} from ${c.chapter}` }}
                className="rounded-lg bg-amber px-3 py-1.5 text-[11px] font-semibold text-canvas transition-opacity hover:opacity-90"
              >
                Ask about this
              </Link>
            </div>
          </article>
        ))}
      </div>

      {chunks.length === 0 && (
        <p className="mt-8 text-[14px] text-muted">
          Nothing indexed for that search yet — try another topic or subject.
        </p>
      )}
    </PageShell>
  );
}
