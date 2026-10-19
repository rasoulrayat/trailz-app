/**
 * Price providers behind one shape (Offer). Each one is optional: without its key it's skipped.
 *  - Google Flights / Google Hotels via SerpApi: live prices, a monthly quota we guard ourselves.
 *  - Duffel: live airline fares; booking through Duffel's hosted checkout (Duffel Links).
 *  - Aviasales / Hotellook via Travelpayouts: fares and rates seen recently (cached), pay commission.
 */
import type { Offer } from "../../shared/types";
import { googleHotelsLink } from "./google-hotels-link";
import { cached } from "./prices";
import { placeKey } from "./route";

const withTimeout = (ms: number) => AbortSignal.timeout(ms);
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim() : `${m}m`);

// ---------- SerpApi quota: never exceed the plan ----------

export async function serpBudget(db: D1Database, monthlyLimit: number): Promise<boolean> {
  const month = new Date().toISOString().slice(0, 7);
  const key = `serp:quota:${month}`;
  // Start the month's counter at 0 if missing, then take one unit only while under the limit: a single
  // conditional UPDATE, so concurrent requests can't all squeeze through at limit-1.
  await db.prepare("INSERT OR IGNORE INTO kv_cache (key, json, expires_at) VALUES (?, '0', ?)").bind(key, Date.now() + 40 * 24 * 3600_000).run();
  const res = await db
    .prepare("UPDATE kv_cache SET json = CAST(CAST(json AS INTEGER) + 1 AS TEXT) WHERE key = ? AND CAST(json AS INTEGER) < ?")
    .bind(key, monthlyLimit)
    .run();
  return (res.meta.changes ?? 0) === 1;
}

// ---------- Google Flights (SerpApi) ----------

export async function googleFlights(
  db: D1Database,
  apiKey: string,
  monthlyLimit: number,
  origin: string,
  destination: string,
  departure: string,
  ret: string | null,
  adults: number,
  fetcher: typeof fetch = fetch,
): Promise<Offer[]> {
  const key = `gf:${origin}:${destination}:${departure}:${ret ?? "ow"}:${adults}`;
  return cached(db, key, 30 * 60_000, async () => {
    if (!(await serpBudget(db, monthlyLimit))) return [];
    try {
      const u = new URL("https://serpapi.com/search.json");
      u.searchParams.set("engine", "google_flights");
      u.searchParams.set("departure_id", origin);
      u.searchParams.set("arrival_id", destination);
      u.searchParams.set("outbound_date", departure);
      if (ret) u.searchParams.set("return_date", ret);
      u.searchParams.set("type", ret ? "1" : "2");
      u.searchParams.set("adults", String(adults));
      u.searchParams.set("currency", "EUR");
      u.searchParams.set("hl", "en");
      u.searchParams.set("api_key", apiKey);
      const res = await fetcher(u.toString(), { signal: withTimeout(12000) });
      if (!res.ok) return [];
      const body = (await res.json()) as {
        best_flights?: GFlight[];
        other_flights?: GFlight[];
      };
      const all = [...(body.best_flights ?? []), ...(body.other_flights ?? [])].filter((f) => f.price > 0);
      all.sort((a, b) => a.price - b.price);
      const book = `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${origin} to ${destination} on ${departure}${ret ? ` through ${ret}` : ""}`)}&curr=EUR&hl=en`;
      return all.slice(0, 3).map((f) => {
        const airlines = [...new Set((f.flights ?? []).map((s) => s.airline))].slice(0, 2).join(" + ");
        const stops = (f.layovers ?? []).length;
        return {
          provider: "google" as const,
          providerLabel: "Google Flights",
          earns: false,
          freshness: "live" as const,
          price: Math.round(f.price),
          currency: "EUR",
          title: `${airlines || "Flight"} · ${stops === 0 ? "direct" : `${stops} stop${stops > 1 ? "s" : ""}`}${f.total_duration ? ` · ${mins(f.total_duration)}` : ""}`,
          detail: ret ? "round trip" : "one way",
          bookUrl: book,
          unit: "per person" as const,
        };
      });
    } catch {
      return [];
    }
  });
}
interface GFlight {
  price: number;
  total_duration?: number;
  flights?: { airline: string; duration?: number }[];
  layovers?: { duration: number }[];
}

// ---------- Google Hotels (SerpApi) ----------

export async function googleHotels(
  db: D1Database,
  apiKey: string,
  monthlyLimit: number,
  city: string,
  country: string | null,
  checkIn: string,
  checkOut: string,
  adults: number,
  fetcher: typeof fetch = fetch,
): Promise<Offer[]> {
  const q = [city, country].filter(Boolean).join(", ");
  // gh2: offers now link to Google Hotels itself (gh: entries linked to the hotel's own site).
  const key = `gh2:${placeKey(q)}:${checkIn}:${checkOut}:${adults}`;
  return cached(db, key, 30 * 60_000, async () => {
    if (!(await serpBudget(db, monthlyLimit))) return [];
    try {
      const u = new URL("https://serpapi.com/search.json");
      u.searchParams.set("engine", "google_hotels");
      u.searchParams.set("q", q);
      u.searchParams.set("check_in_date", checkIn);
      u.searchParams.set("check_out_date", checkOut);
      u.searchParams.set("adults", String(adults));
      u.searchParams.set("currency", "EUR");
      u.searchParams.set("hl", "en");
      u.searchParams.set("sort_by", "3"); // lowest price
      u.searchParams.set("api_key", apiKey);
      const res = await fetcher(u.toString(), { signal: withTimeout(12000) });
      if (!res.ok) return [];
      const body = (await res.json()) as {
        properties?: {
          name: string;
          /** Google's id for the hotel: its Google Hotels page is /travel/hotels/entity/<token>. */
          property_token?: string;
          hotel_class?: string;
          extracted_hotel_class?: number;
          overall_rating?: number;
          total_rate?: { extracted_lowest?: number };
          rate_per_night?: { extracted_lowest?: number };
        }[];
      };
      // Google rates hotels out of 5. Keep well-rated places (≥ 4.0), cheapest first; fall back to any priced.
      const priced = (body.properties ?? []).map((p) => ({ p, total: p.total_rate?.extracted_lowest ?? 0 })).filter((x) => x.total > 0);
      const good = priced.filter((x) => (x.p.overall_rating ?? 0) >= 4.0);
      return (good.length >= 2 ? good : priced)
        .sort((a, b) => a.total - b.total)
        .slice(0, 3)
        .map(({ p, total }) => ({
          provider: "google" as const,
          providerLabel: "Google Hotels",
          earns: false,
          freshness: "live" as const,
          price: Math.round(total),
          currency: "EUR",
          title: `${p.name}${p.extracted_hotel_class ? ` · ${"★".repeat(Math.min(5, p.extracted_hotel_class))}` : ""}${p.overall_rating ? ` · ${p.overall_rating}/5` : ""}`,
          detail: p.rate_per_night?.extracted_lowest ? `€${Math.round(p.rate_per_night.extracted_lowest)} a night` : undefined,
          // Google Hotels, not the hotel's own site: there the dates and guests are already set and every seller's price shows.
          bookUrl: googleHotelsLink({ token: p.property_token, place: q, checkIn, checkOut, adults }),
          unit: "total" as const,
        }));
    } catch {
      return [];
    }
  });
}

// ---------- Duffel: live airline fares + hosted checkout ----------

export async function duffelFlights(
  db: D1Database,
  token: string,
  origin: string,
  destination: string,
  departure: string,
  ret: string | null,
  adults: number,
  tripId: string,
  fetcher: typeof fetch = fetch,
): Promise<Offer[]> {
  const key = `df2:${origin}:${destination}:${departure}:${ret ?? "ow"}:${adults}`;
  // The cache is shared by every trip on this route; the Book link is trip-specific, so it's added after the cache.
  const offers = await cached(db, key, 20 * 60_000, async () => {
    try {
      const slices = [{ origin, destination, departure_date: departure }, ...(ret ? [{ origin: destination, destination: origin, departure_date: ret }] : [])];
      const res = await fetcher("https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=8000", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "duffel-version": "v2", "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ data: { slices, passengers: Array.from({ length: adults }, () => ({ type: "adult" })), cabin_class: "economy", max_connections: 1 } }),
        signal: withTimeout(15000),
      });
      if (!res.ok) return [];
      const body = (await res.json()) as {
        data?: { offers?: { id: string; total_amount: string; total_currency: string; owner?: { name?: string }; slices?: { duration?: string; segments?: unknown[] }[] }[] };
      };
      const offers = (body.data?.offers ?? [])
        .map((o) => ({ o, total: Number(o.total_amount) }))
        .filter((x) => x.total > 0 && x.o.total_currency === "EUR")
        .sort((a, b) => a.total - b.total)
        .slice(0, 3);
      return offers.map(({ o, total }) => {
        const stops = Math.max(0, ...(o.slices ?? []).map((s) => (s.segments?.length ?? 1) - 1));
        const dur = o.slices?.[0]?.duration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
        const minutes = dur ? Number(dur[1] ?? 0) * 60 + Number(dur[2] ?? 0) : 0;
        return {
          provider: "duffel" as const,
          providerLabel: o.owner?.name ?? "Airline",
          earns: true,
          freshness: "live" as const,
          price: Math.round(total / Math.max(1, adults)),
          currency: "EUR",
          title: `${o.owner?.name ?? "Airline"} · ${stops === 0 ? "direct" : `${stops} stop${stops > 1 ? "s" : ""}`}${minutes ? ` · ${mins(minutes)}` : ""}`,
          detail: "airline fare",
          // The hosted checkout is created when the person taps Book (see /trips/:id/duffel-link).
          bookUrl: `?offer=${encodeURIComponent(o.id)}`,
          unit: "per person" as const,
        };
      });
    } catch {
      return [];
    }
  });
  return offers.map((o) => ({ ...o, bookUrl: `/api/trips/${tripId}/duffel-link${o.bookUrl}` }));
}

/** Duffel Links: a hosted booking page; the markup is our earning. Returns the URL, or the error text. */
export async function duffelCheckoutLink(
  token: string,
  opts: { reference: string; successUrl: string; failureUrl: string; markupRate: number; currency: string; logoUrl?: string },
  fetcher: typeof fetch = fetch,
): Promise<{ url: string | null; error?: string }> {
  try {
    const res = await fetcher("https://api.duffel.com/links/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "duffel-version": "v2", "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        data: {
          reference: opts.reference,
          success_url: opts.successUrl,
          failure_url: opts.failureUrl,
          abandonment_url: opts.failureUrl,
          traveller_currency: opts.currency,
          markup_amount: "0.00",
          markup_currency: opts.currency,
          markup_rate: opts.markupRate.toFixed(2),
          primary_color: "#0B1B3F",
          secondary_color: "#5AA9FF",
          ...(opts.logoUrl ? { logo_url: opts.logoUrl } : {}),
          checkout_display_text: "Booked through TrailZ. Your ticket comes from the airline.",
          flights: { enabled: "true" },
          stays: { enabled: "false" },
        },
      }),
      signal: withTimeout(10000),
    });
    const text = await res.text();
    if (!res.ok) return { url: null, error: `${res.status} ${text.slice(0, 400)}` };
    const body = JSON.parse(text) as { data?: { url?: string } };
    return body.data?.url ? { url: body.data.url } : { url: null, error: `no url in ${text.slice(0, 200)}` };
  } catch (e) {
    return { url: null, error: String(e) };
  }
}

/** Debug helper for /api/health: what Google Hotels returns. */
export async function debugHotels(serpKey: string | undefined, city: string, country: string | null, checkIn: string, checkOut: string) {
  if (!serpKey) return { error: "SERPAPI_KEY not set" };
  try {
    const u = new URL("https://serpapi.com/search.json");
    u.searchParams.set("engine", "google_hotels");
    u.searchParams.set("q", [city, country].filter(Boolean).join(", "));
    u.searchParams.set("check_in_date", checkIn);
    u.searchParams.set("check_out_date", checkOut);
    u.searchParams.set("adults", "1");
    u.searchParams.set("currency", "EUR");
    u.searchParams.set("hl", "en");
    u.searchParams.set("api_key", serpKey);
    const res = await fetch(u.toString(), { signal: withTimeout(15000) });
    const body = (await res.json()) as { properties?: Record<string, unknown>[]; error?: string };
    const p = body.properties?.[0];
    return { status: res.status, error: body.error, count: body.properties?.length ?? 0, first: p ? { name: p.name, total_rate: p.total_rate, overall_rating: p.overall_rating } : null };
  } catch (e) {
    return { error: String(e) };
  }
}
