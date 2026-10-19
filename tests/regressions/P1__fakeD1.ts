/**
 * Tiny in-memory stand-in for D1, just enough for worker/index.ts request-level repros.
 * Matches SQL text; unknown statements are no-ops (first() -> null, all() -> [], run() -> 0 changes).
 */
import type { VideoRow } from "../../worker/lib/store";

export function fakeD1(videos: VideoRow[] = []) {
  const log: { sql: string; args: unknown[] }[] = [];
  const stmt = (sql: string) => {
    let args: unknown[] = [];
    const s = {
      bind(...a: unknown[]) {
        args = a;
        return s;
      },
      async first<T>(): Promise<T | null> {
        log.push({ sql, args });
        // Like D1, hand back a detached copy of the row, never the live object.
        const copy = (v: VideoRow | undefined) => (v ? ({ ...v } as T) : null);
        if (sql.includes("FROM videos WHERE id = ?")) return copy(videos.find((v) => v.id === args[0]));
        if (sql.includes("FROM videos WHERE canonical_key = ?")) return copy(videos.find((v) => v.canonical_key === args[0]));
        if (sql.includes("SELECT url, title, author FROM videos")) {
          const v = videos.find((v) => v.id === args[0]);
          return v ? ({ url: v.url, title: v.title, author: v.author } as T) : null;
        }
        if (sql.includes("COUNT(*) AS n")) return { n: 0 } as T;
        return null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        log.push({ sql, args });
        return { results: [] };
      },
      async run() {
        log.push({ sql, args });
        let changes = 0;
        if (sql.includes("SET thumbnail_url = '' WHERE id = ? AND thumbnail_url IS NULL")) {
          const v = videos.find((v) => v.id === args[0]);
          if (v && v.thumbnail_url === null) {
            v.thumbnail_url = "";
            changes = 1;
          }
        } else if (sql.includes("SET thumbnail_url = ?, title = COALESCE")) {
          const v = videos.find((v) => v.id === args[3]);
          if (v) {
            v.thumbnail_url = args[0] as string;
            v.title = v.title ?? (args[1] as string | null);
            v.author = v.author ?? (args[2] as string | null);
            changes = 1;
          }
        } else if (sql.includes("SET thumbnail_url = ? WHERE id = ?")) {
          const v = videos.find((v) => v.id === args[1]);
          if (v) {
            v.thumbnail_url = args[0] as string;
            changes = 1;
          }
        } else if (sql.includes("SET title = COALESCE(title, ?), author = COALESCE(author, ?) WHERE id = ?")) {
          const v = videos.find((v) => v.id === args[2]);
          if (v) {
            v.title = v.title ?? (args[0] as string | null);
            v.author = v.author ?? (args[1] as string | null);
            changes = 1;
          }
        } else if (sql.includes("SET thumbnail_url = NULL WHERE id = ?")) {
          const v = videos.find((v) => v.id === args[0]);
          if (v) {
            v.thumbnail_url = null;
            changes = 1;
          }
        }
        return { success: true, meta: { changes } };
      },
    };
    return s;
  };
  return { prepare: stmt, log } as unknown as D1Database & { log: typeof log };
}

export const readyRow = (over: Partial<VideoRow> = {}): VideoRow => ({
  id: "abc123def456",
  canonical_key: "tiktok:1",
  platform: "tiktok",
  url: "https://www.tiktok.com/@x/video/1",
  title: "t",
  author: "@x",
  thumbnail_url: null,
  status: "ready",
  job_id: "j",
  extract_json: null,
  outcome: "not_travel",
  result_json: JSON.stringify({ outcome: "not_travel", whatWeSaw: "x", kind: "not_travel" }),
  error: null,
  error_detail: null,
  last_polled_at: null,
  created_at: 1,
  updated_at: 1,
  ...over,
});

/** A waitUntil that remembers its promises so a test can await background work. */
export function fakeCtx() {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil(p: Promise<unknown>) {
      pending.push(p.catch(() => {}));
    },
    passThroughOnException() {},
    pending,
  };
}
