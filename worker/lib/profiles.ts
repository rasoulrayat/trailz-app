import type { PlaceProfile, PlaceRef, RealityCard } from "../../shared/types";
import { placeKey } from "./route";

/**
 * A place profile is everything in a Reality Card that is about the place, not about one reel:
 * where it is, when to go, what it costs, crowds, practicalities, the city guide, nearby gems.
 * It is written once per place and reused by every reel that shows it; only the verdict
 * (authenticity, summary, comparisons) is generated per reel.
 */
export type { PlaceProfile };

/** Profiles older than this are rebuilt (prices and seasons drift slowly). */
export const PROFILE_TTL = 180 * 24 * 3600_000;

/** One key per place: name + country when the country is known ("oia greece"), so Oia in Greece ≠ an Oia elsewhere. */
export const profileKey = (place: Pick<PlaceRef, "name" | "country">) => placeKey([place.name, place.country].filter(Boolean).join(" "));

export const toProfile = (card: RealityCard): PlaceProfile => {
  const { authenticity: _a, summary: _s, comparisons: _c, ...profile } = card;
  return profile;
};

export const withVerdict = (profile: PlaceProfile, verdict: Pick<RealityCard, "authenticity" | "summary" | "comparisons">, place: PlaceRef): RealityCard => ({
  ...profile,
  // Coordinates and the verified flag come from this reel's own geocoding when the profile lacks them.
  place: { ...profile.place, lat: profile.place.lat ?? place.lat, lng: profile.place.lng ?? place.lng },
  confidence: place.verified ? "high" : profile.confidence,
  ...verdict,
});

export async function getProfile(db: D1Database, key: string): Promise<{ profile: PlaceProfile; backup: boolean; age: number } | null> {
  const row = await db.prepare("SELECT json, backup, updated_at FROM place_profiles WHERE place_key = ?").bind(key).first<{ json: string; backup: number; updated_at: number }>();
  if (!row) return null;
  try {
    return { profile: JSON.parse(row.json) as PlaceProfile, backup: row.backup === 1, age: Date.now() - row.updated_at };
  } catch {
    return null;
  }
}

export async function saveProfile(db: D1Database, key: string, profile: PlaceProfile, backup: boolean) {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO place_profiles (place_key, name, country, json, backup, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (place_key) DO UPDATE SET json = excluded.json, backup = excluded.backup, updated_at = excluded.updated_at
       WHERE excluded.backup = 0 OR place_profiles.backup = 1`,
    )
    .bind(key, profile.place.name, profile.place.country || null, JSON.stringify(profile), backup ? 1 : 0, now, now)
    .run();
}
