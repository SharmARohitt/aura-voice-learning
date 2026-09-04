import { useState, type FormEvent } from "react";
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
    <div className="mt-5 rounded-3xl border border-cream/10 bg-surface/40 px-5 py-5 backdrop-blur-xl sm:px-6">
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={listening ? onStop : onStart}
            disabled={sttMode === "unavailable" || busy}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Start listening"}
            className="relative grid place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber disabled:opacity-50"
          >
            {listening && (
              <span className="ring-pulse absolute inset-0 rounded-full bg-rose/40" aria-hidden />
            )}
            <span className="relative grid size-16 place-items-center rounded-full bg-gradient-to-br from-amber to-rose shadow-[0_0_30px_oklch(0.71_0.153_8/0.5)]">
              {listening ? (
                <span className="block size-5 rounded-sm bg-canvas" />
              ) : (
                <span className="block h-6 w-3 rounded-full bg-canvas" />
              )}
            </span>
          </button>
          <div>
            <p className="font-display text-[15px] font-semibold text-cream">
              {listening ? "Listening — tap to send" : "Tap to speak"}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
              {sttMode === "streaming"
                ? "Streaming transcript · Hinglish, Indian accent"
                : sttMode === "recorded"
                  ? "Record & transcribe · Hinglish, Indian accent"
                  : "Voice unavailable — type your doubt"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex h-8 items-end gap-1" aria-hidden>
            {[0, 0.1, 0.2, 0.3, 0.15, 0.25, 0.05].map((d, i) => (
              <span
                key={i}
                className={`w-1 rounded-full ${i % 2 ? "bg-rose/80" : "bg-amber/80"} ${
                  listening || speaking ? "wave-bar" : ""
                }`}
                style={{ animationDelay: `${d}s`, height: listening || speaking ? undefined : "20%" }}
              />
            ))}
          </div>
          <div className="text-right">
            <p
              className={`font-mono text-[10px] uppercase tracking-widest ${
                sttMode === "unavailable" ? "text-rose" : "text-mint"
              }`}
            >
              {sttMode === "unavailable" ? "Mic offline" : "Connected"}
            </p>
            <p className="font-mono text-[10px] text-muted">
              Last answer <span className="text-amber">{latencyMs ? `${latencyMs} ms` : "—"}</span>
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <label htmlFor="typed-doubt" className="sr-only">
          Type your doubt
        </label>
        <input
          id="typed-doubt"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="…or type your doubt (voice-first is not voice-only)"
          className="flex-1 rounded-xl border border-cream/10 bg-canvas/50 px-3.5 py-2.5 text-[13px] text-cream placeholder:text-muted focus-visible:outline-2 focus-visible:outline-amber"
        />
        <button
          type="submit"
          disabled={busy || typed.trim().length === 0}
          className="rounded-xl bg-amber px-4 py-2.5 text-[12px] font-semibold text-canvas disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
