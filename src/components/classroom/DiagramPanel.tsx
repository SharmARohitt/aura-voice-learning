import { lazy, Suspense, useState } from "react";
import type { DiagramSpec } from "@/lib/diagram/spec";

/** React Flow is only pulled in when a diagram actually exists. */
const DiagramCanvas = lazy(() => import("@/components/classroom/DiagramCanvas"));

interface Props {
  spec: DiagramSpec | null;
  pending: boolean;
  activeNodeIds: string[];
}

export function DiagramPanel({ spec, pending, activeNodeIds }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (!spec) {
    if (!pending) return null;
    return (
      <aside data-diagram="pending" className="editorial-surface rise-in rounded-lg p-4">
        <p className="font-mono text-[9px] uppercase tracking-widest text-amber">Visual</p>
        <div className="mt-3 space-y-2" aria-hidden>
          <div className="h-8 animate-pulse rounded-lg bg-cream/5" />
          <div className="mx-auto h-5 w-4 animate-pulse rounded bg-cream/5" />
          <div className="h-8 animate-pulse rounded-lg bg-cream/5" />
        </div>
        <p className="mt-3 text-[10px] text-muted">Drawing it out…</p>
      </aside>
    );
  }

  const height = expanded ? 420 : 240;

  return (
    <aside
      data-diagram="ready"
      className="editorial-surface rise-in overflow-hidden rounded-lg"
      aria-label={`Diagram: ${spec.title}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-cream/10 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-widest text-amber">Visual</p>
          <p className="truncate font-display text-[12px] text-cream">{spec.title}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {!collapsed && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-lg border border-cream/15 bg-surface/50 px-2 py-1 text-[10px] text-cream/80 transition-colors hover:border-amber/40 hover:text-amber"
            >
              {expanded ? "Shrink" : "Expand"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-lg border border-cream/15 bg-surface/50 px-2 py-1 text-[10px] text-cream/80 transition-colors hover:border-amber/40 hover:text-amber"
          >
            {collapsed ? "Show" : "Hide"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <Suspense
          fallback={
            <div className="p-4 text-[10px] text-muted" style={{ height }}>
              Preparing visual…
            </div>
          }
        >
          <DiagramCanvas spec={spec} activeNodeIds={activeNodeIds} height={height} />
        </Suspense>
      )}
    </aside>
  );
}
