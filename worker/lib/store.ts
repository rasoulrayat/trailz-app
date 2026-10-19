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
  /** The technical reason behind a failure, for the team (never shown to users). */
  error_detail: string | null;
  last_polled_at: number | null;
  created_at: number;
  updated_at: number;
}

export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

export const getVideo = (db: D1Database, id: string) =>
  db.prepare("SELECT * FROM videos WHERE id = ?").bind(id).first<VideoRow>();

export const getVideoByKey = (db: D1Database, key: string) =>
  db.prepare("SELECT * FROM videos WHERE canonical_key = ?").bind(key).first<VideoRow>();

/** Paid checks in the last 24 h by this owner (account or device) OR made from this physical device, whoever owned them. */
export async function countBillableToday(db: D1Database, ownerId: string, originDevice: string = ownerId): Promise<number> {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM checks WHERE (device_id = ? OR origin_device = ?) AND billable = 1 AND created_at > ?")
    .bind(ownerId, originDevice, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function recordCheck(db: D1Database, ownerId: string, videoId: string, billable: boolean, originDevice: string = ownerId) {
  await db
    .prepare("INSERT INTO checks (id, device_id, origin_device, video_id, billable, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(newId(), ownerId, originDevice, videoId, billable ? 1 : 0, Date.now())
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
    .prepare("UPDATE videos SET status = 'ready', outcome = ?, result_json = ?, error = NULL, error_detail = NULL, updated_at = ? WHERE id = ?")
    .bind(result.outcome, JSON.stringify(result), Date.now(), id)
    .run();
  // Promise on the "not a travel video" screen: it doesn't use up the user's daily checks.
  if (result.outcome === "not_travel") {
    await db.prepare("UPDATE checks SET billable = 0 WHERE video_id = ?").bind(id).run();
  }
}

export async function saveFailure(db: D1Database, id: string, error: string, detail: string | null = null) {
  await db
    .prepare("UPDATE videos SET status = 'failed', error = ?, error_detail = ?, updated_at = ? WHERE id = ?")
    .bind(error, detail ? detail.slice(0, 1000) : null, Date.now(), id)
    .run();
}

/** Keep a readable record of a server error (never contains API keys: only error messages). */
export async function logError(db: D1Database, route: string, err: unknown, ref: string | null = null) {
  const detail = String(err instanceof Error ? `${err.message}${err.stack ? `\n${err.stack}` : ""}` : err).slice(0, 2000);
  try {
    await db
      .prepare("INSERT INTO error_log (id, at, route, ref, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(newId(), Date.now(), route, ref, detail)
      .run();
    // Keep the table small.
    await db.prepare("DELETE FROM error_log WHERE at < ?").bind(Date.now() - 14 * 24 * 60 * 60 * 1000).run();
  } catch {
    // Logging must never break the request.
  }
}
