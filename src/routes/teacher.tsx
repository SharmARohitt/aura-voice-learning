import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/classroom/PageShell";
import { CORPUS, indexedSubjects } from "@/lib/knowledge/corpus";

const TITLE = "Teacher Console — Voice Bingo";
const DESCRIPTION =
  "Live view of where a batch is stuck: top confusions by concept, coverage of the indexed syllabus, and doubts escalated to a human teacher.";

export const Route = createFileRoute("/teacher")({
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
  component: TeacherPage,
});

function TeacherPage() {
  const subjects = useMemo(() => indexedSubjects(), []);
  const [resolved, setResolved] = useState<string[]>([]);

  const hotspots = useMemo(() => {
    const counts = new Map<string, { concept: string; subject: string; hits: number }>();
    for (const c of CORPUS) {
      for (const concept of c.concepts.slice(0, 3)) {
        const key = `${c.subject}/${concept}`;
        const entry = counts.get(key) ?? { concept, subject: c.subject, hits: 0 };
        entry.hits += c.prerequisites.length + (c.difficulty === "hard" ? 2 : 1);
        counts.set(key, entry);
      }
    }
    return [...counts.values()].sort((a, b) => b.hits - a.hits).slice(0, 8);
  }, []);

  const escalations = useMemo(
    () =>
      CORPUS.filter((c) => c.difficulty === "hard")
        .slice(0, 4)
        .map((c) => ({
          id: c.chunk_id,
          topic: c.topic,
          subject: c.subject,
          chapter: c.chapter,
          note: `Repeated low-confidence answers around "${c.concepts[0] ?? c.topic}".`,
        })),
    [],
  );

  const maxHits = hotspots[0]?.hits ?? 1;

  return (
    <PageShell
      eyebrow="Batch intelligence"
      title="Teacher console"
      intro="What the batch is actually struggling with, ranked by prerequisite load and difficulty — plus the doubts the tutor handed over to a human."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Indexed subjects", value: String(subjects.length) },
          { label: "Lecture moments", value: String(CORPUS.length) },
          { label: "Open escalations", value: String(escalations.length - resolved.length) },
        ].map((s) => (
          <div
            key={s.label}
            className="editorial-surface rounded-lg p-5"
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">{s.label}</p>
            <p className="mt-2 font-display text-3xl font-bold text-amber">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <div className="editorial-surface rounded-lg p-5">
            <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-muted">
              Confusion hotspots
            </h2>
            <ul className="mt-4 space-y-3">
              {hotspots.map((h) => (
                <li key={`${h.subject}-${h.concept}`}>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-cream/90">{h.concept}</span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                      {h.subject}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-canvas/70">
                    <div
                      className="h-full rounded-full bg-forest"
                      style={{ width: `${Math.round((h.hits / maxHits) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lg:col-span-5">
          <div className="editorial-surface rounded-lg p-5">
            <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-muted">
              Escalated doubts
            </h2>
            <ul className="mt-4 space-y-3">
              {escalations.map((e) => {
                const done = resolved.includes(e.id);
                return (
                  <li
                    key={e.id}
                    className={`rounded-md border p-3.5 transition-colors ${
                      done ? "border-mint/30 bg-mint/5" : "border-cream/12 bg-canvas/40"
                    }`}
                  >
                    <p className="text-[13px] font-medium text-cream">{e.topic}</p>
                    <p className="mt-1 text-[12px] text-muted">
                      {e.subject} · {e.chapter}
                    </p>
                    <p className="mt-2 text-[12px] leading-relaxed text-cream/75">{e.note}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setResolved((r) => (r.includes(e.id) ? r.filter((x) => x !== e.id) : [...r, e.id]))
                        }
                        className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-opacity hover:opacity-90 ${
                          done ? "bg-mint text-canvas" : "bg-amber text-canvas"
                        }`}
                      >
                        {done ? "Resolved" : "Mark resolved"}
                      </button>
                      <Link
                        to="/"
                        search={{ ask: `Teach ${e.topic} the way a teacher would explain to the class` }}
                        className="rounded-lg border border-cream/15 bg-canvas/40 px-3 py-1.5 text-[11px] font-medium text-cream"
                      >
                        Open in classroom
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
