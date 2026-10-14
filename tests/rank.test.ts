import { describe, expect, it } from "vitest";
import type { Offer } from "../shared/types";
import { rank } from "../worker/lib/prices";

const o = (p: Partial<Offer> & { price: number }): Offer => ({
  provider: "google", providerLabel: "Google Flights", freshness: "live", currency: "EUR", title: "x", bookUrl: `u${p.price}${p.provider ?? ""}`, unit: "per person", ...p,
});

describe("ranking rule", () => {
  it("cheapest live price first", () => {
    const r = rank([o({ price: 200 }), o({ price: 150 }), o({ price: 180 })]);
    expect(r.map((x) => x.price)).toEqual([150, 180, 200]);
  });

  it("an earning option within 3% takes the top slot", () => {
    const r = rank([o({ price: 150 }), o({ price: 154, provider: "duffel", providerLabel: "KLM", earns: true })]);
    expect(r[0].providerLabel).toBe("KLM");
    expect(r[1].price).toBe(150);
  });

  it("but not when it's more than 3% dearer", () => {
    const r = rank([o({ price: 150 }), o({ price: 160, provider: "duffel", providerLabel: "KLM", earns: true })]);
    expect(r[0].price).toBe(150);
  });

  it("live before cached, exact dates before nearby ones, searches last", () => {
    const r = rank([
      o({ price: 120, freshness: "cached", provider: "aviasales", earns: true }),
      o({ price: 140 }),
      o({ price: 90, approx: true, freshness: "cached", provider: "aviasales" }),
      o({ price: 0, kind: "search", provider: "kiwi", providerLabel: "Kiwi.com" }),
    ]);
    expect(r.map((x) => x.kind === "search" ? "search" : x.price)).toEqual([140, 120, 90, "search"]);
  });
});
