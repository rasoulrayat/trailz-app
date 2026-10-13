import { describe, expect, it } from "vitest";
import { normalizeRecord, type VideoRecord } from "../worker/lib/extract-schema";
import { clusterRegions, decide, distanceKm } from "../worker/lib/route";

const base: VideoRecord = {
  video_type: "single_place",
  travel_confidence: 0.9,
  what_we_saw: "x",
  places: [],
};

describe("decide: which result screen a reel leads to", () => {
  it("not travel when the AI says so", () => {
    expect(decide({ ...base, video_type: "not_travel" })).toEqual({ outcome: "not_travel", kind: "not_travel" });
  });

  it("not travel when travel confidence is low, even if a place is named", () => {
    const d = decide({ ...base, travel_confidence: 0.2, places: [{ name: "Rome", confidence: 0.9 }] });
    expect(d.outcome).toBe("not_travel");
  });

  it("vibe when travel scenery has no identifiable place", () => {
    const d = decide({ ...base, video_type: "travel_vibe_no_place", vibe_tags: ["turquoise cove"] });
    expect(d.outcome).toBe("vibe");
  });

  it("tips without a place and without vibe tags", () => {
    const d = decide({ ...base, video_type: "travel_tips_no_place", vibe_tags: [] });
    expect(d).toEqual({ outcome: "not_travel", kind: "tips" });
  });

  it("single when one place is identified confidently", () => {
    const d = decide({ ...base, places: [{ name: "Oia", country: "Greece", confidence: 0.93 }] });
    expect(d.outcome).toBe("single");
  });

  it("pick when the one place is uncertain", () => {
    const d = decide({ ...base, places: [{ name: "Hallstatt", confidence: 0.6 }] });
    expect(d.outcome).toBe("pick");
  });

  it("pick when the AI lists alternatives for one place", () => {
    const d = decide({
      ...base,
      places_relation: "alternatives",
      places: [
        { name: "Hallstatt", confidence: 0.58 },
        { name: "Obertraun", confidence: 0.22 },
        { name: "Gosau", confidence: 0.31 },
      ],
    });
    expect(d.outcome).toBe("pick");
    // Most likely first.
    if (d.outcome === "pick") expect(d.candidates.map((c) => c.name)).toEqual(["Hallstatt", "Gosau", "Obertraun"]);
  });

  it("multi for a list of separate places, ignoring weak and duplicate ones", () => {
    const d = decide({
      ...base,
      video_type: "multi_place",
      places_relation: "separate_places",
      places: [
        { name: "Atrani", confidence: 0.86, lat: 40.636, lng: 14.608, region: "Amalfi Coast" },
        { name: "atrani", confidence: 0.5, lat: 40.636, lng: 14.608, region: "Amalfi Coast" },
        { name: "Seceda", confidence: 0.88, lat: 46.6, lng: 11.73, region: "Dolomites" },
        { name: "Somewhere", confidence: 0.2 },
      ],
    });
    expect(d.outcome).toBe("multi");
    if (d.outcome === "multi") {
      expect(d.places.map((p) => p.name)).toEqual(["Atrani", "Seceda"]);
      expect(d.regions).toHaveLength(2);
    }
  });

  it("flags when the creator's label differs from what we see", () => {
    const d = decide({
      ...base,
      video_type: "multi_place",
      places: [
        { name: "Atrani", confidence: 0.86, creator_label: "Positano" },
        { name: "Ravello", confidence: 0.86, creator_label: "Ravello" },
      ],
    });
    if (d.outcome !== "multi") throw new Error("expected multi");
    expect(d.places[0].creatorLabel).toBe("Positano");
    expect(d.places[1].creatorLabel).toBeUndefined();
  });
});

describe("clusterRegions", () => {
  it("groups nearby places and names the region", () => {
    const regions = clusterRegions([
      { name: "Atrani", lat: 40.636, lng: 14.608, region: "Amalfi Coast", confidence: 1 },
      { name: "Furore", lat: 40.618, lng: 14.55, region: "Amalfi Coast", confidence: 1 },
      { name: "Seceda", lat: 46.6, lng: 11.73, region: "Dolomites", confidence: 1 },
      { name: "Braies", lat: 46.694, lng: 12.085, region: "Dolomites", confidence: 1 },
    ]);
    expect(regions).toEqual([
      { name: "Amalfi Coast", placeIndexes: [0, 1] },
      { name: "Dolomites", placeIndexes: [2, 3] },
    ]);
  });
  it("falls back to region names when coordinates are missing", () => {
    const regions = clusterRegions([
      { name: "A", region: "Tuscany", confidence: 1 },
      { name: "B", region: "tuscany", confidence: 1 },
      { name: "C", region: "Puglia", confidence: 1 },
    ]);
    expect(regions.map((r) => r.placeIndexes)).toEqual([[0, 1], [2]]);
  });
  it("distance is roughly right (Amsterdam–Paris ≈ 430 km)", () => {
    const d = distanceKm({ lat: 52.37, lng: 4.9 }, { lat: 48.86, lng: 2.35 });
    expect(d).toBeGreaterThan(420);
    expect(d).toBeLessThan(440);
  });
});

describe("normalizeRecord: never trust AI output blindly", () => {
  it("fills defaults and drops junk", () => {
    const r = normalizeRecord({
      video_type: "something_else",
      travel_confidence: 7,
      places: [{ name: "  " }, { name: "Oia", confidence: "high", lat: 999 }],
      vibe_tags: ["a", 3, "b"],
    });
    expect(r.video_type).toBe("not_travel");
    expect(r.travel_confidence).toBe(1);
    expect(r.places).toEqual([
      expect.objectContaining({ name: "Oia", confidence: 0.5, lat: undefined }),
    ]);
    expect(r.vibe_tags).toEqual(["a", "b"]);
  });
  it("handles a missing body", () => {
    expect(normalizeRecord(null).places).toEqual([]);
  });
});

describe("decide: weak guesses", () => {
  it("offers weak guesses in the picker instead of giving up", () => {
    const d = decide({ ...base, places: [{ name: "Gosau", confidence: 0.3 }, { name: "Obertraun", confidence: 0.1 }] });
    expect(d.outcome).toBe("pick");
    if (d.outcome === "pick") expect(d.candidates.map((c) => c.name)).toEqual(["Gosau"]);
  });
});
