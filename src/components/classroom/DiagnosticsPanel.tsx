import type { LearningEvent, TutorAnswer } from "@/lib/types";

const STAGES = ["MIC", "STT", "INTENT", "CONTEXT", "RAG", "RERANK", "LLM", "PEDAGOGY", "TTS"];

interface Props {
  answer: TutorAnswer | null;
  events: LearningEvent[];
  activeStage: string | null;
}

export function DiagnosticsPanel({ answer, events, activeStage }: Props) {
  return (
    <div className="rounded-3xl border border-cream/10 bg-surface/40 p-5 backdrop-blur-xl">
      <h2 className="mb-4 font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-muted">
        Pipeline Diagnostics
      </h2>

      <div className="flex flex-wrap gap-1.5">
        {STAGES.map((stage) => (
          <span
            key={stage}
            className={`rounded-md px-2 py-1 font-mono text-[9px] uppercase tracking-widest transition-colors ${
              activeStage === stage
                ? "bg-amber/20 text-amber"
                : "bg-canvas/50 text-muted"
            }`}
          >
            {stage}
          </span>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Speech to text" value={answer?.latency.stt_ms ? `${answer.latency.stt_ms}ms` : "—"} />
        <Stat label="Query parse" value={answer ? `${answer.latency.parse_ms ?? 0}ms` : "—"} />
        <Stat
          label="Retrieval"
          value={
            answer
              ? `${answer.latency.retrieval_ms}ms${answer.latency.retrieval_cached ? " ·c" : ""}`
              : "—"
          }
        />
        <Stat label="Rerank" value={answer ? `${answer.latency.rerank_ms}ms` : "—"} />
        <Stat label="Reasoning" value={answer ? `${answer.latency.llm_ms}ms` : "—"} />
        <Stat label="First text" value={answer?.latency.llm_ttft_ms ? `${answer.latency.llm_ttft_ms}ms` : "—"} />
        <Stat label="First audio" value={answer?.latency.tts_ttfa_ms ? `${answer.latency.tts_ttfa_ms}ms` : "—"} />
        <Stat label="Diagram (bg)" value={answer?.latency.diagram_ms ? `${answer.latency.diagram_ms}ms` : "—"} />
        <Stat label="Practice (bg)" value={answer?.latency.practice_ms ? `${answer.latency.practice_ms}ms` : "—"} />
        <Stat label="End to end" value={answer ? `${answer.latency.total_ms}ms` : "—"} />
      </dl>

      {answer && (
        <p className="mt-3 rounded-lg border border-cream/10 bg-canvas/40 px-2.5 py-1.5 font-mono text-[10px] text-muted">
          Source:{" "}
          <span className={answer.grounded ? "text-mint" : "text-rose"}>
            {answer.grounded ? "course index" : "general knowledge"}
          </span>{" "}
          · mode {answer.mode}
        </p>
      )}

      {answer && answer.evidence.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted">
            Retrieved evidence
          </p>
          <ul className="space-y-1.5">
            {answer.evidence.map((e) => (
              <li
                key={e.chunk.chunk_id}
                className="flex items-center justify-between gap-2 rounded-lg border border-cream/10 bg-canvas/40 px-2.5 py-1.5"
              >
                <span className="truncate text-[11px] text-cream/85">
                  L{e.chunk.lecture_number} · {e.chunk.timestamp_start}
                </span>
                <span className="font-mono text-[10px] text-amber">
                  {Math.round(e.relevance * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted">
          Learning events
        </p>
        {events.length === 0 ? (
          <p className="text-[11px] text-muted">No events yet this session.</p>
        ) : (
          <ul className="max-h-40 space-y-1.5 overflow-y-auto">
            {events.map((event) => (
              <li key={event.id} className="rounded-lg border border-cream/10 bg-canvas/40 p-2">
                <p className="font-mono text-[9px] uppercase tracking-widest text-amber">
                  {event.type}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-cream/80">{event.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-cream/10 bg-canvas/40 p-2.5">
      <dt className="font-mono text-[8px] uppercase tracking-widest text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-[12px] text-cream">{value}</dd>
    </div>
  );
}
