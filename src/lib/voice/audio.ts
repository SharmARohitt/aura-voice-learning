/**
 * Microphone capture helpers: PCM buffering, gain handling and WAV encoding.
 * Kept framework-free so the STT provider stays easy to reason about.
 */

export const TARGET_SAMPLE_RATE = 16000;

/** Root-mean-square energy of a frame (0..1). */
export function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!;
  return Math.sqrt(sum / frame.length);
}

export function peakOf(frames: Float32Array[]): number {
  let peak = 0;
  for (const frame of frames) {
    for (let i = 0; i < frame.length; i++) {
      const v = Math.abs(frame[i]!);
      if (v > peak) peak = v;
    }
  }
  return peak;
}

export function concatFrames(frames: Float32Array[]): Float32Array {
  let length = 0;
  for (const f of frames) length += f.length;
  const out = new Float32Array(length);
  let offset = 0;
  for (const f of frames) {
    out.set(f, offset);
    offset += f.length;
  }
  return out;
}

/**
 * Quiet microphones lose words to the recognizer. Lift the recording toward a
 * healthy peak, with a soft limiter so loud speakers never clip.
 */
export function normalize(samples: Float32Array, peak: number): Float32Array {
  if (peak <= 0.0001) return samples;
  const gain = Math.min(4, 0.85 / peak);
  if (gain <= 1.05) {
    if (peak <= 0.995) return samples;
    // Already hot: soft-limit instead of leaving square-ish clipped peaks.
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) out[i] = Math.tanh(samples[i]! * 0.9);
    return out;
  }
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]! * gain;
    out[i] = v > 1 || v < -1 ? Math.tanh(v) : v;
  }
  return out;
}

/** Linear-interpolating resampler — enough quality for speech recognition. */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const ratio = from / to;
  const length = Math.floor(samples.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = samples[idx] ?? 0;
    const b = samples[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** Standard 16-bit mono WAV — decodable everywhere, no container fragments. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
