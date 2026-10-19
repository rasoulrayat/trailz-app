import { describe, expect, it } from "vitest";
import type { SavedPlace } from "../../shared/types";
import { groupPlaces } from "../../src/groups";

// Hypothesis: in "Nearby" grouping, a saved place WITHOUT coordinates that happens to be first
// becomes a cluster anchor; every later place in the same country then joins it by the country
// fallback, however far apart they are (km(anchor, p) === Infinity -> country match).
// Expected: places 600+ km apart are not "nearby" each other.
const s = (name: string, country: string, lat: number | null, lng: number | null): SavedPlace => ({ id: name, name, country, region: null, lat, lng, vibe: [], createdAt: 0 });

describe("P6 groups: nearby clustering with a coordless first save", () => {
  it("Positano and Milan (≈640 km apart) must not share a Nearby group", () => {
    const places = [s("Rome", "Italy", null, null), s("Positano", "Italy", 40.63, 14.48), s("Milan", "Italy", 45.46, 9.19)];
    const g = groupPlaces(places, "nearby");
    const groupOf = (n: string) => g.find((x) => x.places.some((p) => p.name === n))!;
    expect(groupOf("Positano").id).not.toBe(groupOf("Milan").id);
  });

  it("control: with coordinates on every place, Positano and Milan are apart", () => {
    const places = [s("Rome", "Italy", 41.9, 12.5), s("Positano", "Italy", 40.63, 14.48), s("Milan", "Italy", 45.46, 9.19)];
    const g = groupPlaces(places, "nearby");
    const groupOf = (n: string) => g.find((x) => x.places.some((p) => p.name === n))!;
    expect(groupOf("Positano").id).not.toBe(groupOf("Milan").id);
  });
});
