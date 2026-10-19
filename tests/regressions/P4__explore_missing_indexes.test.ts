// P4-05: the Explore feed query (worker/explore-api.ts:38-47) runs three correlated COUNT subqueries per video row
// (up to 300 rows). checks has no index on video_id (migrations/0001_init.sql:29 indexes device_id, created_at) and
// saves has none on check_id (migrations/0006_saves_trips.sql:16-17), so every row triggers full table scans.
import { describe, expect, it } from "vitest";
import { fakeD1 } from "./P4__fake-d1";

const EXPLORE_SQL = `SELECT v.id, v.outcome, v.result_json, v.extract_json, v.thumbnail_url, v.author, v.platform, v.url, v.title, v.updated_at,
                (SELECT COUNT(*) FROM checks k WHERE k.video_id = v.id) AS checks,
                (SELECT COUNT(*) FROM checks k WHERE k.video_id = v.id AND k.created_at > ?) AS checks7d,
                (SELECT COUNT(*) FROM saves s WHERE s.check_id = v.id) AS saves
         FROM videos v WHERE v.status = 'ready' AND v.outcome IN ('single','multi','vibe')
         ORDER BY v.updated_at DESC LIMIT 300`;

describe("P4 explore query plan", () => {
  it("P4-05: per-video COUNT subqueries use an index instead of scanning checks/saves", () => {
    const db = fakeD1();
    const plan = (db.raw.prepare(`EXPLAIN QUERY PLAN ${EXPLORE_SQL}`).all(0) as { detail: string }[]).map((r) => r.detail);
    const scans = plan.filter((d) => /^SCAN (k|s)$/.test(d));
    // Expected: no full scans inside the correlated subqueries (an index on checks(video_id) / saves(check_id)).
    expect(scans, plan.join("\n")).toEqual([]);
  });
});
