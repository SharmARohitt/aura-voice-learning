import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import logo from "@/assets/voice-bingo-logo.png";

const TITLE = "Sign in — Voice Bingo Aura-PW";
const DESCRIPTION =
  "Sign in to Voice Bingo so your class, exam goal, subjects and preferred language come back every time you open the classroom.";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/", replace: true });
  }, [loading, user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) throw err;
        if (!data.session) {
          setNotice("Account ban gaya — check your email to confirm, phir sign in karo.");
          setMode("signin");
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError("Google sign-in nahi ho paaya. Try email instead.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/", replace: true });
  };

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-canvas px-4 py-10 text-cream">
      <div
        className="pointer-events-none absolute -left-32 top-0 size-[520px] rounded-full bg-amber/15 blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-32 bottom-0 size-[520px] rounded-full bg-rose/15 blur-[120px]"
        aria-hidden
      />

      <div className="relative w-full max-w-md rounded-3xl border border-cream/10 bg-surface/50 p-6 backdrop-blur-xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <img src={logo} alt="Voice Bingo logo" width={40} height={40} className="size-10 rounded-xl" />
          <div>
            <h1 className="font-display text-[18px] font-bold leading-none">Voice Bingo · Aura</h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              {mode === "signin" ? "Sign in to your classroom" : "Create your account"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={google}
          className="mb-5 w-full rounded-xl border border-cream/15 bg-canvas/50 px-4 py-3 text-[13px] font-semibold text-cream transition-colors hover:border-amber/40"
        >
          Continue with Google
        </button>

        <div className="mb-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted">or email</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full rounded-xl border border-cream/15 bg-canvas/50 px-4 py-3 text-[15px] text-cream placeholder:text-muted focus-visible:outline-2 focus-visible:outline-amber"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 6 characters)"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="w-full rounded-xl border border-cream/15 bg-canvas/50 px-4 py-3 text-[15px] text-cream placeholder:text-muted focus-visible:outline-2 focus-visible:outline-amber"
          />

          {error && (
            <p role="alert" className="rounded-xl border border-rose/25 bg-rose/10 px-3 py-2 text-[12px] text-cream">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-xl border border-mint/25 bg-mint/10 px-3 py-2 text-[12px] text-cream">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-amber to-rose px-6 py-3 text-[13px] font-semibold text-canvas disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-[12px] text-muted">
          {mode === "signin" ? "Naya account chahiye?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            className="font-medium text-amber underline-offset-4 hover:underline"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}
