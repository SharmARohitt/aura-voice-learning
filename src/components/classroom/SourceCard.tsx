import { useEffect, useRef, useState } from "react";
import { resolveReplaySource } from "@/lib/sources.functions";
import type { RetrievedEvidence, SourceResolution } from "@/lib/types";

interface Props {
  evidence: RetrievedEvidence;
  busy: boolean;
  onFollowUp: (text: string) => void;
}

export function SourceCard({ evidence, busy, onFollowUp }: Props) {
  const chunk = evidence.chunk;
  const [resolution, setResolution] = useState<SourceResolution | null>(null);
  const [checking, setChecking] = useState(true);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setResolution(null);
    setChecking(true);
    resolveReplaySource({
      data: {
        chunk_id: chunk.chunk_id,
        subject: chunk.subject,
        chapter: chunk.chapter,
        topic: chunk.topic,
        class_level: chunk.class_level,
        lecture_title: chunk.lecture_title,
        timestamp_start: chunk.timestamp_start,
        timestamp_end: chunk.timestamp_end,
        ...(chunk.source_url ? { source_url: chunk.source_url } : {}),
        relevance: evidence.relevance,
      },
    })
      .then((result) => {
        if (id === requestId.current) setResolution(result);
      })
      .catch(() => {
        if (id === requestId.current) setResolution(null);
      })
      .finally(() => {
        if (id === requestId.current) setChecking(false);
      });
  }, [chunk.chunk_id]);

  const target = resolution?.target ?? null;
  const isPrimary = resolution?.kind === "primary";

  return (
    <section className="rise-in rounded-2xl border border-amber/25 bg-gradient-to-r from-amber/10 to-rose/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-amber">
            Source · Grounded
          </p>
          <p className="text-[13px] font-medium text-cream">
            {chunk.subject} — {chunk.chapter}
          </p>
          <p className="mt-0.5 text-[12px] text-cream/80">
            Lecture {chunk.lecture_number} · {chunk.lecture_title}
          </p>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-muted">
            Topic
          </p>
          <p className="text-[12px] text-cream/90">
            {chunk.topic}
            {chunk.subtopic ? ` · ${chunk.subtopic}` : ""}
          </p>
          <p className="mt-1.5 font-mono text-[11px] text-muted">
            {chunk.timestamp_start} → {chunk.timestamp_end} · {chunk.teacher} · {chunk.class_level}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <span className="font-mono text-[10px] text-amber">
            Relevance {Math.round(evidence.relevance * 100)}%
          </span>

          {checking && (
            <span className="font-mono text-[10px] text-muted">Checking source…</span>
          )}

          {!checking && target && (
            <a
              href={target.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-opacity hover:opacity-90 ${
                isPrimary
                  ? "bg-amber text-canvas"
                  : "border border-amber/40 bg-canvas/40 text-amber"
              }`}
              title={target.title}
            >
              {target.label}
            </a>
          )}

          {!checking && !target && (
            <span className="font-mono text-[10px] text-muted">No verified source link</span>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onFollowUp(
                `Explain what ${chunk.teacher} covers in Lecture ${chunk.lecture_number} at ${chunk.timestamp_start} about ${chunk.topic}.`,
              )
            }
            className="rounded-lg border border-cream/15 bg-canvas/40 px-3 py-1.5 text-[11px] font-medium text-cream disabled:opacity-50"
          >
            Re-teach this segment
          </button>
        </div>
      </div>

      {!checking && resolution && resolution.kind !== "primary" && (
        <p className="mt-3 border-t border-cream/10 pt-2 text-[11px] leading-relaxed text-muted">
          {resolution.reason}
          {target ? " Showing a verified accessible alternative instead." : ""}
          {target?.author ? ` (${target.author})` : ""}
        </p>
      )}

      {!checking && resolution && (
        <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted">
          Source check {resolution.validation_ms}ms
          {resolution.cached ? " · cached" : ""} · usability{" "}
          {Math.round(resolution.source_usability * 100)}%
        </p>
      )}
    </section>
  );
}
