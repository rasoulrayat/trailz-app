import type { SavedPlace } from "../shared/types";

export type GroupBy = "country" | "nearby" | "region";

export interface PlaceGroup {
  id: string;
  title: string;
  sub: string;
  places: SavedPlace[];
  vibe: string[];
  days: number;
}

const km = (a: SavedPlace, b: SavedPlace) => {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const daysFor = (n: number) => Math.min(10, Math.max(2, Math.round(n * 1.5)));
const norm = (s: string) => s.trim().toLowerCase();

/** Macro-regions for "nearby countries". Anything not listed groups by itself. */
const REGION: Record<string, string> = Object.fromEntries(
  (
    [
      ["Southern Europe", ["italy", "spain", "portugal", "greece", "croatia", "malta", "slovenia", "montenegro", "albania", "cyprus"]],
      ["Western Europe", ["france", "netherlands", "belgium", "germany", "switzerland", "austria", "luxembourg", "united kingdom", "ireland"]],
      ["Northern Europe", ["norway", "sweden", "denmark", "finland", "iceland", "estonia", "latvia", "lithuania"]],
      ["Central & Eastern Europe", ["poland", "czech republic", "czechia", "slovakia", "hungary", "romania", "bulgaria", "serbia", "bosnia and herzegovina", "north macedonia"]],
      ["Turkey & the Caucasus", ["turkey", "türkiye", "georgia", "armenia", "azerbaijan"]],
      ["Middle East", ["united arab emirates", "oman", "jordan", "israel", "qatar", "saudi arabia", "lebanon", "egypt"]],
      ["North Africa", ["morocco", "tunisia", "algeria"]],
      ["East Asia", ["japan", "south korea", "china", "taiwan", "hong kong"]],
      ["Southeast Asia", ["thailand", "vietnam", "indonesia", "malaysia", "singapore", "philippines", "cambodia", "laos"]],
      ["South Asia", ["india", "sri lanka", "nepal", "maldives", "bhutan"]],
      ["North America", ["united states", "usa", "canada", "mexico"]],
      ["South America", ["brazil", "argentina", "chile", "peru", "colombia", "ecuador", "bolivia", "uruguay"]],
      ["Oceania", ["australia", "new zealand", "fiji"]],
    ] as [string, string[]][]
  ).flatMap(([region, countries]) => countries.map((c) => [c, region])),
);

const topVibe = (places: SavedPlace[]) => {
  const n = new Map<string, number>();
  places.forEach((p) => p.vibe.forEach((v) => n.set(v, (n.get(v) ?? 0) + 1)));
  return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v]) => v);
};

/** Clusters by distance: every member within `radiusKm` of the cluster's first place. */
function cluster(places: SavedPlace[], radiusKm: number): SavedPlace[][] {
  const out: SavedPlace[][] = [];
  for (const p of places) {
    const hit = out.find((c) => km(c[0], p) <= radiusKm || (km(c[0], p) === Infinity && !!p.country && norm(p.country) === norm(c[0].country ?? "")));
    if (hit) hit.push(p);
    else out.push([p]);
  }
  return out;
}

export function groupPlaces(places: SavedPlace[], by: GroupBy): PlaceGroup[] {
  let groups: { title: string; sub: string; places: SavedPlace[] }[];
  if (by === "country") {
    const m = new Map<string, SavedPlace[]>();
    places.forEach((p) => {
      const k = p.country?.trim() || "Somewhere";
      m.set(k, [...(m.get(k) ?? []), p]);
    });
    groups = [...m.entries()].map(([title, ps]) => ({ title, sub: [...new Set(ps.map((p) => p.region).filter(Boolean))].slice(0, 3).join(" · "), places: ps }));
  } else if (by === "nearby") {
    groups = cluster(places, 120).map((ps) => {
      const regions = ps.map((p) => p.region).filter((r): r is string => !!r);
      const common = [...new Set(regions)].sort((a, b) => regions.filter((x) => x === b).length - regions.filter((x) => x === a).length)[0];
      const title = ps.length === 1 ? ps[0].name : common ? `${common} area` : `Around ${ps[0].name}`;
      return { title, sub: ps[0].country ?? "", places: ps };
    });
  } else {
    const m = new Map<string, SavedPlace[]>();
    places.forEach((p) => {
      const c = norm(p.country ?? "");
      const k = REGION[c] ?? p.country?.trim() ?? "Somewhere";
      m.set(k, [...(m.get(k) ?? []), p]);
    });
    groups = [...m.entries()].map(([title, ps]) => ({ title, sub: [...new Set(ps.map((p) => p.country).filter(Boolean))].join(" · "), places: ps }));
  }
  return groups
    .sort((a, b) => b.places.length - a.places.length)
    .map((g) => ({ id: `${by}:${g.title}`, title: g.title, sub: g.sub, places: g.places, vibe: topVibe(g.places), days: daysFor(g.places.length) }));
}
