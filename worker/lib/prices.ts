import type { Offer, Trip, TripPrices } from "../../shared/types";
import { duffelFlights, googleFlights, googleHotels } from "./providers";
import { placeKey } from "./route";

/** Cached JSON with expiry, so partner APIs are called once per query. */
/** Thrown by a loader to answer without caching (an upstream failure is not a result worth remembering). */
export class Uncached<T> {
  constructor(readonly value: T) {}
}

export async function cached<T>(db: D1Database, key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const row = await db.prepare("SELECT json FROM kv_cache WHERE key = ? AND expires_at > ?").bind(key, Date.now()).first<{ json: string }>();
  if (row) return JSON.parse(row.json) as T;
  let value: T;
  try {
    value = await load();
  } catch (err) {
    if (err instanceof Uncached) return err.value as T;
    throw err;
  }
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
      if (!res.ok) throw new Uncached(null); // a hiccup upstream must not become "no airport" for 30 days
      const rows = (await res.json()) as { code: string; name: string; country_name?: string; type?: string }[];
      const inCountry = country ? rows.filter((r) => placeKey(r.country_name ?? "") === placeKey(country)) : rows;
      const pool = inCountry.length ? inCountry : rows;
      const hit = pool.find((r) => r.type === "city") ?? pool[0];
      return hit ? { code: hit.code, name: hit.name, country: hit.country_name } : null;
    } catch (err) {
      throw err instanceof Uncached ? err : new Uncached(null);
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
    try {
      const exact = await fetchFares(token, marker, origin, destination, departureAt, returnAt, fetcher);
      if (exact.length) return exact;
      // Nothing for the exact dates: the cheapest fares in the same month, marked as nearby dates.
      const month = departureAt.slice(0, 7);
      const near = await fetchFares(token, marker, origin, destination, month, returnAt ? returnAt.slice(0, 7) : null, fetcher);
      return near.map((q) => ({ ...q, approx: true }));
    } catch {
      throw new Uncached([] as FlightQuote[]); // provider down: answer empty now, ask again next time
    }
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
    if (!res.ok) throw new Error(`aviasales ${res.status}`);
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
  } catch (err) {
    throw err instanceof Error ? err : new Error("aviasales failed");
  }
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
  /** Show Duffel's sandbox airline ("Duffel Airways") to users: only for testing the checkout flow. */
  duffelAllowTest?: boolean;
}

/**
 * Aviasales search links from the Data API are for one adult ("/search/AMS1206JTR15061": origin, DDMM, destination,
 * DDMM, adults). Put the trip's travellers in, so the person doesn't pick them again on the partner's page.
 */
export function withPassengers(url: string, adults: number): string {
  const n = Math.min(9, Math.max(1, Math.round(adults)));
  if (n === 1) return url;
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(/^(\/search\/[A-Z]{3}\d{4}[A-Z]{3}(?:\d{4})?)1$/, `$1${n}`);
    return u.toString();
  } catch {
    return url;
  }
}

const toFlightOffer = (q: FlightQuote, earns: boolean, adults = 1): Offer => ({
  provider: "aviasales",
  providerLabel: "Aviasales",
  earns,
  freshness: "cached",
  price: q.price,
  currency: q.currency,
  title: `${q.airline} · ${q.transfers === 0 ? "direct" : `${q.transfers} stop${q.transfers > 1 ? "s" : ""}`}`,
  detail: `${q.departureAt.slice(0, 10)}${q.returnAt ? ` → ${q.returnAt.slice(0, 10)}` : ""}`,
  approx: q.approx,
  bookUrl: withPassengers(q.url, adults),
  unit: "per person",
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

/**
 * Duffel's hosted checkout opens an empty search (its Links API takes no route, dates or passengers), so a Duffel
 * fare is kept as the price but booked on Kiwi's deep link, which arrives with everything filled in.
 */
export function viaKiwi(o: Offer, searches: Offer[], travelers: number): Offer {
  if (o.provider !== "duffel") return o;
  const kiwi = searches.find((s) => s.provider === "kiwi" && s.bookUrl);
  if (!kiwi) return o;
  return {
    ...o,
    providerLabel: "Kiwi.com",
    earns: kiwi.earns,
    detail: `airline fare · ${o.providerLabel}`,
    bookUrl: kiwi.bookUrl,
    note: `Opens Kiwi.com with your route, dates and ${travelers} ${travelers === 1 ? "traveler" : "travelers"} filled in.`,
  };
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
    const duffelToken = keys.duffelToken && (keys.duffelAllowTest || !keys.duffelToken.startsWith("duffel_test")) ? keys.duffelToken : undefined;
    if (duffelToken) jobs.push(duffelFlights(db, duffelToken, origin.code, destination.code, start, ret, trip.travelers, trip.id).then((o) => (o.length && sources.add("airlines via Duffel"), o)));
    if (keys.tpToken) jobs.push(flightQuotes(db, keys.tpToken, keys.tpMarker, origin.code, destination.code, start, ret).then((q) => (q.length && sources.add("Aviasales"), q.map((x) => toFlightOffer(x, !!keys.tpMarker, trip.travelers)))));
    const results = await Promise.all(jobs.map((j) => j.catch(() => [] as Offer[])));
    const all = results.flat().map((o) => viaKiwi(o, searches.flights, trip.travelers));
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
      const results = await Promise.all(jobs.map((j) => j.catch(() => [] as Offer[])));
      const partner = searches.stay[b.city] ?? [];
      stays.push({ city: b.city, checkIn, checkOut, nights: b.nights, offers: rank([...results.flat(), ...partner]), searchUrl: partner[0]?.bookUrl ?? "" });
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
