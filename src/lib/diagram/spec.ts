/**
 * Structured intermediate representation for AI-generated mini diagrams.
 * The model NEVER returns markup — only this data, which is validated here
 * before the renderer draws anything.
 */

export type DiagramType =
  | "flow"
  | "process"
  | "concept_map"
  | "comparison"
  | "hierarchy"
  | "timeline"
  | "sequence"
  | "cycle"
  | "custom";

export type DiagramNodeKind = "source" | "process" | "sink" | "concept" | "result" | "note";

export interface DiagramNode {
  id: string;
  label: string;
  kind: DiagramNodeKind;
  /** Optional one-line detail shown under the label. */
  detail?: string;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface DiagramSpec {
  enabled: true;
  type: DiagramType;
  title: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

const TYPES: DiagramType[] = [
  "flow",
  "process",
  "concept_map",
  "comparison",
  "hierarchy",
  "timeline",
  "sequence",
  "cycle",
  "custom",
];

const KINDS: DiagramNodeKind[] = ["source", "process", "sink", "concept", "result", "note"];

/**
 * Cheap, LLM-free gate: does a visual plausibly help this question?
 * Cost of a wrong "false" is just a missing picture, so stay conservative.
 */
const VISUAL_PATTERNS = [
  /\bhow (does|do|is|are)\b/i,
  /\bkaise\b/i,
  /\bkaam karta\b/i,
  /\bprocess\b/i,
  /\bprakriya\b/i,
  /\bsteps?\b/i,
  /\bflow\b/i,
  /\bcycle\b/i,
  /\bstructure\b/i,
  /\bdiagram\b/i,
  /\bdifference between\b/i,
  /\bcompare\b/i,
  /\bantar\b/i,
  /\bderive|derivation\b/i,
  /\brelationship\b/i,
  /\bwork(s|ing)?\b/i,
  /\bexplain\b/i,
  /\bsamjh(a|ao|aao)\b/i,
  /\bmechanism\b/i,
  /\bhierarchy|layers?|model\b/i,
  /\balgorithm|data structure|recursion|protocol|handshake\b/i,
  /\breaction|bonding|cell|system|law|circuit|engine|photosynthesis\b/i,
];

const TRIVIAL_PATTERNS = [
  /^\s*(what is|define|definition of)\b[^?]{0,40}\??\s*$/i,
  /^[\s\d+\-*/=().]+\??$/,
  /\bkya hota hai\b\s*\??$/i,
];

export function shouldDrawDiagram(question: string, concepts: string[] = []): boolean {
  const q = question.trim();
  if (q.length < 8) return false;
  if (TRIVIAL_PATTERNS.some((re) => re.test(q))) return false;
  if (VISUAL_PATTERNS.some((re) => re.test(q))) return true;
  // Multi-concept answers usually map well onto a concept graph.
  return concepts.length >= 3;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Strict validation: anything malformed yields null, never a broken picture. */
export function validateDiagram(raw: unknown): DiagramSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  if (input["enabled"] === false) return null;

  const type = TYPES.includes(input["type"] as DiagramType)
    ? (input["type"] as DiagramType)
    : "flow";
  const title = typeof input["title"] === "string" ? input["title"].trim().slice(0, 48) : "";
  if (!title) return null;

  const rawNodes = Array.isArray(input["nodes"]) ? input["nodes"] : [];
  const nodes: DiagramNode[] = [];
  const seen = new Set<string>();
  for (const item of rawNodes.slice(0, 9)) {
    if (!item || typeof item !== "object") continue;
    const n = item as Record<string, unknown>;
    const label = typeof n["label"] === "string" ? n["label"].trim().slice(0, 38) : "";
    if (!label) continue;
    const id = (typeof n["id"] === "string" && slug(n["id"])) || slug(label);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const kind = KINDS.includes(n["kind"] as DiagramNodeKind)
      ? (n["kind"] as DiagramNodeKind)
      : "concept";
    const detail =
      typeof n["detail"] === "string" && n["detail"].trim()
        ? n["detail"].trim().slice(0, 48)
        : undefined;
    nodes.push({ id, label, kind, ...(detail ? { detail } : {}) });
  }
  if (nodes.length < 2) return null;

  const rawEdges = Array.isArray(input["edges"]) ? input["edges"] : [];
  const edges: DiagramEdge[] = [];
  for (const item of rawEdges.slice(0, 14)) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const from = typeof e["from"] === "string" ? slug(e["from"]) : "";
    const to = typeof e["to"] === "string" ? slug(e["to"]) : "";
    if (!seen.has(from) || !seen.has(to) || from === to) continue;
    const label =
      typeof e["label"] === "string" && e["label"].trim()
        ? e["label"].trim().slice(0, 18)
        : undefined;
    if (edges.some((x) => x.from === from && x.to === to)) continue;
    edges.push({ from, to, ...(label ? { label } : {}) });
  }
  if (edges.length === 0) return null;

  return { enabled: true, type, title, nodes, edges };
}

/**
 * Deterministic layered layout — computed on the client, never by the model.
 * Roots (no incoming edge) sit on level 0; every edge pushes a node one level
 * down; cycles fall back to insertion order.
 */
export function layoutDiagram(spec: DiagramSpec): Map<string, { x: number; y: number }> {
  const level = new Map<string, number>();
  spec.nodes.forEach((n) => level.set(n.id, 0));
  for (let pass = 0; pass < spec.nodes.length; pass++) {
    let changed = false;
    for (const edge of spec.edges) {
      const next = (level.get(edge.from) ?? 0) + 1;
      if (next > (level.get(edge.to) ?? 0) && next < spec.nodes.length) {
        level.set(edge.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const byLevel = new Map<number, string[]>();
  for (const node of spec.nodes) {
    const l = level.get(node.id) ?? 0;
    byLevel.set(l, [...(byLevel.get(l) ?? []), node.id]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const colWidth = 176;
  const rowHeight = 96;
  for (const [l, ids] of byLevel) {
    ids.forEach((id, i) => {
      const offset = (ids.length - 1) / 2;
      positions.set(id, { x: (i - offset) * colWidth, y: l * rowHeight });
    });
  }
  return positions;
}

/** Which diagram nodes a spoken sentence is talking about. */
export function nodesMentionedIn(sentence: string, nodes: DiagramNode[]): string[] {
  const lower = sentence.toLowerCase();
  return nodes
    .filter((n) => {
      const label = n.label.toLowerCase();
      return label.length > 2 && lower.includes(label);
    })
    .map((n) => n.id);
}
