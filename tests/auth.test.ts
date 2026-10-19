import { describe, expect, it } from "vitest";
import { cleanProfile, ownerForUser, safeNext } from "../worker/lib/auth";

describe("auth helpers", () => {
  it("keeps only well-formed profile fields", () => {
    expect(cleanProfile({ vibes: ["beach", "BAD!", 3, "mountains"], crew: "friends", budget: 599.6, home: "  Tehran ", onboarded: true, junk: 1 })).toEqual({
      vibes: ["beach", "mountains"],
      crew: "friends",
      budget: 600,
      home: "Tehran",
      onboarded: true,
    });
    expect(cleanProfile(null)).toEqual({ vibes: [] });
    expect(cleanProfile({ crew: "aliens", budget: -5, home: "" })).toEqual({ vibes: [] });
  });

  it("only redirects inside the app after login", () => {
    expect(safeNext("/trips/abc/book")).toBe("/trips/abc/book");
    expect(safeNext("/explore?month=5")).toBe("/explore?month=5");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext(undefined, "/saved")).toBe("/saved");
  });

  it("namespaces account owners apart from device ids", () => {
    expect(ownerForUser("abc")).toBe("u:abc");
  });
});

import { cleanPatch } from "../worker/lib/auth";
describe("cleanPatch", () => {
  it("keeps only the fields that were sent", () => {
    expect(cleanPatch({ crew: "solo" })).toEqual({ crew: "solo" });
    expect(cleanPatch({ vibes: ["beach"], junk: 1 })).toEqual({ vibes: ["beach"] });
    expect(cleanPatch({ onboarded: true })).toEqual({ onboarded: true });
    expect(cleanPatch(null)).toEqual({});
  });
});
