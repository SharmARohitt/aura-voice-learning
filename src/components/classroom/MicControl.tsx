import { useState, type FormEvent } from "react";
import { Mic, Square, ArrowUp } from "lucide-react";
import type { VoiceState } from "@/lib/types";

interface Props {
  state: VoiceState;
  listening: boolean;
  speaking: boolean;
  sttMode: "streaming" | "recorded" | "unavailable";
  latencyMs: number | null;
  onStart: () => void;
  onStop: () => void;
  onTyped: (text: string) => void;
}

/** Presentational only — all voice behaviour stays in useVoiceSession. */
export function MicControl({
  state,
  listening,
  speaking,
  sttMode,
  latencyMs,
  onStart,
  onStop,
  onTyped,
}: Props) {
  const [typed, setTyped] = useState("");
  const busy = ["UNDERSTANDING", "RETRIEVING", "REASONING"].includes(state);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = typed.trim();
    if (!text || busy) return;
    setTyped("");
    onTyped(text);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5">
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={listening ? onStop : onStart}
          disabled={sttMode === "unavailable" || busy}
          aria-pressed={listening}
          aria-label={listening ? "Stop listening" : "Start listening"}
          className="group relative grid size-16 place-items-center rounded-full bg-forest text-paper shadow-[0_10px_35px_-15px_var(--forest)] transition-[transform,opacity] duration-300 ease-out hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber disabled:opacity-40 disabled:hover:scale-100"
        >
          {listening && (
            <>
              <span className="ring-pulse absolute inset-0 rounded-full border border-amber/60" aria-hidden />
              <span
                className="ring-pulse absolute inset-[-8px] rounded-full border border-rose/30"
                style={{ animationDelay: "0.8s" }}
                aria-hidden
              />
            </>
          )}
          <span className="absolute inset-0 rounded-full bg-amber/10 opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100" aria-hidden />
          {listening ? (
            <Square className="relative size-4 fill-paper text-paper" aria-hidden />
          ) : (
            <Mic className="relative size-5 text-paper" aria-hidden />
          )}
        </button>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
          {sttMode === "unavailable"
            ? "Mic offline — type below"
            : listening
              ? "Tap to send"
              : speaking
                ? "Speaking — tap to interrupt"
                : "Tap to speak"}
        </p>
      </div>

      <form onSubmit={submit} className="editorial-surface flex w-full items-center gap-2 rounded-lg p-2 transition-colors focus-within:border-amber/50">
        <label htmlFor="typed-doubt" className="sr-only">
          Type your doubt
        </label>
        <input
          id="typed-doubt"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="…or type your doubt"
          className="flex-1 bg-transparent px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || typed.trim().length === 0}
          aria-label="Ask"
          className="grid size-9 shrink-0 place-items-center rounded-md bg-forest text-paper transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
      </form>

      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
        {sttMode === "unavailable" ? (
          <span className="text-rose">Voice unavailable</span>
        ) : (
          <span className="text-mint">Voice online</span>
        )}
        <span className="mx-2 text-line">·</span>
        Last answer <span className="text-amber">{latencyMs ? `${latencyMs} ms` : "—"}</span>
      </p>
    </div>
  );
}
