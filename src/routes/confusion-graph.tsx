import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/classroom/PageShell";
import { CORPUS, indexedSubjects } from "@/lib/knowledge/corpus";

const TITLE = "Confusion Graph — Voice Bingo";
const DESCRIPTION =
  "See how concepts connect to their prerequisites, which links break most often, and where a doubt actually starts.";

export const Route = createFileRoute("/confusion-graph")({
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
  component: ConfusionGraphPage,
});

interface Node {
  topic: string;
  subject: string;
  chapter: string;
  prerequisites: string[];
  concepts: string[];
  weight: number;
}

function buildGraph(subject: string): Node[] {
  const map = new Map<string, Node>();
  for (const c of CORPUS) {
    if (c.approval_status !== "approved") continue;
    if (subject !== "All" && c.subject !== subject) continue;
    const existing = map.get(c.topic);
    if (existing) {
      existing.prerequisites = [...new Set([...existing.prerequisites, ...c.prerequisites])];
      existing.concepts = [...new Set([...existing.concepts, ...c.concepts])];
      existing.weight += 1;
      continue;
    }
    map.set(c.topic, {
      topic: c.topic,
      subject: c.subject,
      chapter: c.chapter,
      prerequisites: [...c.prerequisites],
      concepts: [...c.concepts],
      weight: 1,
    });
  }
  return [...map.values()].sort((a, b) => b.prerequisites.length - a.prerequisites.length);
}

function ConfusionGraphPage() {
  const subjects = useMemo(() => indexedSubjects(), []);
  const [subject, setSubject] = useState("All");
  const nodes = useMemo(() => buildGraph(subject), [subject]);
  const [selected, setSelected] = useState<string | null>(null);
  const active = nodes.find((n) => n.topic === selected) ?? nodes[0] ?? null;

  return (
    <PageShell
      eyebrow="Learning intelligence"
      title="Confusion graph"
      intro="Concepts are nodes, prerequisites are edges. Pick a node to see what has to be solid before it, and jump into that repair directly."
    >
      <div className="flex flex-wrap gap-1.5">
        {["All", ...subjects].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setSubject(s);
              setSelected(null);
            }}
            aria-pressed={subject === s}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
              subject === s
                ? "border-rose/50 bg-rose/15 text-rose"
                : "border-cream/12 bg-canvas/40 text-cream/85 hover:border-rose/40"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <div className="rounded-3xl border border-cream/10 bg-surface/40 p-5 backdrop-blur-xl">
            <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-muted">
              Concept nodes
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {nodes.map((n) => {
                const isActive = active?.topic === n.topic;
                const risk = Math.min(100, 35 + n.prerequisites.length * 18);
                return (
                  <button
                    key={n.topic}
                    type="button"
                    onClick={() => setSelected(n.topic)}
                    aria-pressed={isActive}
                    className={`group rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
                      isActive
                        ? "border-amber/50 bg-amber/12"
                        : "border-cream/12 bg-canvas/40 hover:border-amber/40"
                    }`}
                  >
                    <span className="block text-[13px] font-medium text-cream">{n.topic}</span>
                    <span className="mt-1 block font-mono text-[9px] uppercase tracking-widest text-muted">
                      {n.subject} · risk {risk}%
                    </span>
                    <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-canvas/70">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-amber to-rose"
                        style={{ width: `${risk}%` }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="lg:col-span-5">
          <div className="rounded-3xl border border-cream/10 bg-surface/40 p-5 backdrop-blur-xl">
            {active ? (
              <>
                <h2 className="font-display text-lg font-semibold">{active.topic}</h2>
                <p className="mt-1 text-[12px] text-muted">
                  {active.subject} · {active.chapter}
                </p>

                <h3 className="mt-5 font-mono text-[10px] uppercase tracking-widest text-muted">
                  Prerequisite edges
                </h3>
                <ul className="mt-2 space-y-2">
                  {active.prerequisites.length === 0 && (
                    <li className="text-[13px] text-muted">Foundational node — no prerequisites.</li>
                  )}
                  {active.prerequisites.map((p) => (
                    <li
                      key={p}
                      className="flex items-center justify-between rounded-xl border border-cream/10 bg-canvas/40 px-3 py-2"
                    >
                      <span className="text-[13px] text-cream/85">{p}</span>
                      <Link
                        to="/"
                        search={{ ask: `Revise the basics of ${p} before ${active.topic}` }}
                        className="font-mono text-[10px] uppercase tracking-widest text-amber hover:underline"
                      >
                        Repair
                      </Link>
                    </li>
                  ))}
                </ul>

                <h3 className="mt-5 font-mono text-[10px] uppercase tracking-widest text-muted">
                  Linked concepts
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {active.concepts.slice(0, 8).map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-cream/12 bg-canvas/40 px-2.5 py-1 text-[10px] text-cream/75"
                    >
                      {c}
                    </span>
                  ))}
                </div>

                <Link
                  to="/"
                  search={{ ask: `Explain ${active.topic} and check where I am confused` }}
                  className="mt-6 inline-flex rounded-xl bg-amber px-4 py-2 text-[12px] font-semibold text-canvas transition-opacity hover:opacity-90"
                >
                  Clear this confusion
                </Link>
              </>
            ) : (
              <p className="text-[13px] text-muted">No nodes indexed for this subject yet.</p>
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
