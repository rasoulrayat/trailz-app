import { describe, expect, it } from "vitest";
import type { SavedPlace } from "../shared/types";
import { groupPlaces } from "../src/groups";

const s = (name: string, country: string, region: string, lat: number, lng: number): SavedPlace => ({ id: name, name, country, region, lat, lng, vibe: [], createdAt: 0 });
const places = [
  s("Atrani", "Italy", "Amalfi Coast", 40.63, 14.61),
  s("Positano", "Italy", "Amalfi Coast", 40.63, 14.48),
  s("Val d'Orcia", "Italy", "Tuscany", 43.07, 11.6),
  s("Oia", "Greece", "Santorini", 36.46, 25.37),
  s("Kyoto", "Japan", "Kansai", 35.01, 135.77),
];

describe("saved groups", () => {
  it("by country", () => {
    const g = groupPlaces(places, "country");
    expect(g.map((x) => [x.title, x.places.length])).toEqual([["Italy", 3], ["Greece", 1], ["Japan", 1]]);
  });
  it("nearby: Amalfi together, Tuscany apart", () => {
    const g = groupPlaces(places, "nearby");
    expect(g[0].title).toBe("Amalfi Coast area");
    expect(g[0].places.map((p) => p.name)).toEqual(["Atrani", "Positano"]);
    expect(g.find((x) => x.title === "Val d'Orcia")).toBeTruthy();
  });
  it("region: Italy and Greece are Southern Europe", () => {
    const g = groupPlaces(places, "region");
    expect(g[0].title).toBe("Southern Europe");
    expect(g[0].places).toHaveLength(4);
    expect(g[0].sub).toBe("Italy · Greece");
    expect(g[1].title).toBe("East Asia");
  });
});
