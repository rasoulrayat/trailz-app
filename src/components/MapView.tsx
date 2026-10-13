import { lazy, Suspense, useState } from "react";
import type { PlaceRef } from "../../shared/types";
import { PlaceMap } from "./PlaceMap";

export interface MapPoint {
  lat: number;
  lng: number;
  /** Text inside the pin, e.g. "3". */
  label: string;
  name: string;
  selected?: boolean;
}

// The map library is big, so it only loads on screens that show a map.
const RealMap = lazy(() => import("./RealMap"));

/** A real map; falls back to the simple pin layout when maps can't load (no WebGL, tiles blocked). */
export function MapView({ points, height = 220 }: { points: MapPoint[]; height?: number }) {
  const [failed, setFailed] = useState(false);
  if (!points.length) return null;
  if (failed) {
    if (points.length < 2) return null;
    const places = points.map((p) => ({ name: p.name, lat: p.lat, lng: p.lng, confidence: 1 }) as PlaceRef);
    const selected = new Set(points.flatMap((p, i) => (p.selected ? [i] : [])));
    return <PlaceMap places={places} selected={selected} />;
  }
  return (
    <Suspense fallback={<div className="realmap" style={{ height }} />}>
      <RealMap points={points} height={height} onFail={() => setFailed(true)} />
    </Suspense>
  );
}

/** Places that have coordinates, numbered by their position in the full list. */
export function toPoints<T extends { name: string; lat?: number | null; lng?: number | null }>(
  items: T[],
  isSelected?: (i: number) => boolean,
): MapPoint[] {
  return items.flatMap((p, i) =>
    p.lat != null && p.lng != null
      ? [{ lat: p.lat, lng: p.lng, label: String(i + 1), name: p.name, selected: isSelected?.(i) }]
      : [],
  );
}
