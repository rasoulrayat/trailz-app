import { Hono, type Context } from "hono";
import type { ApiError, Handoff, Mood, Offer, RealityCard, SavedPlace, Trip, TripPlan } from "../shared/types";
import { MOODS } from "../shared/types";
import { DEFAULT_ORIGIN, isMock, type Env } from "./env";
import { geminiConfig } from "./lib/analyze";
import { mockPlan, mockPrices } from "./lib/mock";
import { placeKey } from "./lib/route";
import { logError, newId } from "./lib/store";
import { iataFor, rank, tripPrices } from "./lib/prices";
import { duffelCheckoutLink } from "./lib/providers";
import { buildHandoff, daysFor, generatePlan, suggestTrips } from "./lib/trips";

type AppEnv = { Bindings: Env; Variables: AuthVars };
import type { AuthVars } from "./auth-api";
import { readProfile } from "./lib/auth";
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
  booked_json: string | null;
  months_json: string | null;
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
  booked: r.booked_json ? (JSON.parse(r.booked_json) as Trip["booked"]) : {},
  bestMonths: r.months_json ? (JSON.parse(r.months_json) as number[]) : [],
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
  // Onboarding answers fill in what the request leaves out: home city and who usually comes along.
  const profile = await readProfile(c.env.DB, c.get("deviceId"));
  const crewSize = { solo: 1, partner: 2, friends: 3, family: 3 } as const;
  const origin = (b.origin ?? "").trim().slice(0, 60) || profile?.home || DEFAULT_ORIGIN;
  const travelers = Math.min(9, Math.max(1, Math.round(Number(b.travelers) || (profile?.crew ? crewSize[profile.crew] : 1))));
  const budgetMode = !!b.budgetMode;

  // What the Reality Cards already found out: base cities and local tips make the plan consistent with the cards.
  const notes: string[] = [];
  const monthVotes = new Map<number, number>();
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
    best.forEach((i) => monthVotes.set(i + 1, (monthVotes.get(i + 1) ?? 0) + 1));
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
  // Months most cards called "best", in calendar order (quick date picks on the booking screen).
  const bestMonths = [...monthVotes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4).map(([m]) => m).sort((a, b) => a - b);
  await c.env.DB.prepare(
    `INSERT INTO trips (id, device_id, status, mood, budget_mode, origin, travelers, start_date, places_json, plan_json, booked_json, months_json, created_at, updated_at)
     VALUES (?, ?, 'draft', ?, ?, ?, ?, NULL, ?, ?, '{}', ?, ?, ?)`,
  )
    .bind(id, c.get("deviceId"), mood, budgetMode ? 1 : 0, origin, travelers, JSON.stringify(places), JSON.stringify(plan), JSON.stringify(bestMonths), now, now)
    .run();
  const row = await getTrip(c.env.DB, id, c.get("deviceId"));
  return c.json({ trip: toTrip(row!) });
});

/** Save the plan, or set dates / origin / travelers before booking. */
trips.patch("/trips/:id", async (c) => {
  const row = await getTrip(c.env.DB, c.req.param("id"), c.get("deviceId"));
  if (!row) return bad(c, 404, "not_found", "This trip doesn't exist.");
  const b = (await c.req.json().catch(() => ({}))) as {
    status?: string;
    startDate?: string | null;
    origin?: string;
    travelers?: number;
    /** Merge: { flights: true } or { stay: { Fira: true } } or { activities: true }. */
    booked?: Trip["booked"];
  };
  const status = b.status === "saved" ? "saved" : row.status;
  const booked: Trip["booked"] = { ...(row.booked_json ? (JSON.parse(row.booked_json) as Trip["booked"]) : {}) };
  if (b.booked) {
    if (b.booked.flights !== undefined) booked.flights = !!b.booked.flights;
    if (b.booked.activities !== undefined) booked.activities = !!b.booked.activities;
    if (b.booked.stay) booked.stay = { ...(booked.stay ?? {}), ...b.booked.stay };
  }
  if (b.startDate && !isFutureDate(b.startDate)) return c.json<ApiError>({ error: "bad_request", message: "Pick a real date that isn't in the past." }, 400);
  const startDate = b.startDate === undefined ? row.start_date : b.startDate || null;
  const origin = (b.origin ?? row.origin).trim().slice(0, 60) || row.origin;
  const travelers = Math.min(9, Math.max(1, Math.round(Number(b.travelers) || row.travelers)));
  // New dates mean new bookings: reset what was booked (unless only the booked flags changed).
  const datesChanged = startDate !== row.start_date || origin !== row.origin || travelers !== row.travelers;
  const bookedOut = datesChanged && !b.booked ? {} : booked;
  await c.env.DB.prepare("UPDATE trips SET status = ?, start_date = ?, origin = ?, travelers = ?, booked_json = ?, updated_at = ? WHERE id = ?")
    .bind(status, startDate, origin, travelers, JSON.stringify(bookedOut), Date.now(), row.id)
    .run();
  const fresh = await getTrip(c.env.DB, row.id, c.get("deviceId"));
  return c.json({ trip: toTrip(fresh!) });
});

trips.delete("/trips/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM trips WHERE id = ? AND device_id = ?").bind(c.req.param("id"), c.get("deviceId")).run();
  return c.json({ ok: true });
});

const partnerIds = (env: Env) => ({
  kiwi: env.KIWI_AFFILIATE_ID,
  booking: env.BOOKING_AFFILIATE_ID,
  getyourguide: env.GYG_PARTNER_ID,
  omio: env.OMIO_PARTNER_ID,
  tp: env.TP_MARKER && env.TP_TRS
    ? { marker: env.TP_MARKER, trs: env.TP_TRS, kiwiP: env.TP_KIWI_P, bookingP: env.TP_BOOKING_P, gygP: env.TP_GYG_P, omioP: env.TP_OMIO_P }
    : undefined,
});

/** Airport codes for the Kiwi deep link. */
async function codesFor(db: D1Database, trip: Trip) {
  const country = trip.places.find((p) => p.country)?.country ?? null;
  const arrive = trip.plan.gateway?.arrive || trip.plan.days[0]?.base || trip.places[0]?.name || "";
  const leave = trip.plan.gateway?.leave || arrive;
  const [o, d, l] = await Promise.all([
    iataFor(db, trip.origin),
    iataFor(db, [arrive, country].filter(Boolean).join(", ")),
    leave !== arrive ? iataFor(db, [leave, country].filter(Boolean).join(", ")) : Promise.resolve(null),
  ]);
  return { origin: o?.code, destination: d?.code, leave: l?.code };
}

const searchRow = (provider: "kiwi" | "booking", label: string, url: string, earns: boolean, title: string): Offer => ({
  provider,
  providerLabel: label,
  kind: "search",
  earns,
  freshness: "live",
  price: 0,
  currency: "EUR",
  title: `${title} on ${label}`,
  bookUrl: url,
  unit: "per person",
});

/** Partner links for this trip, with dates and places filled in. */
trips.get("/trips/:id/handoff", async (c) => {
  if (!c.get("user")) return c.json<ApiError>({ error: "login_required", message: "Log in to see prices and book." }, 401);
  const row = await getTrip(c.env.DB, c.req.param("id"), c.get("deviceId"));
  if (!row) return bad(c, 404, "not_found", "This trip doesn't exist.");
  const trip = toTrip(row);
  const handoff: Handoff = buildHandoff(trip, partnerIds(c.env), await codesFor(c.env.DB, trip));
  return c.json({ handoff });
});

/** Prices to show before leaving the app (Aviasales fares, Hotellook rates), when a Travelpayouts token is set. */
trips.get("/trips/:id/prices", async (c) => {
  if (!c.get("user")) return c.json<ApiError>({ error: "login_required", message: "Log in to see prices and book." }, 401);
  const row = await getTrip(c.env.DB, c.req.param("id"), c.get("deviceId"));
  if (!row) return bad(c, 404, "not_found", "This trip doesn't exist.");
  if (isMock(c.env)) {
    const t = toTrip(row);
    const h = buildHandoff(t, partnerIds(c.env), await codesFor(c.env.DB, t));
    const m = mockPrices(t);
    m.flights = m.flights && { ...m.flights, offers: rank([...m.flights.offers, ...h.flights.map((f) => searchRow("kiwi", f.partner, f.url, true, "Search all flights"))]) };
    m.stays = m.stays.map((s) => ({ ...s, offers: rank([...s.offers, ...h.stay.filter((x) => x.city === s.city).map((x) => searchRow("booking", x.partner, x.url, true, "Search all stays"))]) }));
    return c.json({ prices: m });
  }
  if (!c.env.TP_TOKEN && !c.env.SERPAPI_KEY && !c.env.DUFFEL_TOKEN) return c.json({ prices: null, reason: "no_provider" });
  try {
    const trip = toTrip(row);
    const handoff = buildHandoff(trip, partnerIds(c.env), await codesFor(c.env.DB, trip));
    const searches = {
      flights: handoff.flights.map((f) => searchRow("kiwi", f.partner, f.url, !!c.env.TP_MARKER, "Search all flights")),
      stay: Object.fromEntries(handoff.stay.map((s) => [s.city, [searchRow("booking", s.partner, s.url, !!c.env.TP_BOOKING_P, "Search all stays")]])),
    };
    const prices = await tripPrices(
      c.env.DB,
      {
        tpToken: c.env.TP_TOKEN,
        tpMarker: c.env.TP_MARKER,
        serpApiKey: c.env.SERPAPI_KEY,
        serpMonthlyLimit: Number(c.env.SERPAPI_MONTHLY_LIMIT || "250"),
        duffelToken: c.env.DUFFEL_TOKEN,
        duffelAllowTest: c.env.DUFFEL_ALLOW_TEST === "1",
      },
      trip,
      searches,
    );
    c.header("cache-control", "private, max-age=600");
    return c.json({ prices });
  } catch (err) {
    await logError(c.env.DB, "prices", err, row.id);
    return c.json({ prices: null, reason: "error" });
  }
});

/** "Book" on an airline fare from Duffel: create a hosted checkout page and send the person there. */
trips.get("/trips/:id/duffel-link", async (c) => {
  if (!c.get("user")) return c.json<ApiError>({ error: "login_required", message: "Log in to see prices and book." }, 401);
  const row = await getTrip(c.env.DB, c.req.param("id"), c.get("deviceId"));
  if (!row || !c.env.DUFFEL_TOKEN) return bad(c, 404, "not_found", "This booking link isn't available.");
  const origin = new URL(c.req.url).origin;
  const { url, error } = await duffelCheckoutLink(c.env.DUFFEL_TOKEN, {
    reference: `trailz-${row.id}-${Date.now().toString(36)}`,
    successUrl: `${origin}/trips/${row.id}/book?booked=flights`,
    failureUrl: `${origin}/trips/${row.id}/book?error=duffel`,
    markupRate: Number(c.env.DUFFEL_MARKUP_RATE || "0.03"),
    currency: "EUR",
    logoUrl: `${origin}/icons/icon-512.png`,
  });
  if (!url) {
    await logError(c.env.DB, "duffel-link", error ?? "no checkout url", row.id);
    return c.redirect(`/trips/${row.id}/book?error=duffel`, 302);
  }
  return c.redirect(url, 302);
});
/** "YYYY-MM-DD" that is a real calendar day and not before today (UTC-1 day of slack for time zones west of Greenwich). */
export function isFutureDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
  return d.getTime() >= Date.now() - 36 * 3600_000;
}
