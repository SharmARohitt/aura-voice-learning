import { useEffect, useMemo, useRef } from "react";
import type { VoiceState } from "@/lib/types";

export type OrbMode = "idle" | "listening" | "thinking" | "speaking" | "error";

export function orbModeFor(state: VoiceState, listening: boolean, speaking: boolean): OrbMode {
  if (state === "ERROR") return "error";
  if (speaking) return "speaking";
  if (listening || state === "LISTENING" || state === "TRANSCRIBING") return "listening";
  if (["UNDERSTANDING", "RETRIEVING", "REASONING"].includes(state)) return "thinking";
  return "idle";
}

interface Props {
  mode: OrbMode;
  /** Rendered pixel size of the orb stage. */
  size?: number;
  className?: string;
  label?: string;
}

interface Tuning {
  energy: number;
  breathe: number;
  spin: number;
  particles: number;
  glow: number;
  hueShift: number;
}

const TUNING: Record<OrbMode, Tuning> = {
  idle: { energy: 0.32, breathe: 0.022, spin: 0.16, particles: 18, glow: 0.55, hueShift: 0 },
  listening: { energy: 0.72, breathe: 0.05, spin: 0.42, particles: 34, glow: 0.85, hueShift: 6 },
  thinking: { energy: 0.6, breathe: 0.018, spin: 0.95, particles: 28, glow: 0.7, hueShift: -8 },
  speaking: { energy: 1, breathe: 0.075, spin: 0.55, particles: 40, glow: 1, hueShift: 4 },
  error: { energy: 0.22, breathe: 0.016, spin: 0.08, particles: 8, glow: 0.32, hueShift: -12 },
};

type Particle = { a: number; r: number; v: number; s: number; life: number };

/**
 * Voice Bingo AI core — a layered plasma/flame orb rendered on a single 2D
 * canvas (one GPU-friendly element, no per-frame DOM/layout work).
 * Purely presentational: it reflects voice state, it never produces it.
 */
export function FireOrb({ mode, size = 300, className = "", label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const base = size * 0.26;

    const particles: Particle[] = Array.from({ length: 44 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 0.9 + Math.random() * 1.1,
      v: 0.0012 + Math.random() * 0.0035,
      s: 0.6 + Math.random() * 1.5,
      life: Math.random(),
    }));

    // Smoothed tuning so state changes interpolate instead of snapping.
    const cur: Tuning = { ...TUNING[modeRef.current] };
    let raf = 0;
    let t = 0;
    let pulse = 0;

    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

    const flameRing = (
      radius: number,
      wobble: number,
      lobes: number,
      phase: number,
      width: number,
      alpha: number,
      hue: number,
    ) => {
      ctx.beginPath();
      const steps = 84;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const n =
          Math.sin(a * lobes + phase) * 0.6 +
          Math.sin(a * (lobes * 1.7 + 1) - phase * 1.3) * 0.28 +
          Math.sin(a * (lobes * 2.6 + 2) + phase * 0.7) * 0.14;
        const r = radius * (1 + n * wobble);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.97;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.lineWidth = width;
      ctx.strokeStyle = `hsla(${hue}, 96%, 62%, ${alpha})`;
      ctx.stroke();
    };

    const draw = (now: number) => {
      if (!reduced) raf = requestAnimationFrame(draw);
      const target = TUNING[modeRef.current];
      const k = reduced ? 1 : 0.045;
      cur.energy = lerp(cur.energy, target.energy, k);
      cur.breathe = lerp(cur.breathe, target.breathe, k);
      cur.spin = lerp(cur.spin, target.spin, k);
      cur.particles = lerp(cur.particles, target.particles, k);
      cur.glow = lerp(cur.glow, target.glow, k);
      cur.hueShift = lerp(cur.hueShift, target.hueShift, k);

      t = now / 1000;
      const m = modeRef.current;
      const speed = reduced ? 0.25 : 1;

      // Voice-like envelope: layered oscillators read as speech cadence,
      // while listening reads as breath and thinking as a steady compute hum.
      let env = 0;
      if (m === "speaking") {
        env =
          0.55 +
          0.45 *
            Math.abs(
              Math.sin(t * 5.1) * 0.6 + Math.sin(t * 8.7 + 1.2) * 0.28 + Math.sin(t * 13.3) * 0.12,
            );
      } else if (m === "listening") {
        env = 0.4 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.6)) + 0.15 * Math.sin(t * 6.4);
      } else if (m === "thinking") {
        env = 0.35 + 0.12 * Math.sin(t * 1.6);
        pulse = (t * 0.55) % 1;
      } else {
        env = 0.3 + 0.2 * Math.sin(t * 0.9);
      }
      if (reduced) env = 0.4 + 0.1 * Math.sin(t * 0.8);

      const contract = m === "thinking" ? 0.9 : 1;
      const radius = base * contract * (1 + cur.breathe * env * 2.2);
      const hue = 26 + cur.hueShift + env * 8;

      ctx.clearRect(0, 0, size, size);
      ctx.globalCompositeOperation = "lighter";

      // Layer 2 — volumetric halo / outer aura.
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, size * 0.5);
      halo.addColorStop(0, `hsla(${hue + 10}, 100%, 58%, ${0.32 * cur.glow})`);
      halo.addColorStop(0.45, `hsla(${hue - 4}, 96%, 50%, ${0.14 * cur.glow})`);
      halo.addColorStop(1, "hsla(20, 90%, 40%, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, size, size);

      // Layer 5 — energy particles.
      const count = Math.round(cur.particles);
      for (let i = 0; i < count; i++) {
        const p = particles[i]!;
        const dir = m === "thinking" ? -1 : 1;
        p.life += p.v * (0.6 + cur.energy) * speed * dir;
        if (p.life > 1) p.life -= 1;
        if (p.life < 0) p.life += 1;
        p.a += 0.0015 * cur.spin * speed;
        const pr = radius * (1.12 + p.r * 0.55 * p.life);
        const px = cx + Math.cos(p.a + t * 0.12 * cur.spin) * pr;
        const py = cy + Math.sin(p.a + t * 0.12 * cur.spin) * pr * 0.96;
        const fade = Math.sin(p.life * Math.PI) * 0.75 * cur.glow;
        ctx.beginPath();
        ctx.arc(px, py, p.s * (0.6 + cur.energy * 0.7), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue + 14}, 100%, 72%, ${fade})`;
        ctx.fill();
      }

      // Layers 3 & 4 — counter-rotating irregular flame rings.
      const spin = t * cur.spin * speed;
      flameRing(
        radius * 1.3,
        0.055 + cur.energy * 0.05,
        5,
        spin * 1.6,
        1.6,
        0.3 + cur.energy * 0.35,
        hue + 12,
      );
      flameRing(
        radius * 1.52,
        0.045 + cur.energy * 0.06,
        7,
        -spin * 1.05 + 2,
        1.1,
        0.18 + cur.energy * 0.28,
        hue - 6,
      );
      flameRing(
        radius * 1.75,
        0.035 + cur.energy * 0.045,
        4,
        spin * 0.6 + 4,
        0.9,
        0.1 + cur.energy * 0.18,
        hue + 20,
      );

      // Thinking: a bright charge travelling around the core.
      if (m === "thinking" || m === "speaking") {
        const a = (m === "thinking" ? pulse : (t * 0.9) % 1) * Math.PI * 2;
        const pr = radius * 1.3;
        const px = cx + Math.cos(a) * pr;
        const py = cy + Math.sin(a) * pr * 0.97;
        const g = ctx.createRadialGradient(px, py, 0, px, py, radius * 0.42);
        g.addColorStop(0, `hsla(48, 100%, 80%, ${0.7 * cur.glow})`);
        g.addColorStop(1, "hsla(30, 100%, 60%, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
      }

      // Speaking: radial shock waves.
      if (m === "speaking" && !reduced) {
        for (let w = 0; w < 2; w++) {
          const prog = ((t * 0.7 + w * 0.5) % 1);
          ctx.beginPath();
          ctx.arc(cx, cy, radius * (1.1 + prog * 1.1), 0, Math.PI * 2);
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = `hsla(${hue + 16}, 100%, 70%, ${(1 - prog) * 0.28})`;
          ctx.stroke();
        }
      }

      // Layer 1 — molten core with golden highlight.
      const core = ctx.createRadialGradient(
        cx - radius * 0.22,
        cy - radius * 0.28,
        radius * 0.08,
        cx,
        cy,
        radius,
      );
      core.addColorStop(0, `hsla(${hue + 22}, 100%, 88%, 0.98)`);
      core.addColorStop(0.26, `hsla(${hue + 12}, 100%, 68%, 0.95)`);
      core.addColorStop(0.62, `hsla(${hue}, 98%, 54%, 0.9)`);
      core.addColorStop(1, `hsla(${hue - 12}, 92%, 34%, 0.72)`);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.fill();

      // Glassy rim light.
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `hsla(45, 100%, 86%, ${0.28 + cur.energy * 0.28})`;
      ctx.stroke();

      ctx.globalCompositeOperation = "source-over";
    };

    if (reduced) draw(0);
    else raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size, reduced]);

  return (
    <div
      className={`relative grid place-items-center ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `AI core — ${mode}`}
    >
      <div
        className="pointer-events-none absolute inset-[-18%] rounded-full bg-amber/12 blur-[70px]"
        aria-hidden
      />
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="relative block"
        aria-hidden
      />
    </div>
  );
}
