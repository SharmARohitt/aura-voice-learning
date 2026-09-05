import type { ReactNode } from "react";
import { TopNav } from "@/components/classroom/TopNav";

interface Props {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}

export function PageShell({ eyebrow, title, intro, children }: Props) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas text-cream">
      <div
        className="pointer-events-none absolute -top-48 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-amber/20 blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-[-220px] right-[-120px] h-[500px] w-[600px] rounded-full bg-rose/20 blur-[130px]"
        aria-hidden
      />

      <TopNav connected />

      <main className="relative z-10 mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber">{eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">{intro}</p>
        <div className="mt-7">{children}</div>
      </main>
    </div>
  );
}
