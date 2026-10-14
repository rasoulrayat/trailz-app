import type { Trip } from "../../shared/types";
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

/** Everything Compare & go shows above the partner buttons. */
export interface TripPrices {
  flights: { origin?: Place | null; destination?: Place | null; quotes: FlightQuote[]; nights: number } | null;
  stays: { city: string; checkIn: string; checkOut: string; nights: number; hotels: HotelQuote[]; searchUrl: string }[];
  note: string;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function tripPrices(db: D1Database, token: string, marker: string | undefined, trip: Trip): Promise<TripPrices> {
  const start = trip.startDate;
  const nights = Math.max(1, trip.plan.days.length - 1);
  const country = trip.places.find((p) => p.country)?.country ?? null;
  const firstBase = trip.plan.days[0]?.base || trip.places[0]?.name || "";
  const arrive = trip.plan.gateway?.arrive || firstBase;

  // Flights need dates; without them we still resolve the airports so the deep link is right.
  // Try the arrival city, then the first base town, then the first place, then the country.
  const candidates = [...new Set([arrive, firstBase, trip.places[0]?.name ?? "", country ?? ""].filter(Boolean))];
  let destination: Place | null = null;
  for (const c of candidates) {
    destination = await iataFor(db, c, fetch);
    if (destination) break;
  }
  const origin = await iataFor(db, trip.origin);
  let flights: TripPrices["flights"] = null;
  if (origin && destination) {
    const quotes = start ? await flightQuotes(db, token, marker, origin.code, destination.code, start, addDays(start, nights)) : [];
    flights = { origin, destination, quotes, nights };
  } else {
    flights = { origin, destination, quotes: [], nights };
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
      const q = await hotelQuotes(db, token, marker, b.city, country, checkIn, checkOut, trip.travelers);
      stays.push({ city: b.city, checkIn, checkOut, nights: b.nights, hotels: q.hotels, searchUrl: q.searchUrl });
    }
  }
  return {
    flights,
    stays,
    note: "Fares and rates seen by travelers in the last 48 hours. The final price is on the partner site.",
  };
}
