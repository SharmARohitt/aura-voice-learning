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
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={listening ? onStop : onStart}
          disabled={sttMode === "unavailable" || busy}
          aria-pressed={listening}
          aria-label={listening ? "Stop listening" : "Start listening"}
          className="group relative grid size-14 place-items-center rounded-full border border-amber/30 bg-surface/60 backdrop-blur-xl transition-[transform,border-color,background-color] duration-300 ease-out hover:scale-105 hover:border-amber/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber disabled:opacity-40 disabled:hover:scale-100"
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
            <Square className="relative size-4 fill-amber text-amber" aria-hidden />
          ) : (
            <Mic className="relative size-5 text-amber" aria-hidden />
          )}
        </button>
        <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-muted">
          {sttMode === "unavailable"
            ? "Mic offline — type below"
            : listening
              ? "Tap to send"
              : speaking
                ? "Speaking — tap to interrupt"
                : "Tap to speak"}
        </p>
      </div>

      <form onSubmit={submit} className="flex w-full items-center gap-2 rounded-full border border-cream/10 bg-surface/50 px-2 py-1.5 backdrop-blur-xl transition-colors focus-within:border-amber/40">
        <label htmlFor="typed-doubt" className="sr-only">
          Type your doubt
        </label>
        <input
          id="typed-doubt"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="…or type your doubt"
          className="flex-1 bg-transparent px-3 py-1.5 text-[13px] text-cream placeholder:text-muted focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || typed.trim().length === 0}
          aria-label="Ask"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-amber text-canvas transition-transform duration-200 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
      </form>

      <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-muted">
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
