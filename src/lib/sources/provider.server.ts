import type { SourceAccessStatus } from "@/lib/types";

/**
 * Source abstraction.
 *
 * The RAG core never talks to YouTube (or any other platform) directly — it
 * asks a SourceProvider to discover, validate and build replay URLs. Adding a
 * new educational source later means adding a provider, not touching retrieval.
 */

export interface SourceCandidate {
  provider: string;
  source_id: string;
  url: string;
  title: string | null;
  author: string | null;
}

export interface AccessCheck {
  status: SourceAccessStatus;
  title: string | null;
  author: string | null;
  http_status: number | null;
  failure_reason: string | null;
}

export interface SourceProvider {
  readonly name: string;
  /** Does this provider own the given URL? */
  owns(url: string): boolean;
  /** Discover publicly available educational resources for a query. */
  search(query: string, limit?: number): Promise<SourceCandidate[]>;
  validateAccess(url: string): Promise<AccessCheck>;
  /** Timestamp-aware deep link, when the platform supports it. */
  buildReplayUrl(url: string, startSeconds: number | null): string;
  supportsTimestamps: boolean;
}

const UA =
  "Mozilla/5.0 (compatible; VoiceBingoBot/1.0; +educational metadata indexing)";

async function timedFetch(url: string, ms = 4500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function youtubeId(url: string): string | null {
  const m =
    url.match(/[?&]v=([A-Za-z0-9_-]{11})/) ??
    url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ??
    url.match(/embed\/([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}

/**
 * Public YouTube provider. Only reads publicly available pages and the public
 * oEmbed endpoint — no authentication, paywall or DRM is ever bypassed, and no
 * media is downloaded or redistributed. We index metadata and link out.
 */
export class YouTubeProvider implements SourceProvider {
  readonly name = "youtube";
  readonly supportsTimestamps = true;

  owns(url: string): boolean {
    return /youtube\.com|youtu\.be/.test(url);
  }

  searchPageUrl(query: string): string {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  }

  async search(query: string, limit = 4): Promise<SourceCandidate[]> {
    try {
      const res = await timedFetch(this.searchPageUrl(query), 5000);
      if (!res.ok) return [];
      const html = await res.text();
      const ids: string[] = [];
      for (const m of html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)) {
        const id = m[1]!;
        if (!ids.includes(id)) ids.push(id);
        if (ids.length >= limit) break;
      }
      return ids.map((id) => ({
        provider: this.name,
        source_id: id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: null,
        author: null,
      }));
    } catch (error) {
      console.error("[source:youtube] search failed", (error as Error).message);
      return [];
    }
  }

  async validateAccess(url: string): Promise<AccessCheck> {
    const id = youtubeId(url);
    if (!id) {
      return {
        status: "UNKNOWN",
        title: null,
        author: null,
        http_status: null,
        failure_reason: "unparsable_url",
      };
    }
    try {
      const res = await timedFetch(
        `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`,
        4000,
      );
      if (res.ok) {
        const data = (await res.json()) as { title?: string; author_name?: string };
        return {
          status: "PUBLIC",
          title: data.title ?? null,
          author: data.author_name ?? null,
          http_status: 200,
          failure_reason: null,
        };
      }
      const status: SourceAccessStatus =
        res.status === 404
          ? "REMOVED"
          : res.status === 401 || res.status === 403
            ? "PRIVATE"
            : "TEMPORARILY_UNAVAILABLE";
      return {
        status,
        title: null,
        author: null,
        http_status: res.status,
        failure_reason: `oembed_${res.status}`,
      };
    } catch (error) {
      return {
        status: "TEMPORARILY_UNAVAILABLE",
        title: null,
        author: null,
        http_status: null,
        failure_reason: (error as Error).message,
      };
    }
  }

  buildReplayUrl(url: string, startSeconds: number | null): string {
    const id = youtubeId(url);
    const base = id ? `https://www.youtube.com/watch?v=${id}` : url;
    if (startSeconds == null || startSeconds <= 0) return base;
    return `${base}&t=${Math.floor(startSeconds)}s`;
  }
}

export const PROVIDERS: SourceProvider[] = [new YouTubeProvider()];

export function providerFor(url: string): SourceProvider | null {
  return PROVIDERS.find((p) => p.owns(url)) ?? null;
}

export const youtube = PROVIDERS[0] as YouTubeProvider;
