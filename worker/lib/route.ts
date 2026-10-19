import type { PlaceRef, Region } from "../../shared/types";
import type { ExtractPlace, VideoRecord } from "./extract-schema";

/** Which result screen a reel leads to, before any extra AI work is done. */
export type Decision =
  | { outcome: "not_travel"; kind: "not_travel" | "tips" }
  | { outcome: "vibe" }
  | { outcome: "pick"; candidates: PlaceRef[] }
  | { outcome: "single"; place: PlaceRef }
  | { outcome: "multi"; places: PlaceRef[]; regions: Region[] };

export const THRESHOLDS = {
  /** Below this, the reel is treated as not about travel. */
  travel: 0.35,
  /** Places below this are ignored as results… */
  minPlace: 0.4,
  /** …but can still be offered as a guess in the "is it one of these?" picker. */
  minCandidate: 0.15,
  /** A single place needs this much confidence to skip the "is it one of these?" picker. */
  sure: 0.75,
  /** Places closer than this (km) are grouped into one region. */
  clusterKm: 150,
};

export function toPlaceRef(p: ExtractPlace): PlaceRef {
  return {
    name: p.name,
    region: p.region,
    country: p.country,
    lat: p.lat,
    lng: p.lng,
    t: p.t_start,
    evidence: p.evidence,
    confidence: p.confidence,
    creatorLabel:
      p.creator_label && p.creator_label.toLowerCase() !== p.name.toLowerCase() ? p.creator_label : undefined,
  };
}

/** Cache/dedupe key for a place name: case- and accent-insensitive, keeps letters of every script (東京 ≠ 京都). */
export const placeKey = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function dedupe(places: ExtractPlace[]): ExtractPlace[] {
  const seen = new Map<string, ExtractPlace>();
  for (const p of places) {
    const k = placeKey(p.name);
    const prev = seen.get(k);
    if (!prev || p.confidence > prev.confidence) seen.set(k, p);
  }
  // Keep the order the places appear in the reel.
  return places.filter((p) => seen.get(placeKey(p.name)) === p);
}

export function decide(record: VideoRecord): Decision {
  if (record.video_type === "not_travel" || record.travel_confidence < THRESHOLDS.travel) {
    return { outcome: "not_travel", kind: "not_travel" };
  }

  const places = dedupe(record.places.filter((p) => p.confidence >= THRESHOLDS.minPlace));
  const guesses = dedupe(record.places.filter((p) => p.confidence >= THRESHOLDS.minCandidate)).sort(
    (a, b) => b.confidence - a.confidence,
  );

  if (places.length === 0 && guesses.length > 0) {
    return { outcome: "pick", candidates: guesses.slice(0, 3).map(toPlaceRef) };
  }

  if (places.length === 0) {
    if (record.video_type === "travel_tips_no_place" && !(record.vibe_tags?.length)) {
      return { outcome: "not_travel", kind: "tips" };
    }
    return (record.vibe_tags?.length ?? 0) > 0 ? { outcome: "vibe" } : { outcome: "not_travel", kind: "tips" };
  }

  const byConfidence = [...places].sort((a, b) => b.confidence - a.confidence);
  const top = byConfidence[0];
  const looksLikeMany =
    record.places_relation === "separate_places" ||
    ((record.video_type === "multi_place" || record.video_type === "route_trip") &&
      record.places_relation !== "alternatives");

  if (places.length >= 2 && looksLikeMany) {
    const refs = places.map(toPlaceRef);
    return { outcome: "multi", places: refs, regions: clusterRegions(refs) };
  }

  if (record.places_relation === "alternatives" || top.confidence < THRESHOLDS.sure) {
    return { outcome: "pick", candidates: guesses.slice(0, 3).map(toPlaceRef) };
  }

  return { outcome: "single", place: toPlaceRef(top) };
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Group places that are close together, so users can pick one region for a relaxed trip. */
export function clusterRegions(places: PlaceRef[]): Region[] {
  const clusters: { anchor: PlaceRef; idx: number[] }[] = [];
  places.forEach((p, i) => {
    const hit = clusters.find((c) => {
      if (p.lat != null && p.lng != null && c.anchor.lat != null && c.anchor.lng != null) {
        return distanceKm({ lat: p.lat, lng: p.lng }, { lat: c.anchor.lat, lng: c.anchor.lng }) <= THRESHOLDS.clusterKm;
      }
      // Without coordinates, fall back to the region name the AI gave.
      return !!p.region && !!c.anchor.region && placeKey(p.region) === placeKey(c.anchor.region);
    });
    if (hit) hit.idx.push(i);
    else clusters.push({ anchor: p, idx: [i] });
  });

  return clusters.map((c) => {
    const names = c.idx.map((i) => places[i].region).filter((r): r is string => !!r);
    const counts = new Map<string, number>();
    names.forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1));
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return { name: best ?? c.anchor.country ?? c.anchor.name, placeIndexes: c.idx };
  });
}

export function regionAdvice(regions: Region[], placeCount: number): string {
  if (regions.length <= 1) return `All ${placeCount} places are close together, so they work as one route.`;
  return `These places are spread over ${regions.length} regions. For a relaxed trip, pick one region.`;
}
