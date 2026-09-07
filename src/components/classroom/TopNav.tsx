import { Link } from "@tanstack/react-router";
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
  return (
    <header className="relative z-20 mx-auto max-w-[1500px] px-4 pt-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cream/10 bg-surface/40 px-4 py-3.5 backdrop-blur-xl sm:px-5">
        <Link to="/" className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-amber/60">
          <img
            src={logo}
            alt="Voice Bingo logo"
            width={36}
            height={36}
            className="size-9 rounded-xl"
          />
          <div>
            <h1 className="font-display text-[15px] font-bold leading-none">VOICE BINGO</h1>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.28em] text-muted">
              Aura-PW
            </p>
          </div>
        </Link>

        <nav
          className="order-3 flex w-full flex-wrap items-center gap-1 lg:order-none lg:w-auto"
          aria-label="Primary"
        >
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="rounded-lg px-3.5 py-2 text-[13px] text-muted transition-colors hover:bg-cream/5 hover:text-cream"
              activeProps={{
                className:
                  "rounded-lg bg-amber/10 px-3.5 py-2 text-[13px] font-medium text-amber ring-1 ring-amber/30",
                "aria-current": "page",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div
            className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 sm:flex ${
              connected ? "border-mint/30 bg-mint/10" : "border-rose/30 bg-rose/10"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${connected ? "bg-mint" : "bg-rose"}`}
              aria-hidden
            />
            <span
              className={`font-mono text-[10px] uppercase tracking-widest ${
                connected ? "text-mint" : "text-rose"
              }`}
            >
              {connected ? "Voice ready" : "Voice offline"}
            </span>
          </div>
          <div className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-rose/70 to-amber/70 text-[12px] font-semibold text-canvas">
            AR
          </div>
        </div>
      </div>
    </header>
  );
}
