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
    <div className="min-h-screen bg-canvas text-cream">
      <TopNav connected />

      <main className="mx-auto max-w-[1440px] px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
        <header className="max-w-3xl reveal-section">
          <p className="eyebrow text-amber">{eyebrow}</p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">{intro}</p>
        </header>
        <div className="mt-10">{children}</div>
      </main>
    </div>
  );
}
