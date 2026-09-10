import type { LectureChunk, SourceAccessStatus, SourceResolution } from "@/lib/types";
import { providerFor, youtube, type AccessCheck } from "@/lib/sources/provider.server";

/**
 * Source health cache + accessible-source fallback.
 *
 * Kept completely off the answer path: the tutor answers from the indexed
 * transcript immediately, and the UI resolves a playable source afterwards.
 */

interface HealthRow {
  url: string;
  status: SourceAccessStatus;
  title: string | null;
  author: string | null;
  http_status: number | null;
  failure_reason: string | null;
  last_checked: number;
}

const HEALTH = new Map<string, HealthRow>();
const TTL_MS = 6 * 60 * 60 * 1000;
const DISCOVERY = new Map<string, { url: string; at: number } | null>();

export function parseTimestamp(ts: string | undefined): number | null {
  if (!ts) return null;
  const parts = ts.split(":").map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return null;
}

export function formatTimestamp(seconds: number | null): string {
  if (seconds == null) return "start";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function accessible(status: SourceAccessStatus): boolean {
  return status === "PUBLIC" || status === "ACCESSIBLE";
}

function usability(status: SourceAccessStatus, timestamped: boolean): number {
  if (!accessible(status)) return 0;
  return timestamped ? 1 : 0.7;
}

async function checkHealth(url: string): Promise<{ row: HealthRow; cached: boolean }> {
  const hit = HEALTH.get(url);
  if (hit && Date.now() - hit.last_checked < TTL_MS) return { row: hit, cached: true };

  const provider = providerFor(url);
  const check: AccessCheck = provider
    ? await provider.validateAccess(url)
    : {
        status: "UNKNOWN",
        title: null,
        author: null,
        http_status: null,
        failure_reason: "no_provider",
      };

  const row: HealthRow = { url, ...check, last_checked: Date.now() };
  HEALTH.set(url, row);
  return { row, cached: false };
}

export interface ResolveDescriptor {
  chunk_id: string;
  subject: string;
  chapter: string;
  topic: string;
  class_level: string;
  lecture_title: string;
  timestamp_start?: string;
  timestamp_end?: string;
  source_url?: string;
  relevance: number;
}

export function describe(chunk: LectureChunk, relevance: number): ResolveDescriptor {
  return {
    chunk_id: chunk.chunk_id,
    subject: chunk.subject,
    chapter: chunk.chapter,
    topic: chunk.topic,
    class_level: chunk.class_level,
    lecture_title: chunk.lecture_title,
    timestamp_start: chunk.timestamp_start,
    timestamp_end: chunk.timestamp_end,
    ...(chunk.source_url ? { source_url: chunk.source_url } : {}),
    relevance,
  };
}

function discoveryQuery(d: ResolveDescriptor): string {
  return [d.class_level, d.subject, d.chapter, d.topic, "lecture explanation"]
    .filter(Boolean)
    .join(" ");
}

/**
 * 1. Verify the indexed lecture's own source (cached health).
 * 2. If it is not accessible, discover an equivalent public resource.
 * 3. If discovery fails, hand back an honest search destination.
 * Never fabricates a timestamp for a resource we did not index.
 */
export async function resolveSource(d: ResolveDescriptor): Promise<SourceResolution> {
  const started = Date.now();
  const startSeconds = parseTimestamp(d.timestamp_start);
  const endSeconds = parseTimestamp(d.timestamp_end);
  let cached = false;
  let reason: string | null = null;

  if (d.source_url) {
    const provider = providerFor(d.source_url);
    const { row, cached: fromCache } = await checkHealth(d.source_url);
    cached = fromCache;
    if (provider && accessible(row.status)) {
      const url = provider.buildReplayUrl(d.source_url, startSeconds);
      return {
        chunk_id: d.chunk_id,
        kind: "primary",
        target: {
          provider: provider.name,
          title: row.title ?? d.lecture_title,
          author: row.author,
          url,
          start_seconds: startSeconds,
          end_seconds: endSeconds,
          label: `Replay ${formatTimestamp(startSeconds)}`,
          access_status: row.status,
        },
        reason: null,
        content_relevance: d.relevance,
        source_usability: usability(row.status, startSeconds != null),
        validation_ms: Date.now() - started,
        cached,
      };
    }
    reason = `Primary lecture source is ${row.status.toLowerCase().replace(/_/g, " ")}.`;
  } else {
    reason = "This lecture is indexed as transcript only — no original video link is stored.";
  }

  // ── Accessible-source fallback ────────────────────────────────────────────
  const query = discoveryQuery(d);
  const memo = DISCOVERY.get(query);
  if (memo && Date.now() - memo.at < TTL_MS) {
    const { row } = await checkHealth(memo.url);
    if (accessible(row.status)) {
      return alternative(d, memo.url, row.title, row.author, row.status, reason, started, true);
    }
  }

  const candidates = await youtube.search(query, 4);
  for (const candidate of candidates) {
    const { row } = await checkHealth(candidate.url);
    if (accessible(row.status)) {
      DISCOVERY.set(query, { url: candidate.url, at: Date.now() });
      return alternative(
        d,
        candidate.url,
        row.title,
        row.author,
        row.status,
        reason,
        started,
        false,
      );
    }
  }

  return {
    chunk_id: d.chunk_id,
    kind: "search",
    target: {
      provider: "youtube",
      title: `${d.topic} — public lectures`,
      author: null,
      url: youtube.searchPageUrl(query),
      start_seconds: null,
      end_seconds: null,
      label: "Find an accessible lecture",
      access_status: "PUBLIC",
    },
    reason: `${reason ?? ""} No verified alternative lecture found right now.`.trim(),
    content_relevance: d.relevance,
    source_usability: 0.4,
    validation_ms: Date.now() - started,
    cached,
  };
}

function alternative(
  d: ResolveDescriptor,
  url: string,
  title: string | null,
  author: string | null,
  status: SourceAccessStatus,
  reason: string | null,
  started: number,
  cached: boolean,
): SourceResolution {
  return {
    chunk_id: d.chunk_id,
    kind: "alternative",
    target: {
      provider: "youtube",
      title: title ?? `${d.topic} — public lecture`,
      author,
      url,
      start_seconds: null,
      end_seconds: null,
      label: "Learn from this lecture",
      access_status: status,
    },
    reason,
    content_relevance: d.relevance,
    source_usability: usability(status, false),
    validation_ms: Date.now() - started,
    cached,
  };
}
