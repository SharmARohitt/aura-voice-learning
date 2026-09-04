/**
 * Text-to-speech provider abstraction with a streaming playback queue.
 * Production target: Gnani Timbre streaming synthesis.
 * Here: server-proxied gateway TTS (SSE + PCM, sentence-level streaming) with
 * browser speech synthesis as fallback. Both are interruptible mid-sentence.
 */
export interface TTSProvider {
  readonly id: string;
  speak(sentences: string[], onStateChange?: (speaking: boolean) => void): Promise<void>;
  cancel(): void;
}

const SAMPLE_RATE = 24000;

export class GatewayStreamingTTS implements TTSProvider {
  readonly id = "gateway-streaming";
  private controller: AbortController | null = null;
  private ctx: AudioContext | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private playhead = 0;

  cancel(): void {
    this.controller?.abort();
    this.controller = null;
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already finished */
      }
    });
    this.sources = [];
    this.playhead = 0;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  async speak(sentences: string[], onStateChange?: (speaking: boolean) => void): Promise<void> {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    this.ctx = ctx;
    this.playhead = 0;
    onStateChange?.(true);

    try {
      for (const sentence of sentences) {
        if (controller.signal.aborted) break;
        await this.streamSentence(sentence, ctx, controller.signal);
      }
      const waitMs = Math.max(0, (this.playhead - ctx.currentTime) * 1000);
      await new Promise((r) => setTimeout(r, waitMs));
    } finally {
      if (this.controller === controller) {
        onStateChange?.(false);
        this.controller = null;
      }
    }
  }

  private async streamSentence(text: string, ctx: AudioContext, signal: AbortSignal) {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`TTS failed: ${res.status}`);

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let pending = new Uint8Array(0);

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payloadText = line.slice(5).trim();
        if (!payloadText || payloadText === "[DONE]") continue;
        let payload: { type?: string; audio?: string };
        try {
          payload = JSON.parse(payloadText);
        } catch {
          continue;
        }
        if (payload.type !== "speech.audio.delta" || !payload.audio) continue;
        const binary = atob(payload.audio);
        const incoming = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) incoming[i] = binary.charCodeAt(i);
        pending = this.schedule(ctx, pending, incoming);
      }
    }
  }

  private schedule(ctx: AudioContext, pending: Uint8Array, incoming: Uint8Array): Uint8Array {
    const bytes = new Uint8Array(pending.length + incoming.length);
    bytes.set(pending);
    bytes.set(incoming, pending.length);
    const usable = bytes.length - (bytes.length % 2);
    const leftover = new Uint8Array(bytes.subarray(usable));
    if (usable === 0) return leftover;

    const samples = new Int16Array(bytes.buffer, 0, usable / 2);
    const floats = Float32Array.from(samples, (s) => s / 32768);
    const audioBuffer = ctx.createBuffer(1, floats.length, SAMPLE_RATE);
    audioBuffer.copyToChannel(floats, 0);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    if (this.playhead === 0) this.playhead = ctx.currentTime + 0.06;
    else this.playhead = Math.max(this.playhead, ctx.currentTime);
    source.start(this.playhead);
    this.playhead += audioBuffer.duration;
    this.sources.push(source);
    return leftover;
  }
}

export class BrowserSpeechTTS implements TTSProvider {
  readonly id = "browser-speech";

  cancel(): void {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  async speak(sentences: string[], onStateChange?: (speaking: boolean) => void): Promise<void> {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    this.cancel();
    onStateChange?.(true);
    for (const sentence of sentences) {
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(sentence);
        utterance.lang = "en-IN";
        utterance.rate = 0.98;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      });
    }
    onStateChange?.(false);
  }
}

/** Speaks via the gateway, and silently degrades to the browser voice. */
export class ResilientTTS implements TTSProvider {
  readonly id = "resilient";
  private primary = new GatewayStreamingTTS();
  private fallback = new BrowserSpeechTTS();
  private usingFallback = false;

  cancel(): void {
    this.primary.cancel();
    this.fallback.cancel();
  }

  async speak(sentences: string[], onStateChange?: (speaking: boolean) => void): Promise<void> {
    if (!this.usingFallback) {
      try {
        await this.primary.speak(sentences, onStateChange);
        return;
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        console.warn("[tts] gateway synthesis unavailable, using browser voice", error);
        this.usingFallback = true;
        onStateChange?.(false);
      }
    }
    await this.fallback.speak(sentences, onStateChange);
  }
}

export function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
