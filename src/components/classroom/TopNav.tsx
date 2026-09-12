import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import logo from "@/assets/voice-bingo-logo.png";
import { clearContext, loadContext } from "@/lib/learner-context";

const NAV = [
  { label: "Classroom", to: "/" },
  { label: "Learning", to: "/learning" },
  { label: "Practice", to: "/practice" },
  { label: "Confusion Graph", to: "/confusion-graph" },
  { label: "Teacher", to: "/teacher" },
] as const;

export function TopNav({ connected }: { connected: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-surface/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between gap-5 px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-amber/60">
          <img
            src={logo}
            alt="Voice Bingo logo"
            width={36}
            height={36}
            className="size-8 rounded-md"
          />
          <div>
            <span className="font-display text-sm font-semibold leading-none">Voice Bingo</span>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-muted">Aura · PW</p>
          </div>
        </Link>

        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label="Primary"
        >
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="rounded-md px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-sage/20 hover:text-ink"
              activeProps={{
                className:
                  "rounded-md bg-sage/25 px-3 py-2 text-xs font-semibold text-forest",
                "aria-current": "page",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div
            className="hidden items-center gap-2 sm:flex"
          >
            <span
              className={`size-1.5 rounded-full ${connected ? "bg-mint" : "bg-rose"}`}
              aria-hidden
            />
            <span
              className={`text-[10px] font-bold uppercase tracking-[0.1em] ${
                connected ? "text-mint" : "text-rose"
              }`}
            >
              {connected ? "Voice ready" : "Voice offline"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              clearContext();
              window.location.assign("/");
            }}
            title={loadContext()?.name ?? "Edit profile"}
            aria-label="Edit profile (name, class, subjects)"
            className="grid size-9 cursor-pointer place-items-center rounded-full bg-forest text-[11px] font-bold text-paper outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-amber/60"
          >
            {(loadContext()?.name ?? "AR").slice(0, 2).toUpperCase()}
          </button>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? "Close navigation" : "Open navigation"}
            className="grid size-9 place-items-center rounded-md border border-line bg-surface text-ink md:hidden"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line bg-surface px-5 py-3 md:hidden" aria-label="Mobile navigation">
          <div className="mx-auto grid max-w-[1500px] gap-1">
            {NAV.map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setOpen(false)} className="rounded-md px-3 py-2.5 text-sm text-muted" activeProps={{ className: "rounded-md bg-sage/25 px-3 py-2.5 text-sm font-semibold text-forest" }}>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
