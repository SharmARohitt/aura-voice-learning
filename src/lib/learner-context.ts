import type { LanguagePref, LearnerContext } from "@/lib/types";

const KEY = "aura.learner.context.v1";

export const CLASS_LEVELS = [
  "Class 9",
  "Class 10",
  "Class 11",
  "Class 12",
  "Dropper",
  "College",
] as const;

export const GOALS = ["JEE", "NEET", "Boards", "CUET", "Placements", "Just Learning"] as const;

export const SUBJECTS = [
  "Physics",
  "Chemistry",
  "Mathematics",
  "Biology",
  "Computer Science",
] as const;

export const LANGUAGES: { key: LanguagePref; label: string; hint: string }[] = [
  { key: "hinglish", label: "Hinglish", hint: "Jaise class mein padhate hain" },
  { key: "hindi", label: "हिंदी", hint: "पूरी तरह हिंदी में" },
  { key: "english", label: "English", hint: "Clear simple English" },
  { key: "adaptive", label: "Adaptive", hint: "Match whatever I speak" },
];

/** Map onboarding answers onto the course index. */
export function courseIdFor(context: LearnerContext, subject?: string): string | undefined {
  const s = subject ?? context.subjects[0];
  if (!s) return undefined;
  const map: Record<string, Record<string, string>> = {
    Physics: { "Class 11": "physics-11", "Class 12": "physics-12" },
    Chemistry: { "Class 11": "chemistry-11", "Class 12": "chemistry-11" },
    Mathematics: { "Class 11": "maths-11", "Class 12": "maths-12" },
    Biology: { "Class 11": "biology-11", "Class 12": "biology-11" },
    "Computer Science": { College: "cs-foundation" },
  };
  return map[s]?.[context.class_level];
}

type StoredContext = LearnerContext & { user_id?: string };

/**
 * Local cache of the onboarding answers. It is always tied to one account:
 * a different (or new) signed-in user never inherits someone else's setup.
 */
export function loadContext(userId?: string): LearnerContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredContext;
    if (!parsed?.name || !parsed?.class_level) return null;
    if (userId && parsed.user_id !== userId) return null;
    const { user_id: _ignored, ...context } = parsed;
    return context;
  } catch {
    return null;
  }
}

export function saveContext(context: LearnerContext, userId?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...context, user_id: userId }));
  } catch {
    /* storage unavailable — session still works in memory */
  }
}

export function clearContext(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Natural-language language switching: "hindi mein samjhao", "in english". */
export function detectLanguageRequest(text: string): LanguagePref | null {
  const t = text.toLowerCase();
  if (/\b(in english|english me(in)?|speak english)\b/.test(t)) return "english";
  if (/(hindi me(in)?|हिंदी|hindi mein samjha|pure hindi)/.test(t)) return "hindi";
  if (/\b(hinglish)\b/.test(t)) return "hinglish";
  return null;
}
