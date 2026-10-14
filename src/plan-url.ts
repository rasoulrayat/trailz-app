import type { NewSave } from "./api";

/** Link to the mood picker with places carried along (no save needed first). */
export function planUrl(places: NewSave[], placeIds: string[] = []) {
  const p = new URLSearchParams();
  if (placeIds.length) p.set("ids", placeIds.join(","));
  if (places.length) p.set("places", JSON.stringify(places.map((x) => ({ n: x.name, r: x.region, c: x.country, la: x.lat, lo: x.lng, v: x.vibe, k: x.checkId, a: x.authenticity }))));
  return `/plan?${p.toString()}`;
}

export function placesFromUrl(params: URLSearchParams): NewSave[] {
  try {
    const raw = JSON.parse(params.get("places") ?? "[]") as { n: string; r?: string | null; c?: string | null; la?: number | null; lo?: number | null; v?: string[]; k?: string | null; a?: number | null }[];
    return raw.filter((x) => x.n).map((x) => ({ name: x.n, region: x.r ?? null, country: x.c ?? null, lat: x.la ?? null, lng: x.lo ?? null, vibe: x.v ?? [], checkId: x.k ?? null, authenticity: x.a ?? null }));
  } catch {
    return [];
  }
}
