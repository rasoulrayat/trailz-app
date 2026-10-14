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

export async function iataFor(db: D1Database, city: string, fetcher: typeof fetch = fetch): Promise<Place | null> {
  const key = `iata:${placeKey(city)}`;
  if (!placeKey(city)) return null;
  return cached(db, key, 30 * 24 * 3600_000, async () => {
    try {
      const u = `https://autocomplete.travelpayouts.com/places2?locale=en&types[]=city&types[]=airport&term=${encodeURIComponent(city)}`;
      const res = await fetcher(u, { signal: withTimeout(5000) });
      if (!res.ok) return null;
      const rows = (await res.json()) as { code: string; name: string; country_name?: string; type?: string }[];
      const hit = rows.find((r) => r.type === "city") ?? rows[0];
      return hit ? { code: hit.code, name: hit.name, country: hit.country_name } : null;
    } catch {
      return null;
    }
  });
}

// ---------- Flights: Aviasales Data API (cheapest fares seen in the last 48 h) ----------

export interface FlightQuote {
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
  const key = `fl:${origin}:${destination}:${departureAt}:${returnAt ?? "ow"}`;
  return cached(db, key, 6 * 3600_000, async () => {
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
  });
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
  const key = `ht:${placeKey(location)}:${checkIn}:${checkOut}`;
  const hotels = await cached(db, key, 6 * 3600_000, async () => {
    try {
      const u = new URL("https://engine.hotellook.com/api/v2/cache.json");
      u.searchParams.set("location", location);
      u.searchParams.set("checkIn", checkIn);
      u.searchParams.set("checkOut", checkOut);
      u.searchParams.set("currency", "eur");
      u.searchParams.set("limit", "5");
      u.searchParams.set("token", token);
      const res = await fetcher(u.toString(), { signal: withTimeout(8000) });
      if (!res.ok) return [] as Omit<HotelQuote, "url">[];
      const rows = (await res.json()) as { hotelName: string; stars: number; priceFrom: number; priceAvg?: number }[];
      return rows
        .filter((r) => r.priceFrom > 0)
        .sort((a, b) => a.priceFrom - b.priceFrom)
        .slice(0, 3)
        .map((r) => ({ name: r.hotelName, stars: r.stars ?? 0, priceFrom: Math.round(r.priceFrom), currency: "EUR" }));
    } catch {
      return [] as Omit<HotelQuote, "url">[];
    }
  });
  return { hotels: hotels.map((h) => ({ ...h, url: search.toString() })), searchUrl: search.toString() };
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
  const [origin, destination] = await Promise.all([iataFor(db, trip.origin), iataFor(db, [arrive, country].filter(Boolean).join(", "))]);
  let flights: TripPrices["flights"] = null;
  if (origin && destination) {
    const quotes = start ? await flightQuotes(db, token, marker, origin.code, destination.code, start, addDays(start, nights)) : [];
    flights = { origin, destination, quotes, nights };
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
