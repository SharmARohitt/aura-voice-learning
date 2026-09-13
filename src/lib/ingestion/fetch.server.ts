/**
 * Polite fetching for the ingestion pipeline.
 *
 * Every outbound request identifies itself, honours robots.txt, stays inside a
 * per-host rate limit and retries transient failures with backoff. Ingestion
 * is never allowed to hammer a publisher.
 */

const USER_AGENT =
  "AuraLearnBot/1.0 (educational knowledge indexer; contact via the app owner)";

/** Minimum gap between two requests to the same host. */
const HOST_INTERVAL_MS = 1200;
const lastHit = new Map<string, number>();
const robotsCache = new Map<string, { allowed: boolean; checkedAt: number }>();
const ROBOTS_TTL_MS = 30 * 60_000;

function hostOf(url: string): string {
  return new URL(url).host;
}

async function throttle(host: string): Promise<void> {
  const previous = lastHit.get(host) ?? 0;
  const wait = previous + HOST_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

/** Minimal robots.txt evaluation for our own user agent and `*`. */
export async function robotsAllows(url: string): Promise<boolean> {
  const host = hostOf(url);
  const cached = robotsCache.get(host);
  if (cached && Date.now() - cached.checkedAt < ROBOTS_TTL_MS) return cached.allowed;

  let allowed = true;
  try {
    const origin = new URL(url).origin;
    await throttle(host);
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const body = await res.text();
      allowed = evaluateRobots(body, new URL(url).pathname);
    }
  } catch {
    // No reachable robots.txt means no stated restriction.
    allowed = true;
  }
  robotsCache.set(host, { allowed, checkedAt: Date.now() });
  return allowed;
}

export function evaluateRobots(body: string, path: string): boolean {
  const lines = body.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim());
  let applies = false;
  let allowed = true;
  let matchedLength = 0;

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      applies = value === "*" || USER_AGENT.toLowerCase().startsWith(value.toLowerCase());
      continue;
    }
    if (!applies || (key !== "disallow" && key !== "allow")) continue;
    if (value === "") continue;
    if (!path.startsWith(value)) continue;
    // Longest matching rule wins, as per the robots convention.
    if (value.length >= matchedLength) {
      matchedLength = value.length;
      allowed = key === "allow";
    }
  }
  return allowed;
}

export interface FetchedPage {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

/** Fetch a page politely. Throws with a clear reason the UI can display. */
export async function politeFetch(url: string, attempt = 0): Promise<FetchedPage> {
  const host = hostOf(url);
  if (!(await robotsAllows(url))) {
    throw new Error("This site's robots.txt disallows automated access to that page.");
  }
  await throttle(host);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/plain,*/*" },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    });
  } catch (error) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
      return politeFetch(url, attempt + 1);
    }
    throw new Error(`Could not reach ${host}: ${(error as Error).message}`);
  }

  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    const retryAfter = Number(res.headers.get("retry-after")) || 0;
    await new Promise((r) => setTimeout(r, Math.max(retryAfter * 1000, 1000 * 2 ** attempt)));
    return politeFetch(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${host} returned ${res.status} for that page.`);

  return {
    url: res.url || url,
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    body: await res.text(),
  };
}
