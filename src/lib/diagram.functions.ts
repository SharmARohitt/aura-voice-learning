import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { chatJson } from "@/lib/ai-gateway.server";
import { validateDiagram, type DiagramSpec } from "@/lib/diagram/spec";

const DiagramInput = z.object({
  question: z.string().min(2).max(1000),
  subject: z.string().max(48).default(""),
  chapter: z.string().max(80).default(""),
  concepts: z.array(z.string().max(60)).max(8).default([]),
  short_answer: z.string().max(600).default(""),
  evidence: z.string().max(1800).default(""),
  mode: z.string().max(24).default("explain"),
  language: z.enum(["english", "hindi", "hinglish", "adaptive"]).default("adaptive"),
  grounded: z.boolean().default(false),
});

const MODE_SHAPE: Record<string, string> = {
  beginner: "3-4 nodes maximum, everyday wording, one clear chain.",
  explain: "4-6 nodes, one clear main chain plus at most one branch.",
  deep_dive: "5-7 nodes, include the secondary relationships that matter.",
  quick_revision: "4-5 nodes, compact recall map, formulas as node detail.",
  exam_mode: "4-6 nodes focused on the solution path, conditions and traps.",
  practice: "Show the problem structure and the solution path as steps.",
  socratic: "Show the relationships only, leave the conclusion node unlabeled by result.",
  teacher: "Board-style structure, 4-6 nodes.",
};

const LANGUAGE_LABELS: Record<string, string> = {
  english: "Labels in English.",
  hindi: "Labels in Hindi (Devanagari) — but keep symbols and formulas unchanged (F = ma stays F = ma).",
  hinglish: "Labels in natural readable Hinglish — never awkward literal translation. Symbols and formulas stay unchanged.",
  adaptive: "Labels in the same language mix as the student's question. Symbols and formulas stay unchanged.",
};

/** Small in-process cache so popular concepts render instantly. */
const cache = new Map<string, { spec: DiagramSpec | null; at: number }>();
const TTL_MS = 30 * 60 * 1000;

export const generateDiagram = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DiagramInput.parse(input))
  .handler(async ({ data }): Promise<DiagramSpec | null> => {
    const key = [
      data.subject,
      data.chapter,
      data.mode,
      data.language,
      data.concepts.slice(0, 3).join("|"),
      data.question.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120),
    ].join("::");
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.spec;

    const system = `You design tiny educational diagrams for an AI tutor. You return ONLY structured JSON — never HTML, SVG, Mermaid or code.
The diagram must be readable in 2-5 seconds: few nodes, short labels (max 4 words), obvious direction.
${MODE_SHAPE[data.mode] ?? MODE_SHAPE["explain"]}
${LANGUAGE_LABELS[data.language]}
Never invent numerical values, formulas, scientific relationships, lecture names, teachers or timestamps. Only represent what the answer and evidence already state.
If a diagram would not genuinely help, or you are not confident, return {"enabled":false}.
JSON shape:
{"enabled":true,"type":"flow"|"process"|"concept_map"|"comparison"|"hierarchy"|"timeline"|"sequence"|"cycle"|"custom","title":string(max 5 words),"nodes":[{"id":string_snake_case,"label":string,"kind":"source"|"process"|"sink"|"concept"|"result"|"note","detail":string_optional_short}],"edges":[{"from":node_id,"to":node_id,"label":string_optional_short}]}
Every edge must reference existing node ids. At least 2 nodes and 1 edge, at most 7 nodes.`;

    const user = `Student question: "${data.question}"
Subject: ${data.subject || "unknown"} · Chapter: ${data.chapter || "unknown"}
Key concepts: ${data.concepts.join(", ") || "none"}
Answer summary: ${data.short_answer || "(none)"}
${data.grounded && data.evidence ? `Course evidence (ground the diagram in this):\n${data.evidence}` : "No course evidence — only draw a diagram if the concept is a well-established textbook relationship, otherwise return {\"enabled\":false}."}`;

    try {
      const raw = await chatJson<unknown>([
        { role: "system", content: system },
        { role: "user", content: user },
      ]);
      const spec = validateDiagram(raw);
      cache.set(key, { spec, at: Date.now() });
      if (cache.size > 200) cache.delete(cache.keys().next().value as string);
      return spec;
    } catch (err) {
      // A diagram is an enhancement — failure must never surface to the student.
      console.error("[diagram] generation failed", err);
      return null;
    }
  });
