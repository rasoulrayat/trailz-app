import { placeKey } from "./route";

export interface GeoHit {
  lat: number;
  lng: number;
  displayName: string;
  country?: string;
}

/**
 * Check that a place really exists, using OpenStreetMap's Nominatim.
 * Usage policy: max 1 request per second, identify the app, show attribution.
 * Results are cached in D1 so each place name is looked up once.
 * Swap this for a commercial places API when traffic grows.
 */
export async function geocode(
  db: D1Database,
  contact: string,
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<GeoHit | null> {
  const key = placeKey(query);
  if (!key) return null;
  const cached = await db
    .prepare("SELECT result_json FROM geocode_cache WHERE query = ?")
    .bind(key)
    .first<{ result_json: string | null }>();
  if (cached) return cached.result_json ? (JSON.parse(cached.result_json) as GeoHit) : null;

  let hit: GeoHit | null = null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`;
    const res = await fetcher(url, {
      headers: { "user-agent": `TrailZ/0.1 (${contact})`, "accept-language": "en" },
    });
    if (!res.ok) return null; // don't cache failures of the service itself
    const rows = (await res.json()) as {
      lat: string;
      lon: string;
      display_name: string;
      address?: { country?: string };
    }[];
    if (rows[0]) {
      hit = {
        lat: Number(rows[0].lat),
        lng: Number(rows[0].lon),
        displayName: rows[0].display_name,
        country: rows[0].address?.country,
      };
    }
  } catch {
    return null;
  }
  await db
    .prepare("INSERT OR REPLACE INTO geocode_cache (query, result_json, created_at) VALUES (?, ?, ?)")
    .bind(key, hit ? JSON.stringify(hit) : null, Date.now())
    .run();
  return hit;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
