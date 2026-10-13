import type { PlaceRef } from "../../shared/types";

/**
 * Lightweight map: numbered pins placed by latitude/longitude on a plain background.
 * No map tiles yet (that needs a tile provider and attribution); the pins still show
 * how spread out the places are, which is what the decision needs.
 */
export function PlaceMap({ places, selected }: { places: PlaceRef[]; selected: Set<number> }) {
  const pts = places
    .map((p, i) => ({ i, lat: p.lat, lng: p.lng }))
    .filter((p): p is { i: number; lat: number; lng: number } => p.lat != null && p.lng != null);
  if (pts.length < 2) return null;

  const midLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xs = pts.map((p) => p.lng * k);
  const ys = pts.map((p) => p.lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, (maxY - minY) * 1.6, 0.05);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // 12% padding on every side
  const toLeft = (x: number) => 50 + ((x - cx) / span) * 76;
  const toTop = (y: number) => 50 - ((y - cy) / (span / 1.6)) * 76;

  // Nearby places would sit on top of each other: nudge pins apart so every number is readable.
  // Work in a 350×220 box (the map's usual size) so distances match what people see.
  const W = 350;
  const H = 220;
  const MIN = 30;
  const spots = pts.map((p) => ({ i: p.i, x: (toLeft(p.lng * k) / 100) * W, y: (toTop(p.lat) / 100) * H }));
  for (let round = 0; round < 40; round++) {
    let moved = false;
    for (let a = 0; a < spots.length; a++) {
      for (let b = a + 1; b < spots.length; b++) {
        const dx = spots[b].x - spots[a].x;
        const dy = spots[b].y - spots[a].y;
        const d = Math.hypot(dx, dy);
        if (d >= MIN) continue;
        const angle = d < 0.01 ? (b * 2.4) % (2 * Math.PI) : Math.atan2(dy, dx);
        const push = (MIN - d) / 2 + 0.5;
        spots[a].x -= Math.cos(angle) * push;
        spots[a].y -= Math.sin(angle) * push;
        spots[b].x += Math.cos(angle) * push;
        spots[b].y += Math.sin(angle) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const clampPct = (v: number, max: number) => Math.min(94, Math.max(6, (v / max) * 100));

  const labels = places.map((p) => p.name).join(", ");
  return (
    <div className="map" role="img" aria-label={`Map with ${pts.length} numbered places: ${labels}`}>
      {spots.map((p) => (
        <span
          key={p.i}
          className={`pin${selected.has(p.i) ? " sel" : ""}`}
          style={{ left: `${clampPct(p.x, W)}%`, top: `${clampPct(p.y, H)}%` }}
        >
          {p.i + 1}
        </span>
      ))}
    </div>
  );
}
