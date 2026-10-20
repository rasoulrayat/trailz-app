// Activities get Viator's lowest price for that day, first, with a tracked product link.
import { describe, expect, it } from "vitest";
import type { Handoff } from "../../shared/types";
import { enrichActivities } from "../../worker/trips-api";
import { relevant, viatorFor } from "../../worker/lib/viator";
import { fakeD1 } from "./P4__fake-d1";

const product = (title: string, price: number, code = "123P1") => ({
  productCode: code,
  title,
  productUrl: `https://www.viator.com/tours/Granada/${code}?pid=P00123&mcid=42383&medium=api&api_version=2.0`,
  pricing: { summary: { fromPrice: price }, currency: "EUR" },
  reviews: { totalReviews: 8412, combinedAverageRating: 4.73 },
});

function viatorApi(results: unknown[], status = 200) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ products: { totalCount: results.length, results } }), { status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe("Viator prices for a stop of the plan", () => {
  it("asks for that day in euros and keeps the first relevant product with a price", async () => {
    const { fetcher, calls } = viatorApi([product("Granada Old Town Walking Tour", 15, "9P1"), product("Alhambra & Generalife Skip-the-Line Ticket", 18.4)]);
    const v = await viatorFor(fakeD1(), "key", { activity: "Alhambra & Generalife at opening", town: "Granada", date: "2027-06-13" }, fetcher);
    expect(v).toMatchObject({ productCode: "123P1", fromPrice: 19, currency: "EUR", rating: 4.7, reviews: 8412 });
    expect(v!.url).toContain("pid=P00123");
    expect(calls[0].url).toBe("https://api.viator.com/partner/search/freetext");
    expect(calls[0].headers["exp-api-key"]).toBe("key");
    expect(calls[0].headers.Accept).toBe("application/json;version=2.0");
    expect(calls[0].body).toMatchObject({ searchTerm: "Alhambra & Generalife at opening Granada", currency: "EUR", productFiltering: { dateRange: { from: "2027-06-13", to: "2027-06-13" } } });
  });

  it("is cached (Viator: at most an hour), but a failed call is not", async () => {
    const db = fakeD1();
    const ok = viatorApi([product("Alhambra Ticket", 20)]);
    await viatorFor(db, "key", { activity: "Alhambra", town: "Granada", date: null }, ok.fetcher);
    await viatorFor(db, "key", { activity: "Alhambra", town: "Granada", date: null }, ok.fetcher);
    expect(ok.calls).toHaveLength(1);
    const down = viatorApi([], 503);
    expect(await viatorFor(db, "key", { activity: "Mezquita", town: "Cordoba", date: null }, down.fetcher)).toBeNull();
    await viatorFor(db, "key", { activity: "Mezquita", town: "Cordoba", date: null }, down.fetcher);
    expect(down.calls).toHaveLength(2);
  });

  it("ignores results that only share the town's name", () => {
    expect(relevant("Flamenco night in Sacromonte", "Granada", "Granada Cathedral Tour")).toBe(false);
    expect(relevant("Flamenco night in Sacromonte", "Granada", "Flamenco Show in the Sacromonte Caves")).toBe(true);
    expect(relevant("Vatican Museums", "Rome", "Vatican Museum & Sistine Chapel")).toBe(true);
    // Seen live: one shared word ("beach") is not enough when the stop names more.
    expect(relevant("Picnic on Barceloneta beach", "Barcelona", "Barcelona Bike tour, Gaudí houses or beach bike or eBike tour")).toBe(false);
    expect(relevant("Colosseum", "Rome", "Colosseum Underground Tour")).toBe(true);
  });

  it("puts Viator first with its price; stops Viator doesn't have keep their links", async () => {
    const h: Handoff = {
      flights: [], stay: [], transport: [], disclaimer: "",
      activities: [
        { partner: "Tiqets", url: "https://www.tiqets.com/en/x-p1/", place: "Alhambra & Generalife", note: "Day 2 · 09:30 · the ticket itself on Tiqets", day: 2, town: "Granada", date: "2027-06-13",
          options: [{ partner: "Tiqets", url: "https://www.tiqets.com/en/x-p1/", label: "Tiqets · ticket" }, { partner: "GetYourGuide", url: "https://www.getyourguide.com/s/?q=a", label: "GetYourGuide" }] },
        { partner: "GetYourGuide", url: "https://www.getyourguide.com/s/?q=b", place: "Picnic in the Albaicín", note: "Day 3 · 13:00 · search on GetYourGuide", day: 3, town: "Granada", date: "2027-06-14",
          options: [{ partner: "GetYourGuide", url: "https://www.getyourguide.com/s/?q=b", label: "GetYourGuide" }, { partner: "Tiqets", url: "https://www.tiqets.com/en/granada/", label: "Tiqets · Granada" }] },
      ],
    };
    const fetcher = (async (_u: string, init: RequestInit) => {
      const term = String(JSON.parse(String(init.body)).searchTerm);
      return new Response(JSON.stringify({ products: { results: term.startsWith("Alhambra") ? [product("Alhambra & Generalife Skip-the-Line Ticket", 18.4)] : [product("Granada Food Tour", 55)] } }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await enrichActivities({ DB: fakeD1(), VIATOR_API_KEY: "key" } as never, h, fetcher);
    const [alhambra, picnic] = out.activities;
    expect(alhambra.options!.map((o) => o.label)).toEqual(["Viator · from €19", "Tiqets · ticket", "GetYourGuide"]);
    expect(alhambra).toMatchObject({ partner: "Viator", note: "Day 2 · 09:30" });
    expect(alhambra.options![0]).toMatchObject({ price: 19, rating: 4.7, reviews: 8412, title: "Alhambra & Generalife Skip-the-Line Ticket" });
    expect(picnic.options!.map((o) => o.partner)).toEqual(["GetYourGuide", "Tiqets"]);
    expect(picnic.note).toBe("Day 3 · 13:00 · search on GetYourGuide");
  });
});
