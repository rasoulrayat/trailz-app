import type { CheckResult, CheckStatusName, Outcome, Platform } from "../../shared/types";

export interface VideoRow {
  id: string;
  canonical_key: string;
  platform: Platform;
  url: string;
  title: string | null;
  author: string | null;
  thumbnail_url: string | null;
  status: CheckStatusName;
  job_id: string | null;
  extract_json: string | null;
  outcome: Outcome | null;
  result_json: string | null;
  error: string | null;
  last_polled_at: number | null;
  created_at: number;
  updated_at: number;
}

export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

export const getVideo = (db: D1Database, id: string) =>
  db.prepare("SELECT * FROM videos WHERE id = ?").bind(id).first<VideoRow>();

export const getVideoByKey = (db: D1Database, key: string) =>
  db.prepare("SELECT * FROM videos WHERE canonical_key = ?").bind(key).first<VideoRow>();

export async function countBillableToday(db: D1Database, deviceId: string): Promise<number> {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM checks WHERE device_id = ? AND billable = 1 AND created_at > ?")
    .bind(deviceId, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function recordCheck(db: D1Database, deviceId: string, videoId: string, billable: boolean) {
  await db
    .prepare("INSERT INTO checks (id, device_id, video_id, billable, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(newId(), deviceId, videoId, billable ? 1 : 0, Date.now())
    .run();
}

/** Claim the right to analyze a finished job, so parallel polls don't run it twice. */
export async function claimForAnalysis(db: D1Database, id: string, extractJson: string): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE videos SET status = 'analyzing', extract_json = ?, updated_at = ? WHERE id = ? AND status = 'extracting'",
    )
    .bind(extractJson, Date.now(), id)
    .run();
  return (res.meta.changes ?? 0) === 1;
}

/** Re-claim an analysis that seems stuck (e.g. the Worker was stopped mid-way). */
export async function reclaimStale(db: D1Database, id: string, olderThanMs: number): Promise<boolean> {
  const now = Date.now();
  const res = await db
    .prepare("UPDATE videos SET updated_at = ? WHERE id = ? AND status = 'analyzing' AND updated_at < ?")
    .bind(now, id, now - olderThanMs)
    .run();
  return (res.meta.changes ?? 0) === 1;
}

export async function saveResult(db: D1Database, id: string, result: CheckResult) {
  await db
    .prepare("UPDATE videos SET status = 'ready', outcome = ?, result_json = ?, error = NULL, updated_at = ? WHERE id = ?")
    .bind(result.outcome, JSON.stringify(result), Date.now(), id)
    .run();
  // Promise on the "not a travel video" screen: it doesn't use up the user's daily checks.
  if (result.outcome === "not_travel") {
    await db.prepare("UPDATE checks SET billable = 0 WHERE video_id = ?").bind(id).run();
  }
}

export async function saveFailure(db: D1Database, id: string, error: string) {
  await db
    .prepare("UPDATE videos SET status = 'failed', error = ?, updated_at = ? WHERE id = ?")
    .bind(error, Date.now(), id)
    .run();
}
