import { transcribeSpeech } from "@/lib/tutor.functions";
import {
  TARGET_SAMPLE_RATE,
  concatFrames,
  encodeWav,
  normalize,
  peakOf,
  resample,
  rms,
  toBase64,
} from "@/lib/voice/audio";

/**
 * Speech-to-text for the classroom mic.
 *
 * Capture is owned by a Web Audio VAD recorder: it keeps a pre-roll so the
 * first syllable is never clipped, treats normal pauses as part of the same
 * sentence, and only finalises after a real end-of-speech grace period. The
 * complete utterance is then committed once to the server transcriber, which
 * handles Hindi / English / Hinglish. The browser recognizer runs alongside
 * purely to show interim words (and as a text fallback) — it never decides
 * when the utterance ended.
 */

export interface STTMeta {
  /** Time from end-of-speech to final transcript. */
  sttMs: number;
  /** Length of the captured utterance. */
  audioMs: number;
  provider: string;
  /** Loudest sample in the capture (clipping/quiet diagnostics). */
  peak: number;
}

export interface STTEvents {
  onPartial: (text: string) => void;
  onFinal: (text: string, meta?: STTMeta) => void;
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

// ── Tuning ────────────────────────────────────────────────────────────────
/** Audio kept from before speech was detected, so openings are never cut. */
const PREROLL_MS = 500;
/** Silence that must follow speech before we call the sentence finished. */
const END_GRACE_MS = 1600;
/** Short pauses ("entropy... actually") must never end the utterance. */
const MIN_SPEECH_MS = 400;
/** Give a slow starter time before giving up. */
const NO_SPEECH_TIMEOUT_MS = 9000;
const MAX_UTTERANCE_MS = 45000;
/** Absolute floor so a noisy room does not read as speech. */
const MIN_THRESHOLD = 0.012;

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

export class VadCaptureSTT implements STTProvider {
  readonly id = "vad-gateway";
  readonly streaming = true;

  private events: STTEvents | null = null;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private recognition: SpeechRecognitionLike | null = null;

  private frames: Float32Array[] = [];
  private preroll: Float32Array[] = [];
  private prerollSamples = 0;
  private speaking = false;
  private speechSamples = 0;
  private silenceSamples = 0;
  private totalSamples = 0;
  private noiseFloor = 0.006;
  private sampleRate = 48000;
  private startedAt = 0;
  /** Guards against two finalise paths racing (VAD end + manual stop). */
  private finalising = false;
  private interim = "";
  private browserFinal = "";
  private onDeviceChange: (() => void) | null = null;

  isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) !==
        "undefined"
    );
  }

  async start(events: STTEvents): Promise<void> {
    this.events = events;
    this.reset();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      const name = (err as { name?: string }).name ?? "";
      throw new Error(
        name === "NotFoundError" || name === "OverconstrainedError"
          ? "No microphone found. Plug one in or type your doubt."
          : "Microphone access was blocked. Allow the mic or type your doubt.",
      );
    }

    this.stream = stream;
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    this.ctx = ctx;
    this.sampleRate = ctx.sampleRate;
    this.startedAt = performance.now();

    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    processor.onaudioprocess = (e) => this.onFrame(e.inputBuffer.getChannelData(0));
    source.connect(processor);
    // Muted sink: keeps the processor pulling without echoing the mic.
    const silent = ctx.createGain();
    silent.gain.value = 0;
    processor.connect(silent);
    silent.connect(ctx.destination);
    this.source = source;
    this.processor = processor;

    // Mic unplugged mid-sentence: commit what we already have.
    stream.getAudioTracks().forEach((track) => {
      track.onended = () => void this.finalise("device");
    });
    this.onDeviceChange = () => {
      const track = this.stream?.getAudioTracks()[0];
      if (track && track.readyState === "ended") void this.finalise("device");
    };
    navigator.mediaDevices.addEventListener?.("devicechange", this.onDeviceChange);

    this.startInterimRecognizer();
    events.onStateChange?.(true);
  }

  /** Manual stop (tap-to-send): commit immediately, keeping all audio. */
  async stop(): Promise<void> {
    if (!this.ctx && !this.stream) return;
    await this.finalise("manual");
  }

  private reset() {
    this.frames = [];
    this.preroll = [];
    this.prerollSamples = 0;
    this.speaking = false;
    this.speechSamples = 0;
    this.silenceSamples = 0;
    this.totalSamples = 0;
    this.noiseFloor = 0.006;
    this.finalising = false;
    this.interim = "";
    this.browserFinal = "";
  }

  private ms(samples: number) {
    return (samples / this.sampleRate) * 1000;
  }

  private onFrame(input: Float32Array) {
    if (this.finalising) return;
    const frame = new Float32Array(input); // the buffer is reused by Web Audio
    const level = rms(frame);
    this.totalSamples += frame.length;

    // Adaptive noise floor: tracks the room while nobody is speaking.
    const startThreshold = Math.max(MIN_THRESHOLD, this.noiseFloor * 3.2);
    // Hysteresis: once talking, quieter trailing syllables still count as
    // speech, so a soft word ending never looks like the end of the sentence.
    const threshold = this.speaking ? startThreshold * 0.55 : startThreshold;
    const voiced = level > threshold;
    if (!voiced) this.noiseFloor = this.noiseFloor * 0.95 + level * 0.05;

    if (this.speaking) {
      this.frames.push(frame);
      if (voiced) {
        this.speechSamples += frame.length;
        this.silenceSamples = 0;
      } else {
        this.silenceSamples += frame.length;
      }
      const enough = this.ms(this.speechSamples) >= MIN_SPEECH_MS;
      if (enough && this.ms(this.silenceSamples) >= END_GRACE_MS) {
        void this.finalise("vad");
        return;
      }
      if (performance.now() - this.startedAt >= MAX_UTTERANCE_MS) void this.finalise("max");
      return;
    }

    // Not speaking yet: hold a rolling pre-roll so the first word survives.
    this.preroll.push(frame);
    this.prerollSamples += frame.length;
    const maxPreroll = (PREROLL_MS / 1000) * this.sampleRate;
    while (this.prerollSamples > maxPreroll && this.preroll.length > 1) {
      this.prerollSamples -= this.preroll.shift()!.length;
    }

    if (voiced) {
      this.speaking = true;
      this.frames = [...this.preroll];
      this.preroll = [];
      this.prerollSamples = 0;
      this.speechSamples = frame.length;
      this.silenceSamples = 0;
      this.frames.push(frame);
      return;
    }

    if (performance.now() - this.startedAt >= NO_SPEECH_TIMEOUT_MS) {
      void this.finalise("no-speech");
    }
  }

  /** Browser recognizer: interim words only — it never ends the utterance. */
  private startInterimRecognizer() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    try {
      const recognition = new Ctor();
      recognition.lang = "en-IN"; // best for Indian English / Hinglish code-switching
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event: unknown) => {
        const e = event as {
          resultIndex: number;
          results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
        };
        let live = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i]!;
          const transcript = result[0]?.transcript ?? "";
          if (result.isFinal) this.browserFinal += `${transcript} `;
          else live += transcript;
        }
        this.interim = `${this.browserFinal}${live}`.replace(/\s+/g, " ").trim();
        if (this.interim && !this.finalising) this.events?.onPartial(this.interim);
      };
      recognition.onerror = () => undefined; // interim only; capture keeps running
      recognition.onend = () => undefined;
      recognition.start();
      this.recognition = recognition;
    } catch {
      this.recognition = null;
    }
  }

  private teardown() {
    try {
      this.recognition?.stop();
    } catch {
      /* already stopped */
    }
    this.recognition = null;
    if (this.onDeviceChange) {
      navigator.mediaDevices.removeEventListener?.("devicechange", this.onDeviceChange);
      this.onDeviceChange = null;
    }
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
      this.processor = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  private async finalise(reason: "vad" | "manual" | "device" | "max" | "no-speech") {
    if (this.finalising) return; // exactly one transcription per utterance
    this.finalising = true;

    const events = this.events;
    const frames = this.speaking ? this.frames : [];
    const sampleRate = this.sampleRate;
    const interim = this.interim.trim();
    this.teardown();
    events?.onStateChange?.(false);
    if (!events) return;

    const audioMs = Math.round(this.ms(frames.reduce((n, f) => n + f.length, 0)));
    if (reason === "no-speech" || frames.length === 0 || audioMs < MIN_SPEECH_MS) {
      if (interim) {
        events.onFinal(interim, { sttMs: 0, audioMs, provider: "browser", peak: 0 });
      } else {
        events.onError("I didn't hear anything. Tap the mic and speak, or type your doubt.");
      }
      return;
    }

    const started = performance.now();
    const raw = concatFrames(frames);
    const peak = peakOf(frames);
    const samples = resample(normalize(raw, peak), sampleRate, TARGET_SAMPLE_RATE);
    const wav = encodeWav(samples, TARGET_SAMPLE_RATE);

    try {
      const bytes = new Uint8Array(await wav.arrayBuffer());
      const { text } = await transcribeSpeech({
        data: { audio_base64: toBase64(bytes), mime_type: "audio/wav" },
      });
      const final = text.trim();
      const sttMs = Math.round(performance.now() - started);
      if (final) {
        events.onFinal(final, { sttMs, audioMs, provider: this.id, peak });
        return;
      }
      if (interim) {
        events.onFinal(interim, { sttMs, audioMs, provider: "browser", peak });
        return;
      }
      events.onError("I couldn't catch that clearly. Try again or type your doubt.");
    } catch (err) {
      console.error("[stt] transcription failed", err);
      const sttMs = Math.round(performance.now() - started);
      if (interim) {
        events.onFinal(interim, { sttMs, audioMs, provider: "browser", peak });
        return;
      }
      events.onError("Speech recognition is unavailable — type your doubt instead.");
    }
  }
}

export function createSTTProvider(): STTProvider | null {
  const vad = new VadCaptureSTT();
  return vad.isSupported() ? vad : null;
}
