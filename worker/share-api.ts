import { Hono } from "hono";
import type { CheckResult, RealityCard, SharePayload, ShareVotes, Trip, TripPlan, SavedPlace } from "../shared/types";
import type { Env } from "./env";
import { placeKey } from "./lib/route";
import { getVideo, newId } from "./lib/store";

type AppEnv = { Bindings: Env; Variables: AuthVars };
import type { AuthVars } from "./auth-api";
export const share = new Hono<AppEnv>();

const token = () => newId() + newId().slice(0, 4);

async function votesFor(db: D1Database, t: string, deviceId: string): Promise<ShareVotes> {
  const rows = await db.prepare("SELECT device_id, vote, name FROM votes WHERE share_token = ? ORDER BY created_at").bind(t).all<{ device_id: string; vote: string; name: string | null }>();
  const mine = rows.results.find((r) => r.device_id === deviceId)?.vote as "in" | "out" | undefined;
  return {
    in: rows.results.filter((r) => r.vote === "in").length,
    out: rows.results.filter((r) => r.vote === "out").length,
    names: rows.results.filter((r) => r.vote === "in" && r.name).map((r) => r.name!).slice(0, 8),
    mine: mine ?? null,
  };
}

/** Make (or reuse) a share link for a Reality Card or a trip. */
share.post("/share", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { kind?: string; id?: string; placeName?: string };
  const kind = b.kind === "trip" ? "trip" : b.kind === "check" ? "check" : null;
  const id = (b.id ?? "").trim();
  if (!kind || !id) return c.json({ error: "bad_request", message: "What to share?" }, 400);
  const placeName = kind === "check" ? (b.placeName ?? "").trim().slice(0, 120) || null : null;
  if (kind === "trip") {
    const own = await c.env.DB.prepare("SELECT id FROM trips WHERE id = ? AND device_id = ?").bind(id, c.get("deviceId")).first();
    if (!own) return c.json({ error: "not_found", message: "This trip doesn't exist." }, 404);
  } else if (!(await getVideo(c.env.DB, id))) return c.json({ error: "not_found", message: "This check doesn't exist." }, 404);
  const existing = await c.env.DB.prepare("SELECT token FROM shares WHERE kind = ? AND ref_id = ? AND device_id = ? AND (place_name IS ? OR place_name = ?)")
    .bind(kind, id, c.get("deviceId"), placeName, placeName)
    .first<{ token: string }>();
  const t = existing?.token ?? token();
  if (!existing) {
    await c.env.DB.prepare("INSERT INTO shares (token, kind, ref_id, device_id, place_name, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(t, kind, id, c.get("deviceId"), placeName, Date.now())
      .run();
  }
  return c.json({ token: t, url: `${new URL(c.req.url).origin}/s/${t}` });
});

/** The owner's own share for an item, with the current tally. */
share.get("/share/mine", async (c) => {
  const kind = c.req.query("kind");
  const id = c.req.query("id") ?? "";
  const placeName = (c.req.query("placeName") ?? "").trim() || null;
  const row = await c.env.DB.prepare("SELECT token FROM shares WHERE kind = ? AND ref_id = ? AND device_id = ? AND (place_name IS ? OR place_name = ?)")
    .bind(kind, id, c.get("deviceId"), placeName, placeName)
    .first<{ token: string }>();
  if (!row) return c.json({ token: null, votes: null });
  return c.json({ token: row.token, votes: await votesFor(c.env.DB, row.token, c.get("deviceId")) });
});

/** Public: what a share link shows. */
share.get("/share/:token", async (c) => {
  const t = c.req.param("token");
  const s = await c.env.DB.prepare("SELECT * FROM shares WHERE token = ?").bind(t).first<{ kind: "check" | "trip"; ref_id: string; place_name: string | null }>();
  if (!s) return c.json({ error: "not_found", message: "This link has expired." }, 404);
  const votes = await votesFor(c.env.DB, t, c.get("deviceId"));
  if (s.kind === "trip") {
    const row = await c.env.DB.prepare("SELECT plan_json, places_json, mood, start_date, travelers, origin FROM trips WHERE id = ?").bind(s.ref_id).first<{ plan_json: string; places_json: string; mood: Trip["mood"]; start_date: string | null; travelers: number; origin: string }>();
    if (!row) return c.json({ error: "not_found", message: "This trip was deleted." }, 404);
    const payload: SharePayload = {
      kind: "trip",
      token: t,
      trip: { plan: JSON.parse(row.plan_json) as TripPlan, places: JSON.parse(row.places_json) as SavedPlace[], mood: row.mood, startDate: row.start_date, travelers: row.travelers, origin: row.origin },
      votes,
    };
    return c.json(payload);
  }
  const v = await getVideo(c.env.DB, s.ref_id);
  if (!v || !v.result_json) return c.json({ error: "not_found", message: "This check isn't ready." }, 404);
  const result = JSON.parse(v.result_json) as CheckResult;
  let card: RealityCard | null = null;
  if (s.place_name) {
    const row = await c.env.DB.prepare("SELECT card_json FROM place_cards WHERE video_id = ? AND place_key = ?").bind(v.id, placeKey(s.place_name)).first<{ card_json: string }>();
    if (row) {
      const { _backup, ...rest } = JSON.parse(row.card_json) as RealityCard & { _backup?: boolean };
      void _backup;
      card = rest;
    }
  } else if (result.outcome === "single") card = result.card;
  if (!card) return c.json({ error: "not_found", message: "This card isn't ready yet." }, 404);
  const payload: SharePayload = {
    kind: "check",
    token: t,
    card,
    video: { platform: v.platform, url: v.url, title: v.title, author: v.author, thumbnailUrl: v.thumbnail_url },
    votes,
  };
  return c.json(payload);
});

/** Public: one vote per device; voting again changes it. */
share.post("/share/:token/vote", async (c) => {
  const t = c.req.param("token");
  const s = await c.env.DB.prepare("SELECT token FROM shares WHERE token = ?").bind(t).first();
  if (!s) return c.json({ error: "not_found", message: "This link has expired." }, 404);
  const b = (await c.req.json().catch(() => ({}))) as { vote?: string; name?: string };
  const vote = b.vote === "in" ? "in" : b.vote === "out" ? "out" : null;
  if (!vote) return c.json({ error: "bad_request", message: "In or out?" }, 400);
  const name = (b.name ?? "").trim().slice(0, 30) || null;
  await c.env.DB.prepare(
    "INSERT INTO votes (share_token, device_id, vote, name, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (share_token, device_id) DO UPDATE SET vote = excluded.vote, name = COALESCE(excluded.name, votes.name), created_at = excluded.created_at",
  )
    .bind(t, c.get("deviceId"), vote, name, Date.now())
    .run();
  return c.json({ votes: await votesFor(c.env.DB, t, c.get("deviceId")) });
});
