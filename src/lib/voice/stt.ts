import { transcribeSpeech } from "@/lib/tutor.functions";

/**
 * Speech-to-text provider abstraction.
 * Production target: Gnani Prisma streaming STT over a realtime gateway.
 * Available here: browser streaming recognition (partials + finals) with a
 * server-side recorded-audio provider as the fallback.
 */
export interface STTEvents {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onStateChange?: (listening: boolean) => void;
}

export interface STTProvider {
  readonly id: string;
  readonly streaming: boolean;
  isSupported(): boolean;
  start(events: STTEvents): Promise<void>;
  stop(): Promise<void>;
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Streaming provider: partial transcripts arrive while the student speaks. */
export class BrowserStreamingSTT implements STTProvider {
  readonly id = "browser-streaming";
  readonly streaming = true;
  private recognition: SpeechRecognitionLike | null = null;
  private finalText = "";

  isSupported(): boolean {
    return recognitionCtor() !== null;
  }

  async start(events: STTEvents): Promise<void> {
    const Ctor = recognitionCtor();
    if (!Ctor) throw new Error("Streaming speech recognition is not available in this browser.");
    const recognition = new Ctor();
    recognition.lang = "en-IN"; // handles Hinglish / Indian-accented code-switching best
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    this.finalText = "";

    recognition.onresult = (event: unknown) => {
      const e = event as {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      };
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]!;
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) this.finalText += transcript;
        else interim += transcript;
      }
      const combined = (this.finalText + interim).trim();
      if (combined) events.onPartial(combined);
    };

    recognition.onerror = (event: unknown) => {
      const code = (event as { error?: string }).error ?? "unknown";
      if (code === "aborted" || code === "no-speech") return;
      events.onError(
        code === "not-allowed"
          ? "Microphone access was blocked. Allow the mic or type your doubt."
          : "Voice input hit a problem. You can type your doubt instead.",
      );
    };

    recognition.onend = () => {
      events.onStateChange?.(false);
      const text = this.finalText.trim();
      if (text) events.onFinal(text);
    };

    this.recognition = recognition;
    recognition.start();
    events.onStateChange?.(true);
  }

  async stop(): Promise<void> {
    this.recognition?.stop();
    this.recognition = null;
  }
}

/** Fallback provider: records audio, transcribes server-side after stop. */
export class RecordedAudioSTT implements STTProvider {
  readonly id = "gateway-recorded";
  readonly streaming = false;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private events: STTEvents | null = null;

  isSupported(): boolean {
    return typeof window !== "undefined" && typeof MediaRecorder !== "undefined";
  }

  async start(events: STTEvents): Promise<void> {
    this.events = events;
    this.chunks = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      events.onStateChange?.(false);
      try {
        const blob = new Blob(this.chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 1200) return;
        const buffer = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (const byte of buffer) binary += String.fromCharCode(byte);
        const { text } = await transcribeSpeech({
          data: { audio_base64: btoa(binary), mime_type: blob.type },
        });
        if (text.trim()) events.onFinal(text.trim());
        else events.onError("I couldn't catch that. Try again or type your doubt.");
      } catch {
        events.onError("Speech recognition is unavailable — type your doubt instead.");
      }
    };
    this.recorder = recorder;
    recorder.start();
    events.onStateChange?.(true);
  }

  async stop(): Promise<void> {
    this.recorder?.stop();
    this.recorder = null;
    this.events = null;
  }
}

export function createSTTProvider(): STTProvider | null {
  const streaming = new BrowserStreamingSTT();
  if (streaming.isSupported()) return streaming;
  const recorded = new RecordedAudioSTT();
  if (recorded.isSupported()) return recorded;
  return null;
}
