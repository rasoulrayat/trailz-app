/**
 * Viator Partner API (affiliate, Basic access): the lowest price per person for an activity on a given day,
 * with its rating, review count and a product link that already carries TrailZ's affiliate tracking.
 * Viator asks affiliates to cache search results for no more than an hour.
 * Docs: https://docs.viator.com/partner-api/affiliate/technical · key: Worker Secret VIATOR_API_KEY
 */

import { noteFail } from "./ops";

const BASE = "https://api.viator.com/partner";
const TTL = 55 * 60_000;

export type ViatorPick = {
  productCode: string;
  title: string;
  /** Lowest price per person, rounded up to whole euros. */
  fromPrice: number;
  currency: string;
  rating: number | null;
  reviews: number;
  url: string;
};

type ProductSummary = {
  productCode?: string;
  title?: string;
  productUrl?: string;
  pricing?: { summary?: { fromPrice?: number }; currency?: string };
  reviews?: { totalReviews?: number; combinedAverageRating?: number };
};

const STOP = new Set("the of and a an at on in to for with from by tour tours ticket tickets entry guided visit day trip skip line private small group experience".split(" "));
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const words = (s: string) => fold(s).split(" ").filter((w) => w.length >= 4 && !STOP.has(w));

/**
 * A result counts only when its title shares real words with the plan's stop: two of them when the stop has two
 * or more ("Picnic on Barceloneta beach" is not a beach bike tour), and town names don't count.
 */
export function relevant(activity: string, town: string, productTitle: string): boolean {
  const townWords = new Set(words(town));
  const want = words(activity).filter((w) => !townWords.has(w));
  if (!want.length) return false;
  const have = new Set(words(productTitle));
  const shared = want.filter((w) => have.has(w) || (w.endsWith("s") && have.has(w.slice(0, -1))) || have.has(`${w}s`)).length;
  return shared >= Math.min(2, want.length);
}

const headers = (key: string) => ({
  "exp-api-key": key,
  Accept: "application/json;version=2.0",
  "Accept-Language": "en-US",
  "Content-Type": "application/json",
  // Shows up in Viator's affiliate reports next to each booking.
  "campaign-value": "trailz-activity",
});

async function freetext(key: string, term: string, date: string | null, fetcher: typeof fetch): Promise<{ status: number; products: ProductSummary[] }> {
  const body: Record<string, unknown> = {
    searchTerm: term,
    searchTypes: [{ searchType: "PRODUCTS", pagination: { start: 1, count: 6 } }],
    currency: "EUR",
  };
  if (date) body.productFiltering = { dateRange: { from: date, to: date } };
  const res = await fetcher(`${BASE}/search/freetext`, { method: "POST", headers: headers(key), body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  if (!res.ok) return { status: res.status, products: [] };
  const json = (await res.json()) as { products?: { results?: ProductSummary[] } };
  return { status: res.status, products: json.products?.results ?? [] };
}

const pick = (p: ProductSummary): ViatorPick | null => {
  const price = p.pricing?.summary?.fromPrice;
  if (!p.productCode || !p.title || !p.productUrl || !price || price <= 0) return null;
  return {
    productCode: p.productCode,
    title: p.title,
    fromPrice: Math.ceil(price),
    currency: p.pricing?.currency || "EUR",
    rating: typeof p.reviews?.combinedAverageRating === "number" ? Math.round(p.reviews.combinedAverageRating * 10) / 10 : null,
    reviews: p.reviews?.totalReviews ?? 0,
    url: p.productUrl,
  };
};

/** Viator's best match for a stop of the plan on its day: the most relevant product that has a price. */
export async function viatorFor(
  db: D1Database,
  key: string | undefined,
  o: { activity: string; town: string; date: string | null },
  fetcher: typeof fetch = fetch,
): Promise<ViatorPick | null> {
  if (!key || !o.activity) return null;
  const cacheKey = `vi2:${fold(o.activity)}:${fold(o.town)}:${o.date ?? "any"}`;
  const row = await db.prepare("SELECT json FROM kv_cache WHERE key = ? AND expires_at > ?").bind(cacheKey, Date.now()).first<{ json: string }>();
  if (row) return JSON.parse(row.json) as ViatorPick | null;
  try {
    const { status, products } = await freetext(key, `${o.activity} ${o.town}`.trim(), o.date, fetcher);
    if (status !== 200) return noteFail(`Viator HTTP ${status}`), null; // bad key, limits, outage: try again next time
    const best = products.map((p) => ({ p, v: pick(p) })).find((x) => x.v && relevant(o.activity, o.town, x.p.title ?? ""))?.v ?? null;
    await db.prepare("INSERT OR REPLACE INTO kv_cache (key, json, expires_at) VALUES (?, ?, ?)").bind(cacheKey, JSON.stringify(best), Date.now() + TTL).run();
    return best;
  } catch (e) {
    noteFail(String(e));
    return null;
  }
}

/** For /api/health?viator=1: does the key work, and what comes back for a known sight? (no secrets) */
export async function checkViator(key: string | undefined, fetcher: typeof fetch = fetch) {
  if (!key) return { ok: false, error: "VIATOR_API_KEY not set" };
  try {
    const { status, products } = await freetext(key, "Sagrada Familia Barcelona", null, fetcher);
    const first = products.map(pick).find(Boolean) ?? null;
    return { ok: status === 200 && !!first, status, count: products.length, first: first ? { title: first.title, fromPrice: first.fromPrice, currency: first.currency, rating: first.rating, reviews: first.reviews, tracked: /[?&](pid|mcid)=/.test(first.url) } : null };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
