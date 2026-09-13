import { createMiddleware } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";

/**
 * Attaches the signed-in user's bearer token to every server-function call so
 * `requireSupabaseAuth` can identify them. Runs on the client only.
 */
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return next();
    return next({ headers: { Authorization: `Bearer ${token}` } });
  },
);
