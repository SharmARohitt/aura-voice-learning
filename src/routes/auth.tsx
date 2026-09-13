import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { PageShell } from "@/components/classroom/PageShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in · Voice Bingo knowledge desk" },
      {
        name: "description",
        content:
          "Sign in to manage the Voice Bingo knowledge base: import study material, review lessons and keep the tutor's answers accurate.",
      },
      { property: "og:title", content: "Sign in · Voice Bingo knowledge desk" },
      {
        property: "og:description",
        content: "Sign in to manage the study material behind Voice Bingo's voice tutor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const fieldClass =
  "rounded-md border border-line bg-canvas px-3 py-2 text-sm text-cream outline-none focus-visible:ring-2 focus-visible:ring-amber/60";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/knowledge` },
        });
        if (error) throw error;
        setMessage("Account created. If confirmation is required, check your email, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await navigate({ to: "/knowledge" });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      eyebrow="Knowledge desk"
      title="Sign in to manage the teaching material"
      intro="Only signed-in editors can add material, review lessons or correct what the tutor says. Learning and practice stay open to everyone."
    >
      <form
        onSubmit={submit}
        className="grid max-w-md gap-4 rounded-xl border border-line bg-surface/60 p-6"
      >
        <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${fieldClass} font-normal normal-case tracking-normal`}
          />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted">
          Password
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${fieldClass} font-normal normal-case tracking-normal`}
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-md bg-amber px-4 py-2.5 text-sm font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="text-xs text-muted underline-offset-4 hover:underline"
        >
          {mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>

        {message && <p className="text-xs text-rose">{message}</p>}
      </form>
    </PageShell>
  );
}
