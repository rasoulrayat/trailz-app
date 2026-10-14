import type { Offer, Trip, TripPrices } from "../../shared/types";
import { duffelFlights, googleFlights, googleHotels } from "./providers";
import { placeKey } from "./route";

/** Cached JSON with expiry, so partner APIs are called once per query. */
export async function cached<T>(db: D1Database, key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const row = await db.prepare("SELECT json FROM kv_cache WHERE key = ? AND expires_at > ?").bind(key, Date.now()).first<{ json: string }>();
  if (row) return JSON.parse(row.json) as T;
  const value = await load();
  await db.prepare("INSERT OR REPLACE INTO kv_cache (key, json, expires_at) VALUES (?, ?, ?)").bind(key, JSON.stringify(value), Date.now() + ttlMs).run();
  return value;
}

const withTimeout = (ms: number) => AbortSignal.timeout(ms);

// ---------- Airport / city codes (Travelpayouts autocomplete, public) ----------

export interface Place {
  code: string;
  name: string;
  country?: string;
}

export async function iataFor(db: D1Database, place: string, fetcher: typeof fetch = fetch): Promise<Place | null> {
  const key = `iata2:${placeKey(place)}`;
  if (!placeKey(place)) return null;
  const [city, country] = place.split(",").map((x) => x.trim());
  return cached(db, key, 30 * 24 * 3600_000, async () => {
    try {
      const u = `https://autocomplete.travelpayouts.com/places2?locale=en&types[]=city&types[]=airport&term=${encodeURIComponent(city)}`;
      const res = await fetcher(u, { signal: withTimeout(5000) });
      if (!res.ok) return null;
      const rows = (await res.json()) as { code: string; name: string; country_name?: string; type?: string }[];
      const inCountry = country ? rows.filter((r) => placeKey(r.country_name ?? "") === placeKey(country)) : rows;
      const pool = inCountry.length ? inCountry : rows;
      const hit = pool.find((r) => r.type === "city") ?? pool[0];
      return hit ? { code: hit.code, name: hit.name, country: hit.country_name } : null;
    } catch {
      return null;
    }
  });
}

// ---------- Flights: Aviasales Data API (cheapest fares seen in the last 48 h) ----------

export interface FlightQuote {
  /** True when this fare is for nearby dates, not the exact ones (nothing cached for the exact dates). */
  approx?: boolean;
  price: number;
  currency: string;
  airline: string;
  transfers: number;
  departureAt: string;
  returnAt?: string;
  /** Tracked Aviasales search link for this fare. */
  url: string;
}

export async function flightQuotes(
  db: D1Database,
  token: string,
  marker: string | undefined,
  origin: string,
  destination: string,
  departureAt: string,
  returnAt: string | null,
  fetcher: typeof fetch = fetch,
): Promise<FlightQuote[]> {
  const key = `fl2:${origin}:${destination}:${departureAt}:${returnAt ?? "ow"}`;
  return cached(db, key, 6 * 3600_000, async () => {
    const exact = await fetchFares(token, marker, origin, destination, departureAt, returnAt, fetcher);
    if (exact.length) return exact;
    // Nothing for the exact dates: the cheapest fares in the same month, marked as nearby dates.
    const month = departureAt.slice(0, 7);
    const near = await fetchFares(token, marker, origin, destination, month, returnAt ? returnAt.slice(0, 7) : null, fetcher);
    return near.map((q) => ({ ...q, approx: true }));
  });
}

async function fetchFares(
  token: string,
  marker: string | undefined,
  origin: string,
  destination: string,
  departureAt: string,
  returnAt: string | null,
  fetcher: typeof fetch,
): Promise<FlightQuote[]> {
  try {
    const u = new URL("https://api.travelpayouts.com/aviasales/v3/prices_for_dates");
    u.searchParams.set("origin", origin);
    u.searchParams.set("destination", destination);
    u.searchParams.set("departure_at", departureAt);
    if (returnAt) u.searchParams.set("return_at", returnAt);
    u.searchParams.set("currency", "eur");
    u.searchParams.set("market", "nl");
    u.searchParams.set("one_way", returnAt ? "false" : "true");
    u.searchParams.set("limit", "5");
    u.searchParams.set("sorting", "price");
    const res = await fetcher(u.toString(), { headers: { "x-access-token": token, "accept-encoding": "gzip" }, signal: withTimeout(8000) });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      data?: { price: number; airline: string; transfers: number; return_transfers?: number; departure_at: string; return_at?: string; link: string; currency?: string }[];
    };
    return (body.data ?? []).slice(0, 3).map((d) => {
      const link = new URL(`https://www.aviasales.com${d.link}`);
      if (marker) link.searchParams.set("marker", marker);
      return {
        price: Math.round(d.price),
        currency: (d.currency ?? "eur").toUpperCase(),
        airline: d.airline,
        transfers: Math.max(d.transfers ?? 0, d.return_transfers ?? 0),
        departureAt: d.departure_at,
        returnAt: d.return_at,
        url: link.toString(),
      };
    });
  } catch {
    return [];
  }
}

// ---------- Hotels: Hotellook cache API (prices per city and dates) ----------

export interface HotelQuote {
  name: string;
  stars: number;
  priceFrom: number;
  currency: string;
  /** Tracked Hotellook search link. */
  url: string;
}

export async function hotelQuotes(
  db: D1Database,
  token: string,
  marker: string | undefined,
  city: string,
  country: string | null,
  checkIn: string,
  checkOut: string,
  adults: number,
  fetcher: typeof fetch = fetch,
): Promise<{ hotels: HotelQuote[]; searchUrl: string }> {
  const location = [city, country].filter(Boolean).join(", ");
  const search = new URL("https://search.hotellook.com/");
  search.searchParams.set("destination", location);
  search.searchParams.set("checkIn", checkIn);
  search.searchParams.set("checkOut", checkOut);
  search.searchParams.set("adults", String(adults));
  search.searchParams.set("currency", "eur");
  search.searchParams.set("language", "en");
  if (marker) search.searchParams.set("marker", marker);
  const key = `ht2:${placeKey(location)}:${checkIn}:${checkOut}`;
  const hotels = await cached(db, key, 6 * 3600_000, async () => {
    const rows = await hotelCache(token, { location }, checkIn, checkOut, fetcher);
    if (rows.length) return rows;
    // Small towns: resolve Hotellook's own location id first, then ask by id.
    const id = await hotellookLocationId(db, token, city, country, fetcher);
    if (id) return hotelCache(token, { locationId: id }, checkIn, checkOut, fetcher);
    return [];
  });
  return { hotels: hotels.map((h) => ({ ...h, url: search.toString() })), searchUrl: search.toString() };
}

async function hotelCache(
  token: string,
  where: { location?: string; locationId?: number },
  checkIn: string,
  checkOut: string,
  fetcher: typeof fetch,
): Promise<Omit<HotelQuote, "url">[]> {
  try {
    const u = new URL("https://engine.hotellook.com/api/v2/cache.json");
    if (where.locationId) u.searchParams.set("locationId", String(where.locationId));
    else u.searchParams.set("location", where.location ?? "");
    u.searchParams.set("checkIn", checkIn);
    u.searchParams.set("checkOut", checkOut);
    u.searchParams.set("currency", "eur");
    u.searchParams.set("limit", "8");
    u.searchParams.set("token", token);
    const res = await fetcher(u.toString(), { signal: withTimeout(8000) });
    if (!res.ok) return [];
    const rows = (await res.json()) as { hotelName: string; stars: number; priceFrom: number }[];
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => r.priceFrom > 0)
      .sort((a, b) => a.priceFrom - b.priceFrom)
      .slice(0, 3)
      .map((r) => ({ name: r.hotelName, stars: r.stars ?? 0, priceFrom: Math.round(r.priceFrom), currency: "EUR" }));
  } catch {
    return [];
  }
}

async function hotellookLocationId(db: D1Database, token: string, city: string, country: string | null, fetcher: typeof fetch): Promise<number | null> {
  return cached(db, `hl-loc:${placeKey(`${city} ${country ?? ""}`)}`, 30 * 24 * 3600_000, async () => {
    try {
      const u = new URL("https://engine.hotellook.com/api/v2/lookup.json");
      u.searchParams.set("query", city);
      u.searchParams.set("lang", "en");
      u.searchParams.set("lookFor", "city");
      u.searchParams.set("limit", "5");
      u.searchParams.set("token", token);
      const res = await fetcher(u.toString(), { signal: withTimeout(6000) });
      if (!res.ok) return null;
      const body = (await res.json()) as { results?: { locations?: { id: string | number; cityName?: string; countryName?: string; fullName?: string }[] } };
      const locs = body.results?.locations ?? [];
      const hit = (country && locs.find((l) => placeKey(l.countryName ?? "") === placeKey(country))) ?? locs[0];
      return hit ? Number(hit.id) : null;
    } catch {
      return null;
    }
  });
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface ProviderKeys {
  tpToken?: string;
  tpMarker?: string;
  serpApiKey?: string;
  serpMonthlyLimit: number;
  duffelToken?: string;
}

const toFlightOffer = (q: FlightQuote, earns: boolean): Offer => ({
  provider: "aviasales",
  providerLabel: "Aviasales",
  earns,
  freshness: "cached",
  price: q.price,
  currency: q.currency,
  title: `${q.airline} · ${q.transfers === 0 ? "direct" : `${q.transfers} stop${q.transfers > 1 ? "s" : ""}`}`,
  detail: `${q.departureAt.slice(0, 10)}${q.returnAt ? ` → ${q.returnAt.slice(0, 10)}` : ""}`,
  approx: q.approx,
  bookUrl: q.url,
  unit: "per person",
});
const toStayOffer = (h: HotelQuote, earns: boolean): Offer => ({
  provider: "hotellook",
  providerLabel: "Hotellook",
  earns,
  freshness: "cached",
  price: h.priceFrom,
  currency: h.currency,
  title: `${h.name}${h.stars ? ` · ${"★".repeat(Math.min(5, Math.round(h.stars)))}` : ""}`,
  bookUrl: h.url,
  unit: "total",
});

/**
 * The ranking rule. Best for the person first, our earnings only break ties:
 *  1. exact dates before nearby dates;  2. live prices before cached ones;  3. cheapest first;
 *  4. an option that earns TrailZ money takes the top slot when it's within TIE_PCT of the cheapest.
 * Search rows (partner pages, no price) always go last.
 */
export const TIE_PCT = 0.03;
export function rank(offers: Offer[]): Offer[] {
  const priced = offers
    .filter((o) => o.kind !== "search" && o.price > 0)
    .sort((a, b) => Number(!!a.approx) - Number(!!b.approx) || Number(a.freshness !== "live") - Number(b.freshness !== "live") || a.price - b.price);
  if (priced.length > 1 && !priced[0].earns) {
    const top = priced[0];
    const i = priced.findIndex((o) => o.earns && o.approx === top.approx && o.freshness === top.freshness && o.price <= top.price * (1 + TIE_PCT));
    if (i > 0) priced.splice(0, 0, ...priced.splice(i, 1));
  }
  const searches = offers.filter((o) => o.kind === "search");
  return [...priced.slice(0, 5), ...searches];
}

/** Everything Compare & go shows above the partner buttons: all providers merged, cheapest first. */
export async function tripPrices(
  db: D1Database,
  keys: ProviderKeys,
  trip: Trip,
  /** Partner search pages with the trip filled in (from buildHandoff), shown after the priced options. */
  searches: { flights: Offer[]; stay: Record<string, Offer[]> } = { flights: [], stay: {} },
): Promise<TripPrices> {
  const start = trip.startDate;
  const nights = Math.max(1, trip.plan.days.length - 1);
  const country = trip.places.find((p) => p.country)?.country ?? null;
  const firstBase = trip.plan.days[0]?.base || trip.places[0]?.name || "";
  const arrive = trip.plan.gateway?.arrive || firstBase;
  const sources = new Set<string>();

  // Airports: the arrival city, then the first base town, then the first place, then the country.
  const candidates = [...new Set([arrive, firstBase, trip.places[0]?.name ?? "", country ?? ""].filter(Boolean))];
  let destination: Place | null = null;
  for (const c of candidates) {
    destination = await iataFor(db, c);
    if (destination) break;
  }
  const origin = await iataFor(db, trip.origin);

  let flights: TripPrices["flights"] = { origin, destination, offers: [], nights };
  if (origin && destination && start) {
    const ret = addDays(start, nights);
    const jobs: Promise<Offer[]>[] = [];
    if (keys.serpApiKey) jobs.push(googleFlights(db, keys.serpApiKey, keys.serpMonthlyLimit, origin.code, destination.code, start, ret, trip.travelers).then((o) => (o.length && sources.add("Google Flights"), o)));
    if (keys.duffelToken) jobs.push(duffelFlights(db, keys.duffelToken, origin.code, destination.code, start, ret, trip.travelers, trip.id).then((o) => (o.length && sources.add("airlines via Duffel"), o)));
    if (keys.tpToken) jobs.push(flightQuotes(db, keys.tpToken, keys.tpMarker, origin.code, destination.code, start, ret).then((q) => (q.length && sources.add("Aviasales"), q.map((x) => toFlightOffer(x, !!keys.tpMarker)))));
    const results = await Promise.all(jobs.map((j) => j.catch(() => [] as Offer[])));
    const all = results.flat();
    // Nearby-date fares only when nothing exact exists.
    const exact = all.filter((o) => !o.approx);
    flights = { origin, destination, offers: rank([...(exact.length ? exact : all), ...searches.flights]), nights };
  } else {
    flights = { origin, destination, offers: rank(searches.flights), nights };
  }

  // One stay block per base town, like the Booking links.
  const bases: { city: string; nights: number; from: number }[] = [];
  trip.plan.days.slice(0, -1).forEach((d, i) => {
    const city = d.base || firstBase;
    const last = bases[bases.length - 1];
    if (last && last.city === city) last.nights++;
    else bases.push({ city, nights: 1, from: i });
  });
  if (!bases.length) bases.push({ city: firstBase, nights, from: 0 });
  const stays: TripPrices["stays"] = [];
  if (start) {
    for (const b of bases.slice(0, 3)) {
      const checkIn = addDays(start, b.from);
      const checkOut = addDays(start, b.from + b.nights);
      const jobs: Promise<Offer[]>[] = [];
      if (keys.serpApiKey) jobs.push(googleHotels(db, keys.serpApiKey, keys.serpMonthlyLimit, b.city, country, checkIn, checkOut, trip.travelers).then((o) => (o.length && sources.add("Google Hotels"), o)));
      let searchUrl = "";
      if (keys.tpToken) {
        jobs.push(
          hotelQuotes(db, keys.tpToken, keys.tpMarker, b.city, country, checkIn, checkOut, trip.travelers).then((q) => {
            searchUrl = q.searchUrl;
            if (q.hotels.length) sources.add("Hotellook");
            return q.hotels.map((h) => toStayOffer(h, !!keys.tpMarker));
          }),
        );
      }
      const results = await Promise.all(jobs.map((j) => j.catch(() => [] as Offer[])));
      stays.push({ city: b.city, checkIn, checkOut, nights: b.nights, offers: rank([...results.flat(), ...(searches.stay[b.city] ?? [])]), searchUrl });
    }
  }
  const list = [...sources];
  return {
    flights,
    stays,
    sources: list,
    note: list.length
      ? `Prices from ${list.join(", ")}. Live prices were checked just now; others were seen by travelers in the last 48 hours. The final price is on the partner site.`
      : "The final price is on the partner site.",
  };
}
