import { useEffect, useRef } from "react";
import { splitIntoSentences } from "@/lib/voice/tts";

function norm(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

interface Props {
  text: string;
  activeLine: string | null;
  /** Called with the element of the sentence currently being spoken. */
  onActive?: (el: HTMLElement | null) => void;
  className?: string;
}

/**
 * Renders a paragraph sentence by sentence and highlights the one the tutor is
 * speaking right now. Falls back to plain text when nothing is being spoken.
 */
export function SpokenText({ text, activeLine, onActive, className }: Props) {
  const sentences = splitIntoSentences(text);
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const active = activeLine ? norm(activeLine) : null;
  const hit = active ? sentences.findIndex((s) => norm(s) === active) : -1;

  useEffect(() => {
    if (hit >= 0) onActive?.(activeRef.current);
  }, [hit, onActive]);

  if (sentences.length === 0) return <p className={className}>{text}</p>;

  return (
    <p className={className}>
      {sentences.map((sentence, i) => (
        <span
          key={i}
          ref={i === hit ? activeRef : undefined}
          className={
            i === hit
              ? "rounded bg-amber/18 px-1 text-cream shadow-[0_0_18px_-6px_oklch(0.83_0.135_74/0.8)] transition-colors duration-300"
              : "transition-colors duration-300"
          }
        >
          {sentence}{" "}
        </span>
      ))}
    </p>
  );
}
