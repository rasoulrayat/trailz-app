// Browser code (src/cities.ts reads fetch().json() as any), so it lives with the regressions outside the worker types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findCity, flagOf, fold, homeCity, homeOf, parseCities, searchPlaces } from "../../src/cities";

const sample = parseCities({
  countries: {
    NL: "Amsterdam~742|Rotterdam~598|Utrecht~362",
    DE: "Berlin~3426|Cologne~963~Köln",
    PT: "Lisbon~517|Porto~250",
    BR: "São Paulo~10021|Porto Alegre~1488",
    ES: "Utrera~51",
    GR: "Thessaloníki~318",
  },
});

describe("city list", () => {
  it("names countries in English, sorted, with flags", () => {
    expect(sample.map((c) => c.name)).toEqual(["Brazil", "Germany", "Greece", "Netherlands", "Portugal", "Spain"]);
    expect(flagOf("NL")).toBe("🇳🇱");
    expect(sample.find((c) => c.code === "DE")!.cities[1]).toMatchObject({ name: "Cologne", other: "Köln", pop: 963 });
  });

  it("folds accents and case", () => {
    expect(fold("Thessaloníki")).toBe("thessaloniki");
    expect(fold("  São-Paulo ")).toBe("sao paulo");
    expect(fold("İzmir")).toBe("izmir");
  });

  it("finds cities across countries, biggest first, an exact name first", () => {
    expect(searchPlaces(sample, "utr").cities.map(homeOf)).toEqual(["Utrecht, Netherlands", "Utrera, Spain"]);
    expect(searchPlaces(sample, "porto").cities.map((c) => c.name)).toEqual(["Porto", "Porto Alegre"]);
    expect(searchPlaces(sample, "thessaloniki").cities[0].name).toBe("Thessaloníki");
    expect(searchPlaces(sample, "paulo").cities[0].name).toBe("São Paulo"); // a word in the name
  });

  it("matches the second name (Köln finds Cologne)", () => {
    expect(searchPlaces(sample, "koln").cities[0].name).toBe("Cologne");
  });

  it("lists matching countries next to the cities", () => {
    expect(searchPlaces(sample, "neth").countries.map((c) => c.code)).toEqual(["NL"]);
    expect(searchPlaces(sample, "").cities).toEqual([]);
  });

  it("narrows to a country after a comma", () => {
    expect(searchPlaces(sample, "porto, bra").cities.map((c) => c.name)).toEqual(["Porto Alegre"]);
  });

  it("saves the home with its country and reads it back", () => {
    const utrecht = findCity(sample, "Utrecht, Netherlands")!;
    expect(utrecht.name).toBe("Utrecht");
    expect(findCity(sample, "Köln")!.name).toBe("Cologne");
    expect(findCity(sample, "Utrecht, Spain")).toBeNull();
    expect(homeCity("Utrecht, Netherlands")).toBe("Utrecht");
    expect(homeCity("Utrecht")).toBe("Utrecht");
    expect(homeCity(undefined)).toBe("");
  });

  it("ships every country with at least one city, biggest first", () => {
    const data = JSON.parse(readFileSync(new URL("../../public/cities.json", import.meta.url), "utf8"));
    const all = parseCities(data);
    expect(all.length).toBeGreaterThan(240);
    for (const c of all) expect(c.cities.length, c.code).toBeGreaterThan(0);
    const nl = all.find((c) => c.code === "NL")!;
    expect(nl.cities.slice(0, 4).map((c) => c.name)).toEqual(["Amsterdam", "Rotterdam", "The Hague", "Utrecht"]);
    expect(findCity(all, "Cologne")!.other).toBe("Köln");
    // A saved home stays within the profile's 60-character limit and splits back on its first comma.
    for (const c of all) for (const x of c.cities) expect(x.name.includes(","), x.name).toBe(false);
  });
});
