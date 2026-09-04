import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askTutor } from "@/lib/tutor.functions";
import { createSTTProvider, type STTProvider } from "@/lib/voice/stt";
import { ResilientTTS, splitIntoSentences } from "@/lib/voice/tts";
import type {
  LearnerProfile,
  LearningEvent,
  TeachingStrategy,
  TutorAnswer,
  VoiceState,
} from "@/lib/types";

export const LEARNER: LearnerProfile = {
  student_id: "stu-1042",
  name: "Aarav",
  course: "Physics",
  chapter: "Electrostatics",
  lecture: "Electric Potential",
  prerequisite: "Vector basics",
  mastery: [
    { concept: "Electrostatics", score: 61 },
    { concept: "Mechanics", score: 91 },
    { concept: "Calculus", score: 82 },
  ],
  weak_concepts: ["field direction vs force on a charge"],
  recent_misconceptions: [],
};

let eventSeq = 0;

export function useVoiceSession() {
  const ask = useServerFn(askTutor);
  const [state, setState] = useState<VoiceState>("IDLE");
  const [partial, setPartial] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<TutorAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [weakConcepts, setWeakConcepts] = useState<string[]>(LEARNER.weak_concepts);
  const [sttMode, setSttMode] = useState<"streaming" | "recorded" | "unavailable">("unavailable");

  const sttRef = useRef<STTProvider | null>(null);
  const ttsRef = useRef<ResilientTTS | null>(null);
  const lastQuestionRef = useRef("");

  useEffect(() => {
    const provider = createSTTProvider();
    sttRef.current = provider;
    setSttMode(provider ? (provider.streaming ? "streaming" : "recorded") : "unavailable");
    ttsRef.current = new ResilientTTS();
    return () => {
      void provider?.stop();
      ttsRef.current?.cancel();
    };
  }, []);

  const logEvent = useCallback((event: Omit<LearningEvent, "id" | "created_at">) => {
    setEvents((prev) => {
      eventSeq += 1;
      const id = `ev-${eventSeq}-${Math.random().toString(36).slice(2, 8)}`;
      return [{ ...event, id, created_at: new Date().toISOString() }, ...prev].slice(0, 20);
    });
  }, []);

  const runPipeline = useCallback(
    async (text: string, strategy: TeachingStrategy = "default") => {
      lastQuestionRef.current = text;
      setQuestion(text);
      setError(null);
      setState("UNDERSTANDING");
      logEvent({ type: "doubt.raised", concept: null, detail: text });

      try {
        setState("RETRIEVING");
        const result = await ask({
          data: {
            question: text,
            strategy,
            course_id: "physics-11",
            weak_concepts: weakConcepts,
          },
        });
        setAnswer(result);

        if (!result.grounded) {
          setState("ERROR");
          logEvent({
            type: "answer.ungrounded",
            concept: null,
            detail: result.fallback_reason ?? "No trusted evidence found.",
          });
          return;
        }

        logEvent({
          type: "answer.grounded",
          concept: result.concepts[0] ?? null,
          detail: `Lecture ${result.evidence[0]?.chunk.lecture_number} · relevance ${result.evidence[0]?.relevance}`,
        });
        if (result.misconception) {
          logEvent({
            type: "misconception.detected",
            concept: result.misconception.concept,
            detail: result.misconception.likely_misconception,
          });
          setWeakConcepts((prev) =>
            prev.includes(result.misconception!.concept)
              ? prev
              : [...prev, result.misconception!.concept].slice(-6),
          );
        }

        setState("RESPONDING");
        const spoken = [
          result.short_answer,
          ...result.sections.slice(0, 2).map((s) => s.body),
        ].flatMap(splitIntoSentences);
        await ttsRef.current?.speak(spoken, setSpeaking);
        setState("CHECKING");
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error && err.message
            ? err.message
            : "Your tutor lost connection. Try again in a moment.",
        );
        setState("ERROR");
      }
    },
    [ask, logEvent, weakConcepts],
  );

  const stopSpeaking = useCallback(() => {
    ttsRef.current?.cancel();
    setSpeaking(false);
  }, []);

  const startListening = useCallback(async () => {
    const provider = sttRef.current;
    if (!provider) {
      setError("Voice input isn't supported in this browser — type your doubt below.");
      return;
    }
    stopSpeaking(); // barge-in: student speaking always interrupts the tutor
    setPartial("");
    setError(null);
    setState("LISTENING");
    try {
      await provider.start({
        onPartial: (text) => {
          setPartial(text);
          setState("TRANSCRIBING");
        },
        onFinal: (text) => {
          setPartial("");
          void runPipeline(text);
        },
        onError: (message) => {
          setError(message);
          setMicDenied(message.toLowerCase().includes("microphone"));
          setState("IDLE");
        },
      });
    } catch {
      setMicDenied(true);
      setError("Microphone access was blocked. Allow the mic or type your doubt.");
      setState("IDLE");
    }
  }, [runPipeline, stopSpeaking]);

  const stopListening = useCallback(async () => {
    await sttRef.current?.stop();
    if (state === "LISTENING") setState("IDLE");
  }, [state]);

  const askTyped = useCallback((text: string) => runPipeline(text), [runPipeline]);

  const explainDifferently = useCallback(
    (strategy: TeachingStrategy) => {
      if (!lastQuestionRef.current) return;
      stopSpeaking();
      void runPipeline(lastQuestionRef.current, strategy);
    },
    [runPipeline, stopSpeaking],
  );

  const recordPracticeAttempt = useCallback(
    (correct: boolean, questionText: string, concept: string | null) => {
      logEvent({
        type: "practice.attempted",
        concept,
        detail: `${correct ? "Correct" : "Incorrect"} · ${questionText}`,
      });
      setState("PRACTICE");
    },
    [logEvent],
  );

  const listening = state === "LISTENING" || state === "TRANSCRIBING";

  return useMemo(
    () => ({
      state,
      listening,
      speaking,
      partial,
      question,
      answer,
      error,
      micDenied,
      events,
      weakConcepts,
      sttMode,
      startListening,
      stopListening,
      stopSpeaking,
      askTyped,
      explainDifferently,
      recordPracticeAttempt,
      retry: () => lastQuestionRef.current && void runPipeline(lastQuestionRef.current),
    }),
    [
      state,
      listening,
      speaking,
      partial,
      question,
      answer,
      error,
      micDenied,
      events,
      weakConcepts,
      sttMode,
      startListening,
      stopListening,
      stopSpeaking,
      askTyped,
      explainDifferently,
      recordPracticeAttempt,
      runPipeline,
    ],
  );
}
