import { describe, expect, it } from "vitest";
import { mockCard } from "../worker/lib/mock";
import { placesToPrebuild } from "../worker/lib/cards";
import { profileKey, toProfile, withVerdict } from "../worker/lib/profiles";

describe("place profiles", () => {
  const card = mockCard({ name: "Oia", country: "Greece", confidence: 0.9, lat: 36.46, lng: 25.37, verified: true }, "Amsterdam");

  it("keys by name + country, accent- and case-insensitive", () => {
    expect(profileKey({ name: "Oia", country: "Greece" })).toBe("oia greece");
    expect(profileKey({ name: "Zürich", country: "Switzerland" })).toBe(profileKey({ name: "zurich", country: "SWITZERLAND" }));
    expect(profileKey({ name: "東京", country: "Japan" })).not.toBe(profileKey({ name: "京都", country: "Japan" }));
  });

  it("splits a card into the place part and the reel verdict, and puts them back together", () => {
    const profile = toProfile(card);
    expect(profile).not.toHaveProperty("authenticity");
    expect(profile).not.toHaveProperty("comparisons");
    expect(profile.months).toHaveLength(12);
    const rebuilt = withVerdict(profile, { authenticity: 3, summary: "s", comparisons: [{ reel: "r", reality: "x" }] }, { name: "Oia", confidence: 0.9, verified: true });
    expect(rebuilt.authenticity).toBe(3);
    expect(rebuilt.months).toEqual(card.months);
    expect(rebuilt.base).toEqual(card.base);
    expect(rebuilt.confidence).toBe("high");
  });

  it("knows which places of a reel to prebuild", () => {
    const row = (outcome: string, result: object) => ({ id: "v", status: "ready", result_json: JSON.stringify(result), outcome }) as Parameters<typeof placesToPrebuild>[0];
    expect(placesToPrebuild(row("multi", { outcome: "multi", places: [{ name: "Atrani" }, { name: "Ravello" }] }))).toEqual(["Atrani", "Ravello"]);
    expect(placesToPrebuild(row("pick", { outcome: "pick", candidates: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }] }))).toEqual(["A", "B", "C"]);
    expect(placesToPrebuild(row("vibe", { outcome: "vibe", suggestions: [{ name: "Hvar", country: "Croatia" }] }))).toEqual(["Hvar, Croatia"]);
    expect(placesToPrebuild(row("single", { outcome: "single", card }))).toEqual([]);
  });
});
