import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function AccountMenu() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return <div className="size-9 animate-pulse rounded-full bg-cream/10" aria-hidden />;
  }

  if (!user) {
    return (
      <Link
        to="/auth"
        className="rounded-xl bg-gradient-to-r from-amber to-rose px-4 py-2 text-[12px] font-semibold text-canvas"
      >
        Sign in
      </Link>
    );
  }

  const email = user.email ?? "Student";
  const initials = email.slice(0, 2).toUpperCase();

  const signOut = async () => {
    setBusy(true);
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    setOpen(false);
    setBusy(false);
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-rose/70 to-amber/70 text-[12px] font-semibold text-canvas outline-none focus-visible:ring-2 focus-visible:ring-amber/60"
      >
        {initials}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close account menu"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-40 mt-2 w-60 rounded-2xl border border-cream/12 bg-surface/95 p-3 backdrop-blur-xl"
          >
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted">Signed in as</p>
            <p className="mt-1 truncate text-[13px] text-cream">{email}</p>
            <button
              type="button"
              onClick={signOut}
              disabled={busy}
              className="mt-3 w-full rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] font-semibold text-cream disabled:opacity-50"
            >
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
