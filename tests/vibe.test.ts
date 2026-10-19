import { describe, expect, it } from "vitest";
import type { SavedPlace } from "../shared/types";
import { buildVibe, vibeKey } from "../shared/vibe";
import { cleanPatch, cleanProfile } from "../worker/lib/auth";

const place = (name: string, vibe: string[], createdAt = 0): SavedPlace => ({ id: name, name, vibe, createdAt });

describe("learned vibe", () => {
  it("counts a word once per saved place, strongest first, and remembers who taught it", () => {
    const v = buildVibe(
      [place("Oia", ["Hidden gem", "sea", "hidden gem"], 3), place("Milos", ["Sea", "cliffs"], 2), place("Kotor", ["sea", "by train"], 1)],
      { vibes: [] },
    );
    expect(v.tags.map((t) => [t.key, t.count])).toEqual([
      ["sea", 3],
      ["by train", 1],
      ["cliffs", 1],
      ["hidden gem", 1],
    ]);
    expect(v.tags[0].from).toEqual(["Oia", "Milos", "Kotor"]);
    expect(v.tags[0].label).toBe("sea");
    expect(v.saves).toBe(3);
    expect(v.learning).toBe(true);
  });

  it("leaves muted words out and keeps the muted list", () => {
    const v = buildVibe([place("Oia", ["sea", "crowded"])], { vibes: [], vibeOff: ["Crowded"] });
    expect(v.tags.map((t) => t.key)).toEqual(["sea"]);
    expect(v.muted).toEqual(["crowded"]);
  });

  it("learns nothing with learning off", () => {
    const v = buildVibe([place("Oia", ["sea"])], { vibes: ["beach"], learnVibe: false });
    expect(v.tags).toEqual([]);
    expect(v.learning).toBe(false);
  });

  it("normalises keys like the worker does", () => {
    expect(vibeKey("  Café-Culture ")).toBe("cafe culture");
    expect(vibeKey("Hidden   gem")).toBe("hidden gem");
  });
});

describe("profile fields for the vibe", () => {
  it("stores muted words as keys, de-duplicated, and learnVibe only when false", () => {
    const p = cleanProfile({ vibes: [], vibeOff: ["Sea", "sea", 3, "x".repeat(40)], learnVibe: false });
    expect(p.vibeOff).toEqual(["sea"]);
    expect(p.learnVibe).toBe(false);
    expect(cleanProfile({ vibes: [], learnVibe: true }).learnVibe).toBeUndefined();
  });

  it("patches only what was sent, and an empty vibeOff restores everything", () => {
    expect(cleanPatch({ vibeOff: [] })).toEqual({ vibeOff: [] });
    expect(cleanPatch({ learnVibe: true })).toEqual({ learnVibe: true });
    expect(cleanPatch({ home: "Utrecht" })).not.toHaveProperty("vibeOff");
  });
});
