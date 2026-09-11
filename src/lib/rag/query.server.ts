import { canonicalClass, expand, knowledgeIndex, tokenize, TtlCache } from "@/lib/rag/index.server";

/**
 * Compact query understanding — deterministic, no LLM call.
 *
 * Classifying every student question with a large model would add ~1s before
 * retrieval even starts. Rules + the precomputed index cover subject, chapter,
 * topic, intent, language and difficulty in well under a millisecond, and the
 * result is cached per normalised query.
 */

export interface QueryUnderstanding {
  normalized: string;
  tokens: string[];
  subject: string | null;
  chapter: string | null;
  topic: string | null;
  class_level: string | null;
  exam: string | null;
  intent: "explanation" | "definition" | "example" | "practice" | "formula" | "comparison";
  language: "english" | "hindi" | "hinglish";
  difficulty: "easy" | "medium" | "hard";
  parse_ms: number;
}

const HINGLISH_MARKERS = /\b(kya|kaise|kyun|kyu|samjh|samjha|samjhao|batao|hota|hoti|mujhe|bhai|matlab|mein|ka|ki|ke|nahi|acha|thoda|jaldi)\b/i;
const DEVANAGARI = /[\u0900-\u097F]/;

const EXAMS = ["JEE", "NEET", "CBSE", "Boards", "Olympiad"];

const INTENT_RULES: { intent: QueryUnderstanding["intent"]; re: RegExp }[] = [
  { intent: "practice", re: /\b(practice|question|quiz|test|problem|sawal|abhyas)\b/i },
  { intent: "formula", re: /\b(formula|equation|derive|derivation|sutra)\b/i },
  { intent: "example", re: /\b(example|udaharan|numerical|solve)\b/i },
  { intent: "comparison", re: /\b(difference|versus|vs|compare|antar)\b/i },
  { intent: "definition", re: /\b(what is|define|definition|kya hai|kya hoti|kya hota|matlab)\b/i },
];

const cache = new TtlCache<QueryUnderstanding>(10 * 60_000, 300);

export function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export function understand(
  raw: string,
  inherited: { subject?: string | null; chapter?: string | null; class_level?: string } = {},
): QueryUnderstanding {
  const started = performance.now();
  const normalized = normalizeQuery(raw);
  const key = `${normalized}|${inherited.subject ?? ""}|${inherited.chapter ?? ""}`;
  const hit = cache.get(key);
  if (hit) return { ...hit, parse_ms: Number((performance.now() - started).toFixed(2)) };

  const tokens = expand(tokenize(normalized));
  const tokenSet = new Set(tokens);
  const index = knowledgeIndex();

  // Subject / chapter / topic inferred from the index itself — no hardcoding.
  let subject: string | null = null;
  let chapter: string | null = null;
  let topic: string | null = null;
  let best = 0;
  for (const doc of index.chunks) {
    let score = 0;
    for (const t of tokenize(`${doc.chunk.topic} ${doc.chunk.chapter} ${doc.chunk.concepts.join(" ")}`)) {
      if (tokenSet.has(t)) score += 1;
    }
    if (tokenSet.has(doc.chunk.subject.toLowerCase())) score += 2;
    if (score > best) {
      best = score;
      subject = doc.chunk.subject;
      chapter = doc.chunk.chapter;
      topic = doc.chunk.topic;
    }
  }

  // Conversational inheritance: "entropy kya hai?" after "thermodynamics samjhao".
  if (!subject && inherited.subject) subject = inherited.subject;
  if (!chapter && inherited.chapter) chapter = inherited.chapter;

  const language = DEVANAGARI.test(raw)
    ? "hindi"
    : HINGLISH_MARKERS.test(raw)
      ? "hinglish"
      : "english";

  const intent =
    INTENT_RULES.find((r) => r.re.test(normalized))?.intent ?? "explanation";

  const difficulty = /\b(basic|simple|beginner|start|shuru|easy|aasan)\b/i.test(normalized)
    ? "easy"
    : /\b(advanced|deep|derive|proof|tough|hard|jee advanced)\b/i.test(normalized)
      ? "hard"
      : "medium";

  const exam = EXAMS.find((e) => new RegExp(`\\b${e}\\b`, "i").test(raw)) ?? null;
  const classLevel = canonicalClass(
    raw.match(/\b(class\s*(9|10|11|12|ix|x|xi|xii)|(9|10|11|12)th)\b/i)?.[0] ?? inherited.class_level,
  );

  const result: QueryUnderstanding = {
    normalized,
    tokens,
    subject,
    chapter,
    topic,
    class_level: classLevel || null,
    exam,
    intent,
    language,
    difficulty,
    parse_ms: Number((performance.now() - started).toFixed(2)),
  };
  cache.set(key, result);
  return result;
}
