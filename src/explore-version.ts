/**
 * Explore responses are cached by the browser for a minute (cache-control on /api/explore), which is fine while
 * nothing changed. Home fetches the feed before a new visitor is sent to the intro, so right after onboarding —
 * or after a first save — Explore would show the stale "no vibe, no saves" answer. Anything that changes what the
 * feed says about the person bumps this stamp; it goes into the query string so the next request misses the cache.
 */
const KEY = "tz_explore_v";
export function exploreVersion(): string {
  try {
    return localStorage.getItem(KEY) ?? "0";
  } catch {
    return "0";
  }
}
export function bumpExploreVersion(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* ignore: no storage means no caching problem either */
  }
}
