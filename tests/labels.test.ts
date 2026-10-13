import { describe, expect, it } from "vitest";
import { checkLabel } from "../worker/lib/labels";

describe("recent check titles", () => {
  it("vibe: where it was filmed, then the vibe", () => {
    expect(
      checkLabel(
        { outcome: "vibe", vibe: ["pine forest", "mountain valley", "monsoon green"], whatWeSaw: "", filmedIn: "India (Western Ghats)", suggestions: [] },
        "ready",
      ),
    ).toEqual({ label: "India · pine forest, mountain valley", kind: "Places with this vibe" });
  });

  it("many places: countries and count", () => {
    const places = ["Japan", "Japan", "Japan"].map((country, i) => ({ name: `P${i}`, country, confidence: 1 }));
    expect(checkLabel({ outcome: "multi", places, regions: [], skippedClips: 0, advice: "" }, "ready").label).toBe("Japan · 3 places");
  });

  it("in progress and failed checks", () => {
    expect(checkLabel(null, "extracting").label).toBe("Checking…");
    expect(checkLabel(null, "failed").label).toBe("Couldn't open");
  });
});
