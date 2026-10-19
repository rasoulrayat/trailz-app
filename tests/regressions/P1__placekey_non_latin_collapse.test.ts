import { describe, expect, it } from "vitest";
import { placeKey, decide } from "../../worker/lib/route";
import type { VideoRecord } from "../../worker/lib/extract-schema";

/**
 * placeKey() strips every character outside [a-z0-9] after NFKD. Scripts that do not
 * decompose to Latin (CJK, Cyrillic, Greek, Arabic, Hebrew, Thai...) therefore all map
 * to the empty string "", so every non-Latin place name shares one key.
 */
describe("P1: placeKey collapses all non-Latin names to the same key", () => {
  it("two different Japanese cities get different keys", () => {
    expect(placeKey("東京")).not.toBe(placeKey("大阪"));
  });
  it("Cyrillic and Greek names do not share a key", () => {
    expect(placeKey("Київ")).not.toBe(placeKey("Αθήνα"));
  });
  it("a non-Latin name has a non-empty key", () => {
    expect(placeKey("Санкт-Петербург")).not.toBe("");
  });
  it("decide(): a multi-place reel with two CJK-named places is not collapsed to one", () => {
    const record: VideoRecord = {
      video_type: "multi_place",
      places_relation: "separate_places",
      travel_confidence: 0.95,
      what_we_saw: "two cities",
      places: [
        { name: "東京", country: "Japan", confidence: 0.9 },
        { name: "大阪", country: "Japan", confidence: 0.88 },
      ],
    };
    const d = decide(record);
    expect(d.outcome).toBe("multi");
    if (d.outcome === "multi") expect(d.places.map((p) => p.name)).toEqual(["東京", "大阪"]);
  });
});
