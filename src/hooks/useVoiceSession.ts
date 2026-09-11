import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askTutor, generatePractice } from "@/lib/tutor.functions";
import { courseIdFor, detectLanguageRequest } from "@/lib/learner-context";
import { createSTTProvider, type STTProvider } from "@/lib/voice/stt";
import { ResilientTTS, splitIntoSentences } from "@/lib/voice/tts";
import type {
  LanguagePref,
  LearnerContext,
  LearnerProfile,
  LearningEvent,
  TeachingMode,
  TeachingStrategy,
  TutorAnswer,
  VoiceState,
} from "@/lib/types";

export function profileFor(context: LearnerContext): LearnerProfile {
  const subject = context.subjects[0] ?? "General";
  return {
    student_id: "stu-1042",
    name: context.name,
    course: `${subject} · ${context.class_level}`,
    chapter: "Open — ask anything",
    lecture: context.goal ? `${context.goal} track` : "Self paced",
    prerequisite: "Adapts to your answers",
    mastery: [
      { concept: subject, score: 61 },
      { concept: context.subjects[1] ?? "Fundamentals", score: 78 },
      { concept: "Problem solving", score: 84 },
    ],
    weak_concepts: [],
    recent_misconceptions: [],
  };
}

let eventSeq = 0;

export function useVoiceSession(context: LearnerContext) {
  const ask = useServerFn(askTutor);
  const makePractice = useServerFn(generatePractice);
  const [state, setState] = useState<VoiceState>("IDLE");
  const [partial, setPartial] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<TutorAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [weakConcepts, setWeakConcepts] = useState<string[]>([]);
  const [mode, setMode] = useState<TeachingMode>("explain");
  const [language, setLanguage] = useState<LanguagePref>(context.language);
  const [sttMode, setSttMode] = useState<"streaming" | "recorded" | "unavailable">("unavailable");

  const sttRef = useRef<STTProvider | null>(null);
  const ttsRef = useRef<ResilientTTS | null>(null);
  const lastQuestionRef = useRef("");
  /** Compact conversation context — follow-ups inherit subject + chapter. */
  const convRef = useRef<{ subject: string; chapter: string }>({ subject: "", chapter: "" });
  const runIdRef = useRef(0);
  const modeRef = useRef(mode);
  const langRef = useRef(language);
  modeRef.current = mode;
  langRef.current = language;

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
      return [{ ...event, id, created_at: new Date().toISOString() }, ...prev].slice(0, 24);
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    ttsRef.current?.cancel();
    setSpeaking(false);
  }, []);

  const runPipeline = useCallback(
    async (text: string, strategy: TeachingStrategy = "default", nextMode?: TeachingMode) => {
      // Barge-in: a new question always cancels the previous run and its audio.
      runIdRef.current += 1;
      const runId = runIdRef.current;
      ttsRef.current?.cancel();
      setSpeaking(false);

      lastQuestionRef.current = text;
      setQuestion(text);
      setError(null);
      setState("UNDERSTANDING");
      logEvent({ type: "doubt.raised", concept: null, detail: text });

      // Natural-language language switching, applied before the call.
      const requested = detectLanguageRequest(text);
      const effectiveLanguage = requested ?? langRef.current;
      if (requested && requested !== langRef.current) {
        setLanguage(requested);
        langRef.current = requested;
        logEvent({ type: "language.changed", concept: null, detail: `Switched to ${requested}` });
      }
      const activeMode = nextMode ?? modeRef.current;
      if (nextMode && nextMode !== modeRef.current) {
        setMode(nextMode);
        modeRef.current = nextMode;
        logEvent({ type: "mode.changed", concept: null, detail: nextMode });
      }

      try {
        setState("RETRIEVING");
        setPreview("");

        // Fast path: a capped two-sentence answer lands ~1s ahead of the full
        // structured explanation and starts speaking immediately.
        let previewSpeech: Promise<void> = Promise.resolve();
        let previewSpoken = false;
        let fullArrived = false;
        const previewRun = quick({
          data: {
            question: text,
            language: effectiveLanguage,
            mode: activeMode,
            class_level: context.class_level,
            subjects: context.subjects,
            ...(courseIdFor(context) ? { course_id: courseIdFor(context)! } : {}),
          },
        })
          .then((r) => {
            if (runId !== runIdRef.current || fullArrived || !r.text) return;
            previewSpoken = true;
            setPreview(r.text);
            setState("RESPONDING");
            previewSpeech = (
              ttsRef.current?.speak(splitIntoSentences(r.text).filter(Boolean), (isSpeaking) => {
                if (runId === runIdRef.current) setSpeaking(isSpeaking);
              }) ?? Promise.resolve()
            ).catch(() => undefined);
          })
          .catch(() => undefined);
        void previewRun;

        const result = await ask({
          data: {
            question: text,
            strategy,
            mode: activeMode,
            language: effectiveLanguage,
            student_name: context.name,
            class_level: context.class_level,
            goal: context.goal,
            subjects: context.subjects,
            weak_concepts: weakConcepts,
            ...(courseIdFor(context) ? { course_id: courseIdFor(context)! } : {}),
            ...(convRef.current.subject ? { context_subject: convRef.current.subject } : {}),
            ...(convRef.current.chapter ? { context_chapter: convRef.current.chapter } : {}),
          },
        });
        fullArrived = true;
        if (runId !== runIdRef.current) return; // superseded by a newer question
        setState("REASONING");
        setAnswer(result);
        convRef.current = { subject: result.subject, chapter: result.chapter };

        // Practice is generated in the background so it never delays the answer.
        const practiceStart = performance.now();
        void makePractice({
          data: {
            question: text,
            concept: result.concepts[0] ?? result.chapter ?? "",
            language: effectiveLanguage,
            difficulty: result.difficulty,
          },
        })
          .then((items) => {
            if (runId !== runIdRef.current) return;
            setAnswer((prev) =>
              prev
                ? {
                    ...prev,
                    practice: items,
                    latency: {
                      ...prev.latency,
                      practice_ms: Math.round(performance.now() - practiceStart),
                    },
                  }
                : prev,
            );
          })
          .catch(() => undefined);

        logEvent(
          result.grounded
            ? {
                type: "answer.grounded",
                concept: result.concepts[0] ?? null,
                detail: `Lecture ${result.evidence[0]?.chunk.lecture_number} · relevance ${result.evidence[0]?.relevance}`,
              }
            : {
                type: "answer.general",
                concept: result.concepts[0] ?? null,
                detail: "Answered from general knowledge — outside your course index.",
              },
        );

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

        // Speaking never blocks the pipeline — the UI is interactive instantly.
        setState("RESPONDING");
        // If the fast answer already spoke the opening, continue from the
        // sections instead of repeating it.
        const spoken = (
          previewSpoken
            ? result.sections.slice(0, 2).map((s) => s.body)
            : [result.short_answer, ...result.sections.slice(0, 2).map((s) => s.body)]
        )
          .flatMap(splitIntoSentences)
          .filter(Boolean);
        const speakStart = performance.now();
        let firstAudio = false;
        void previewSpeech
          .then(() =>
            runId === runIdRef.current
              ? ttsRef.current?.speak(spoken, (isSpeaking) => {
            if (runId !== runIdRef.current) return;
            setSpeaking(isSpeaking);
            if (isSpeaking && !firstAudio) {
              firstAudio = true;
              const ttfa = Math.round(performance.now() - speakStart);
              setAnswer((prev) =>
                prev ? { ...prev, latency: { ...prev.latency, tts_ttfa_ms: ttfa } } : prev,
              );
            }
          })
          .catch(() => setSpeaking(false))
          .finally(() => {
            if (runId === runIdRef.current) setState("CHECKING");
          });
        window.setTimeout(() => {
          if (runId === runIdRef.current) setState((s) => (s === "RESPONDING" ? "CHECKING" : s));
        }, 1200);
      } catch (err) {
        if (runId !== runIdRef.current) return;
        console.error(err);
        setError(
          err instanceof Error && err.message
            ? err.message
            : "Your tutor lost connection. Try again in a moment.",
        );
        setState("ERROR");
      }
    },
    [ask, context, logEvent, makePractice, weakConcepts],
  );

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
    setState((s) => (s === "LISTENING" || s === "TRANSCRIBING" ? "IDLE" : s));
  }, []);

  const askTyped = useCallback((text: string) => runPipeline(text), [runPipeline]);

  const explainDifferently = useCallback(
    (strategy: TeachingStrategy) => {
      if (!lastQuestionRef.current) return;
      void runPipeline(lastQuestionRef.current, strategy);
    },
    [runPipeline],
  );

  const changeMode = useCallback(
    (next: TeachingMode) => {
      setMode(next);
      modeRef.current = next;
      logEvent({ type: "mode.changed", concept: null, detail: next });
      if (lastQuestionRef.current) void runPipeline(lastQuestionRef.current, "default", next);
    },
    [logEvent, runPipeline],
  );

  const changeLanguage = useCallback(
    (next: LanguagePref) => {
      setLanguage(next);
      langRef.current = next;
      logEvent({ type: "language.changed", concept: null, detail: next });
      if (lastQuestionRef.current) void runPipeline(lastQuestionRef.current);
    },
    [logEvent, runPipeline],
  );

  const escalate = useCallback(() => {
    logEvent({
      type: "escalation.raised",
      concept: answer?.concepts[0] ?? null,
      detail: `Sent to teacher: "${lastQuestionRef.current || question}"`,
    });
  }, [answer, logEvent, question]);

  const recordPracticeAttempt = useCallback(
    (correct: boolean, questionText: string, concept: string | null) => {
      logEvent({
        type: "practice.attempted",
        concept,
        detail: `${correct ? "Correct" : "Incorrect"} · ${questionText}`,
      });
      if (!correct && concept) {
        setWeakConcepts((prev) => (prev.includes(concept) ? prev : [...prev, concept].slice(-6)));
      }
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
      mode,
      language,
      startListening,
      stopListening,
      stopSpeaking,
      askTyped,
      explainDifferently,
      changeMode,
      changeLanguage,
      escalate,
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
      mode,
      language,
      startListening,
      stopListening,
      stopSpeaking,
      askTyped,
      explainDifferently,
      changeMode,
      changeLanguage,
      escalate,
      recordPracticeAttempt,
      runPipeline,
    ],
  );
}
