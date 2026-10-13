import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { MapPoint } from "./MapView";

// Free vector map tiles from OpenStreetMap data, no key needed (https://openfreemap.org).
const STYLE = "https://tiles.openfreemap.org/styles/positron";

/** Real, zoomable map with numbered pins. Calls onFail if the map can't start or load. */
export default function RealMap({ points, height, onFail }: { points: MapPoint[]; height: number; onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    if (!box.current) return;
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: box.current,
        style: STYLE,
        center: [points[0]?.lng ?? 0, points[0]?.lat ?? 0],
        zoom: 3,
        attributionControl: { compact: true },
        // One finger scrolls the page; two fingers (or ctrl + wheel) move the map.
        cooperativeGestures: true,
        dragRotate: false,
        pitchWithRotate: false,
      });
    } catch {
      failRef.current();
      return;
    }
    m.touchZoomRotate.disableRotation();
    map.current = m;
    const timer = setTimeout(() => !m.loaded() && failRef.current(), 10000);
    m.once("load", () => clearTimeout(timer));
    // The map style or tiles can't be fetched (offline, blocked): show the simple pin view at once.
    m.on("error", () => {
      if (!m.loaded()) {
        clearTimeout(timer);
        failRef.current();
      }
    });
    return () => {
      clearTimeout(timer);
      markers.current.forEach((mk) => mk.remove());
      markers.current = [];
      m.remove();
      map.current = null;
    };
    // The map is created once; pins are updated below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const key = points.map((p) => `${p.lat},${p.lng},${p.label},${p.selected ? 1 : 0}`).join("|");
  useEffect(() => {
    const m = map.current;
    if (!m || !points.length) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = points.map((p) => {
      const el = document.createElement("div");
      el.className = `map-pin${p.selected ? " sel" : ""}`;
      el.textContent = p.label;
      el.title = p.name;
      return new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m);
    });
    if (points.length === 1) {
      m.jumpTo({ center: [points[0].lng, points[0].lat], zoom: 9 });
    } else {
      const b = new maplibregl.LngLatBounds();
      points.forEach((p) => b.extend([p.lng, p.lat]));
      m.fitBounds(b, { padding: 36, maxZoom: 11, duration: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div ref={box} className="realmap" style={{ height }} role="region" aria-label="Map" />;
}
