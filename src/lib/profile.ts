import { supabase } from "@/integrations/supabase/client";
import type { LanguagePref, LearnerContext } from "@/lib/types";

/** Read the signed-in learner's saved onboarding profile. */
export async function fetchProfile(userId: string): Promise<LearnerContext | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("name, class_level, goal, subjects, language, onboarded_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  if (!data.onboarded_at || !data.name || !data.class_level) return null;

  return {
    name: data.name,
    class_level: data.class_level,
    goal: data.goal,
    subjects: data.subjects ?? [],
    language: (data.language as LanguagePref) ?? "hinglish",
    onboarded_at: data.onboarded_at,
  };
}

/** Persist onboarding answers against the signed-in account. */
export async function saveProfile(userId: string, context: LearnerContext): Promise<void> {
  await supabase.from("profiles").upsert(
    {
      id: userId,
      name: context.name,
      class_level: context.class_level,
      goal: context.goal,
      subjects: context.subjects,
      language: context.language,
      onboarded_at: context.onboarded_at,
    },
    { onConflict: "id" },
  );
}

/** Clear onboarding so the learner can redo it (account stays signed in). */
export async function resetProfile(userId: string): Promise<void> {
  await supabase.from("profiles").update({ onboarded_at: null }).eq("id", userId);
}
