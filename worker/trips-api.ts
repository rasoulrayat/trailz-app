import { Hono, type Context } from "hono";
import type { ApiError, Handoff, Mood, RealityCard, SavedPlace, Trip, TripPlan } from "../shared/types";
import { MOODS } from "../shared/types";
import { DEFAULT_ORIGIN, isMock, type Env } from "./env";
import { geminiConfig } from "./lib/analyze";
import { mockPlan, mockPrices } from "./lib/mock";
import { placeKey } from "./lib/route";
import { logError, newId } from "./lib/store";
import { iataFor, tripPrices } from "./lib/prices";
import { buildHandoff, daysFor, generatePlan, suggestTrips } from "./lib/trips";

type AppEnv = { Bindings: Env; Variables: { deviceId: string } };
export const trips = new Hono<AppEnv>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bad = (c: Context<AppEnv, any>, status: 400 | 404 | 500, error: ApiError["error"], message: string) =>
  c.json<ApiError>({ error, message }, status);

// ---------- Saved places ----------

interface SaveRow {
  id: string;
  name: string;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  vibe_json: string;
  check_id: string | null;
  authenticity: number | null;
  created_at: number;
}
const toSaved = (r: SaveRow): SavedPlace => ({
  id: r.id,
  name: r.name,
  region: r.region,
  country: r.country,
  lat: r.lat,
  lng: r.lng,
  vibe: JSON.parse(r.vibe_json) as string[],
  checkId: r.check_id,
  authenticity: r.authenticity,
  createdAt: r.created_at,
});

async function listSaves(db: D1Database, deviceId: string): Promise<SavedPlace[]> {
  const rows = await db.prepare("SELECT * FROM saves WHERE device_id = ? ORDER BY created_at DESC").bind(deviceId).all<SaveRow>();
  return rows.results.map(toSaved);
}

trips.get("/saves", async (c) => {
  const items = await listSaves(c.env.DB, c.get("deviceId"));
  return c.json({ items, suggestions: suggestTrips(items) });
});

trips.post("/saves", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as Partial<SavedPlace> & { name?: string };
  const name = (b.name ?? "").trim().slice(0, 120);
  if (!name) return bad(c, 400, "bad_request", "Which place?");
  const key = placeKey([name, b.country].filter(Boolean).join(" "));
  const id = newId();
  const vibe = (Array.isArray(b.vibe) ? b.vibe : []).filter((v): v is string => typeof v === "string").slice(0, 8);
  await c.env.DB.prepare(
    `INSERT INTO saves (id, device_id, place_key, name, region, country, lat, lng, vibe_json, check_id, authenticity, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (device_id, place_key) DO UPDATE SET vibe_json = excluded.vibe_json, check_id = COALESCE(excluded.check_id, saves.check_id),
       lat = COALESCE(excluded.lat, saves.lat), lng = COALESCE(excluded.lng, saves.lng), authenticity = COALESCE(excluded.authenticity, saves.authenticity)`,
  )
    .bind(id, c.get("deviceId"), key, name, b.region ?? null, b.country ?? null, b.lat ?? null, b.lng ?? null, JSON.stringify(vibe), b.checkId ?? null, b.authenticity ?? null, Date.now())
    .run();
  const items = await listSaves(c.env.DB, c.get("deviceId"));
  return c.json({ items, suggestions: suggestTrips(items) });
});

trips.delete("/saves/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM saves WHERE id = ? AND device_id = ?").bind(c.req.param("id"), c.get("deviceId")).run();
  const items = await listSaves(c.env.DB, c.get("deviceId"));
  return c.json({ items, suggestions: suggestTrips(items) });
});

// ---------- Trips ----------

interface TripRow {
  id: string;
  status: Trip["status"];
  mood: Mood;
  budget_mode: number;
  origin: string;
  travelers: number;
  start_date: string | null;
  places_json: string;
  plan_json: string;
  created_at: number;
  updated_at: number;
}
const toTrip = (r: TripRow): Trip => ({
  id: r.id,
  status: r.status,
  mood: r.mood,
  budgetMode: r.budget_mode === 1,
  origin: r.origin,
  travelers: r.travelers,
  startDate: r.start_date,
  places: JSON.parse(r.places_json) as SavedPlace[],
  plan: JSON.parse(r.plan_json) as TripPlan,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const getTrip = (db: D1Database, id: string, deviceId: string) =>
  db.prepare("SELECT * FROM trips WHERE id = ? AND device_id = ?").bind(id, deviceId).first<TripRow>();

trips.get("/trips", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM trips WHERE device_id = ? ORDER BY updated_at DESC LIMIT 50")
    .bind(c.get("deviceId"))
    .all<TripRow>();
  return c.json({ items: rows.results.map(toTrip) });
});

trips.get("/trips/:id", async (c) => {
  const row = await getTrip(c.env.DB, c.req.param("id"), c.get("deviceId"));
  if (!row) return bad(c, 404, "not_found", "This trip doesn't exist.");
  return c.json({ trip: toTrip(row) });
});

/**
 * Make a plan. Body: { placeIds?: string[], places?: SavedPlace-like[], mood, budgetMode?, days?, origin?, travelers? }
 * placeIds refer to saved places; "places" lets a Reality Card plan a trip without saving first.
 */
trips.post("/trips", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as {
    placeIds?: string[];
    places?: Partial<SavedPlace>[];
    mood?: Mood;
    budgetMode?: boolean;
    days?: number;
    origin?: string;
    travelers?: number;
  };
  const mood = MOODS.find((m) => m.id === b.mood)?.id;
  if (!mood) return bad(c, 400, "bad_request", "Pick a mood.");

  let places: SavedPlace[] = [];
  if (b.placeIds?.length) {
    const all = await listSaves(c.env.DB, c.get("deviceId"));
    places = b.placeIds.map((id) => all.find((s) => s.id === id)).filter((s): s is SavedPlace => !!s);
  }
  for (const p of b.places ?? []) {
    if (p.name && !places.some((x) => placeKey(x.name) === placeKey(p.name!))) {
      places.push({ id: newId(), name: p.name.slice(0, 120), region: p.region ?? null, country: p.country ?? null, lat: p.lat ?? null, lng: p.lng ?? null, vibe: (p.vibe ?? []).slice(0, 8), checkId: p.checkId ?? null, authenticity: p.authenticity ?? null, createdAt: Date.now() });
    }
  }
  places = places.slice(0, 8);
  if (!places.length) return bad(c, 400, "bad_request", "Add at least one place.");

  const days = Math.min(14, Math.max(2, Math.round(Number(b.days) || daysFor(places.length))));
  const origin = (b.origin ?? "").trim().slice(0, 60) || DEFAULT_ORIGIN;
  const travelers = Math.min(9, Math.max(1, Math.round(Number(b.travelers) || 1)));
  const budgetMode = !!b.budgetMode;

  // What the Reality Cards already found out: base cities and local tips make the plan consistent with the cards.
  const notes: string[] = [];
  for (const p of places) {
    if (!p.checkId) continue;
    const row = await c.env.DB.prepare("SELECT card_json FROM place_cards WHERE video_id = ? AND place_key = ?")
      .bind(p.checkId, placeKey(p.name))
      .first<{ card_json: string }>();
    const video = row ? null : await c.env.DB.prepare("SELECT result_json FROM videos WHERE id = ?").bind(p.checkId).first<{ result_json: string | null }>();
    const card: RealityCard | null = row
      ? (JSON.parse(row.card_json) as RealityCard)
      : video?.result_json && (JSON.parse(video.result_json) as { outcome: string; card?: RealityCard }).outcome === "single"
        ? (JSON.parse(video.result_json) as { card: RealityCard }).card
        : null;
    if (card?.base) notes.push(`- ${p.name}: base in ${card.base.city} (${card.base.fromPlace}). Local tip: ${card.base.localTip}`);
    const best = card?.months.map((m, i) => (m === "best" ? i : -1)).filter((i) => i >= 0) ?? [];
    if (best.length) notes.push(`- ${p.name}: best months ${best.map((i) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i]).join(", ")}`);
  }

  let plan: TripPlan;
  try {
    plan = isMock(c.env)
      ? mockPlan(places, mood, days, origin)
      : await generatePlan(geminiConfig(c.env), { places, mood, budgetMode, days, origin, travelers, notes });
  } catch (err) {
    await logError(c.env.DB, "plan", err, places.map((p) => p.name).join(", "));
    return bad(c, 500, "server_error", "We couldn't write this plan right now. Try again in a minute.");
  }

  const now = Date.now();
  const id = newId();
  await c.env.DB.prepare(
    `INSERT INTO trips (id, device_id, status, mood, budget_mode, origin, travelers, start_date, places_json, plan_json, created_at, updated_at)
     VALUES (?, ?, 'draft', ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
  )
    .bind(id, c.get("deviceId"), mood, budgetMode ? 1 : 0, origin, travelers, JSON.stringify(places), JSON.stringify(plan), now, now)
    .run();
  const row = await getTrip(c.env.DB, id, c.get("deviceId"));
  return c.json({ trip: toTrip(row!) });
});

/** Save the plan, or set dates / origin / travelers before booking. */
trips.patch("/trips/:id", async (c) => {
  const row = await getTrip(c.env.DB, c.req.param("id"), c.get("deviceId"));
  if (!row) return bad(c, 404, "not_found", "This trip doesn't exist.");
  const b = (await c.req.json().catch(() => ({}))) as { status?: string; startDate?: string | null; origin?: string; travelers?: number };
  const status = b.status === "saved" ? "saved" : row.status;
  const startDate = b.startDate === undefined ? row.start_date : b.startDate && /^\d{4}-\d{2}-\d{2}$/.test(b.startDate) ? b.startDate : null;
  const origin = (b.origin ?? row.origin).trim().slice(0, 60) || row.origin;
  const travelers = Math.min(9, Math.max(1, Math.round(Number(b.travelers) || row.travelers)));
  await c.env.DB.prepare("UPDATE trips SET status = ?, start_date = ?, origin = ?, travelers = ?, updated_at = ? WHERE id = ?")
    .bind(status, startDate, origin, travelers, Date.now(), row.id)
    .run();
  const fresh = await getTrip(c.env.DB, row.id, c.get("deviceId"));
  return c.json({ trip: toTrip(fresh!) });
});

trips.delete("/trips/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM trips WHERE id = ? AND device_id = ?").bind(c.req.param("id"), c.get("deviceId")).run();
  return c.json({ ok: true });
});

/** Partner links for this trip, with dates and places filled in. */
trips.get("/trips/:id/handoff", async (c) => {
  const row = await getTrip(c.env.DB, c.req.param("id"), c.get("deviceId"));
  if (!row) return bad(c, 404, "not_found", "This trip doesn't exist.");
  const trip = toTrip(row);
  const country = trip.places.find((p) => p.country)?.country ?? null;
  const arrive = trip.plan.gateway?.arrive || trip.plan.days[0]?.base || trip.places[0]?.name || "";
  const leave = trip.plan.gateway?.leave || arrive;
  const [o, d, l] = await Promise.all([
    iataFor(c.env.DB, trip.origin),
    iataFor(c.env.DB, [arrive, country].filter(Boolean).join(", ")),
    leave !== arrive ? iataFor(c.env.DB, [leave, country].filter(Boolean).join(", ")) : Promise.resolve(null),
  ]);
  const codes = { origin: o?.code, destination: d?.code, leave: l?.code };
  const handoff: Handoff = buildHandoff(trip, {
    kiwi: c.env.KIWI_AFFILIATE_ID,
    booking: c.env.BOOKING_AFFILIATE_ID,
    getyourguide: c.env.GYG_PARTNER_ID,
    omio: c.env.OMIO_PARTNER_ID,
    tp: c.env.TP_MARKER && c.env.TP_TRS
      ? { marker: c.env.TP_MARKER, trs: c.env.TP_TRS, kiwiP: c.env.TP_KIWI_P, bookingP: c.env.TP_BOOKING_P, gygP: c.env.TP_GYG_P, omioP: c.env.TP_OMIO_P }
      : undefined,
  }, codes);
  return c.json({ handoff });
});

/** Prices to show before leaving the app (Aviasales fares, Hotellook rates), when a Travelpayouts token is set. */
trips.get("/trips/:id/prices", async (c) => {
  const row = await getTrip(c.env.DB, c.req.param("id"), c.get("deviceId"));
  if (!row) return bad(c, 404, "not_found", "This trip doesn't exist.");
  if (isMock(c.env)) return c.json({ prices: mockPrices(toTrip(row)) });
  if (!c.env.TP_TOKEN) return c.json({ prices: null, reason: "no_token" });
  try {
    const prices = await tripPrices(c.env.DB, c.env.TP_TOKEN, c.env.TP_MARKER, toTrip(row));
    c.header("cache-control", "private, max-age=600");
    return c.json({ prices });
  } catch (err) {
    await logError(c.env.DB, "prices", err, row.id);
    return c.json({ prices: null, reason: "error" });
  }
});
