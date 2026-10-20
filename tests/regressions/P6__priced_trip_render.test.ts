import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { Handoff, Offer, Trip, TripPrices } from "../../shared/types";
import { PricedTrip } from "../../src/pages/book/PricedTrip";

// Server-render PricedTrip (hooks run; effects do not), then assert on the markup.
const render = (trip: Trip, handoff: Handoff | null, prices: TripPrices | null) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PricedTrip, { trip, handoff, prices, onBooked: async () => {}, onChangeDates: () => {} })));

const offer = (price: number, unit: Offer["unit"], title = "x"): Offer => ({ provider: "google", providerLabel: "Google", kind: "offer", freshness: "live", price, currency: "EUR", title, bookUrl: `https://example.com/${price}`, unit });
const search = (city: string): Offer => ({ provider: "booking", providerLabel: "Booking.com", kind: "search", freshness: "live", price: 0, currency: "EUR", title: `Search all stays in ${city}`, bookUrl: `https://example.com/s/${city}`, unit: "total" });

const trip = (over: Partial<Trip> = {}): Trip => ({
  id: "t1",
  status: "saved",
  mood: "friends",
  budgetMode: false,
  origin: "Amsterdam",
  travelers: 2,
  startDate: "2027-06-11",
  places: [{ id: "p1", name: "Lisbon", country: "Portugal", vibe: [], createdAt: 0 }],
  plan: {
    title: "Lisbon & Porto",
    summary: "",
    days: [
      { day: 1, title: "A", base: "Lisbon", items: [] },
      { day: 2, title: "B", base: "Lisbon", items: [] },
      { day: 3, title: "C", base: "Porto", items: [] },
      { day: 4, title: "D", base: "Porto", items: [] },
    ],
    estimate: { travel: 200, stay: 400, activities: 50, food: 100 },
    tips: [],
  },
  booked: {},
  bestMonths: [6],
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const handoff: Handoff = {
  flights: [{ partner: "Kiwi.com", url: "https://example.com/f", note: "" }],
  stay: [
    { partner: "Booking.com", url: "https://example.com/s/Lisbon", note: "", city: "Lisbon", nights: 2 },
    { partner: "Booking.com", url: "https://example.com/s/Porto", note: "", city: "Porto", nights: 1 },
  ],
  activities: [],
  transport: [],
  disclaimer: "",
};

describe("P6 PricedTrip", () => {
  it("open-dated saved trip: stay sections from the hand-off must still be shown when prices.stays is empty", () => {
    // worker/lib/prices.ts:224 returns stays: [] whenever trip.startDate is null (real providers, not mock).
    const prices: TripPrices = { flights: { origin: null, destination: null, offers: [], nights: 3 }, stays: [], sources: [], note: "" };
    const html = render(trip({ startDate: null }), handoff, prices);
    expect(html).toContain("Stay in Lisbon");
    expect(html).toContain("Stay in Porto");
  });

  it("partial stay prices: the per-person total must cover both base towns, not drop the unpriced one", () => {
    // Lisbon priced at €300 total (= €150 pp for 2), Porto has only the search row. Flight €100 pp. Activities €50.
    // The rendered total is 100 + 150 + 50 = €300: Porto's nights contribute nothing (neither live nor estimate).
    const prices: TripPrices = {
      flights: { origin: { code: "AMS", name: "Amsterdam" }, destination: { code: "LIS", name: "Lisbon" }, offers: [offer(100, "per person", "TAP · direct")], nights: 3 },
      stays: [
        { city: "Lisbon", checkIn: "2027-06-11", checkOut: "2027-06-13", nights: 2, offers: [offer(300, "total", "Hotel A"), search("Lisbon")], searchUrl: "" },
        { city: "Porto", checkIn: "2027-06-13", checkOut: "2027-06-14", nights: 1, offers: [search("Porto")], searchUrl: "" },
      ],
      sources: ["Google Hotels"],
      note: "",
    };
    const html = render(trip(), handoff, prices);
    const big = html.match(/class="big-number"[^>]*>€([\d,]+)/)?.[1]?.replace(",", "");
    expect(big).toBeDefined();
    expect(Number(big)).toBeGreaterThan(300);
  });

  it("tabs: Flight · Stay · Activities, every town under Stay, opens on the first part not booked", () => {
    const html = render(trip({ booked: { flights: true } }), handoff, null);
    // Flight booked → the Stay tab is selected, and both towns are sections inside its one panel.
    expect(html).toMatch(/role="tab" id="tab-stay" aria-selected="true"/);
    expect(html).toMatch(/id="tab-flights" aria-selected="false"[\s\S]*?Booked/);
    const stayPanel = html.match(/id="panel-stay"[\s\S]*?(?=id="panel-|$)/)?.[0] ?? "";
    expect(stayPanel).toContain("Stay in Lisbon");
    expect(stayPanel).toContain("Stay in Porto");
    expect(html).not.toMatch(/id="tab-stay:/);
    // No "Next" action bar any more.
    expect(html).not.toContain("Next: book your");
    // Panels other than the selected one are in the page but hidden.
    expect(html).toMatch(/id="panel-flights"[^>]*hidden/);
  });

  it("tabs: activities get their own tab when the plan has bookable ones", () => {
    const h: Handoff = { ...handoff, activities: [{ partner: "GetYourGuide", url: "https://example.com/a", note: "Day 2 · 09:00", place: "Boat trip" }] };
    const html = render(trip(), h, null);
    expect(html).toMatch(/id="tab-activities"/);
    expect(html).toMatch(/id="panel-activities"[^>]*hidden/);
  });
  it("activities show every partner: the exact Tiqets ticket first, GetYourGuide next", () => {
    const withActs: Handoff = {
      ...handoff,
      activities: [
        {
          partner: "Tiqets",
          url: "https://tiqets.tpx.gr/ticket",
          place: "Belém Tower",
          note: "Day 2 · 10:00 · the ticket itself on Tiqets",
          options: [
            { partner: "Tiqets", url: "https://tiqets.tpx.gr/ticket", label: "Tiqets · ticket" },
            { partner: "GetYourGuide", url: "https://www.getyourguide.com/s/?q=Bel%C3%A9m", label: "GetYourGuide" },
          ],
        },
      ],
    };
    const html = render(trip(), withActs, null);
    expect(html).toContain("Belém Tower");
    expect(html).toContain('href="https://tiqets.tpx.gr/ticket"');
    expect(html).toContain('aria-label="Book Belém Tower on GetYourGuide"');
    expect(html.indexOf("tiqets.tpx.gr")).toBeLessThan(html.indexOf("getyourguide.com"));
    expect(html).toContain("Tiqets opens the exact ticket");
  });
});
