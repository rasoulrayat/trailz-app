import { describe, expect, it } from "vitest";
import type { SavedPlace, Trip } from "../shared/types";
import { buildHandoff, daysFor, suggestTrips, tpWrap } from "../worker/lib/trips";

const save = (name: string, country: string, lat: number, lng: number, vibe: string[] = []): SavedPlace => ({
  id: name.toLowerCase(), name, country, lat, lng, vibe, createdAt: 0,
});

describe("a trip is forming", () => {
  it("groups saved places that are close together, biggest group first", () => {
    const s = suggestTrips([
      save("Kyoto", "Japan", 35.01, 135.77, ["temples"]),
      save("Nara", "Japan", 34.68, 135.83, ["deer park", "temples"]),
      save("Oia", "Greece", 36.46, 25.37, ["blue domes"]),
      save("Mount Fuji", "Japan", 35.36, 138.73, ["mountain"]),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].placeIds).toEqual(["kyoto", "nara", "mount fuji"]);
    expect(s[0].title).toBe("Kyoto, Nara, Mount Fuji");
    expect(s[0].vibe[0]).toBe("temples");
    expect(s[0].days).toBe(daysFor(3));
  });

  it("needs at least two places", () => {
    expect(suggestTrips([save("Oia", "Greece", 36.46, 25.37)])).toEqual([]);
  });
});

describe("partner hand-off links", () => {
  const trip: Trip = {
    id: "t1", status: "saved", mood: "solo", budgetMode: true, origin: "Amsterdam", travelers: 2, startDate: "2027-06-12", booked: {}, bestMonths: [],
    places: [save("Oia", "Greece", 36.46, 25.37)],
    plan: {
      title: "x", summary: "", estimate: { travel: 0, stay: 0, activities: 0, food: 0 }, tips: [], gateway: { arrive: "Santorini", leave: "Santorini" },
      days: [
        { day: 1, title: "", base: "Fira", items: [{ time: "07:00", kind: "travel", title: "Fly", detail: "", cost: 0, book: "flights" }] },
        { day: 2, title: "", base: "Fira", items: [{ time: "09:00", kind: "do", title: "Caldera boat trip", detail: "", cost: 65, book: "activity" }] },
        { day: 3, title: "", base: "Pyrgos", items: [{ time: "10:00", kind: "see", title: "Village", detail: "", cost: 0 }] },
        { day: 4, title: "", base: "Pyrgos", items: [{ time: "15:00", kind: "travel", title: "Fly home", detail: "", cost: 0, book: "flights" }] },
      ],
    },
    createdAt: 0, updatedAt: 0,
  };

  it("fills dates, places and travelers into each partner link", () => {
    const h = buildHandoff(trip, { kiwi: "trailz", booking: "123" });
    const f = new URL(h.flights[0].url);
    expect(f.origin + f.pathname).toBe("https://www.kiwi.com/deep");
    expect(f.searchParams.get("from")).toBe("Amsterdam");
    expect(f.searchParams.get("to")).toBe("Santorini");
    expect(f.searchParams.get("departure")).toBe("2027-06-12");
    expect(f.searchParams.get("return")).toBe("2027-06-15");
    expect(f.searchParams.get("adults")).toBe("2");
    expect(f.searchParams.get("affilid")).toBe("trailz");
    expect(h.stay.map((s) => [s.city, s.nights])).toEqual([["Fira", 2], ["Pyrgos", 1]]);
    expect(h.stay[0].url).toContain("checkin=2027-06-12");
    expect(h.stay[0].url).toContain("checkout=2027-06-14");
    expect(h.stay[1].url).toContain("checkin=2027-06-14");
    expect(h.stay[0].url).toContain("aid=123");
    expect(h.stay[0].url).toContain("order=price");
    // Viator comes first (its search); GetYourGuide stays an option, with the day's date.
    expect(h.activities[0].partner).toBe("Viator");
    expect(h.activities[0].options!.find((o) => o.partner === "GetYourGuide")!.url).toContain("date_from=2027-06-13");
    expect(h.transport).toHaveLength(1);
  });

  it("gives each activity Viator, Tiqets and GetYourGuide: Viator first, the exact Tiqets ticket first when there is one, GetYourGuide always an option", () => {
    const t: Trip = {
      ...trip,
      places: [save("Sagrada Família", "Spain", 41.4, 2.17)],
      plan: {
        ...trip.plan,
        days: [
          { day: 1, title: "", base: "Barcelona", items: [{ time: "10:00", kind: "see", title: "Sagrada Família", detail: "", cost: 26, book: "activity" }] },
          { day: 2, title: "", base: "Barcelona", items: [{ time: "18:00", kind: "do", title: "Picnic on Barceloneta beach", detail: "", cost: 60, book: "activity" }] },
        ],
      },
    };
    const [sagrada, sailing] = buildHandoff(t, { viator: "P00327013" }).activities;
    expect(sagrada.options!.map((o) => o.label)).toEqual(["Tiqets · ticket", "Viator", "GetYourGuide"]);
    expect(sagrada.url).toBe("https://www.tiqets.com/en/barcelona-attractions-c66342/tickets-for-sagrada-familia-entry-ticket-p1111400/");
    expect(sagrada.note).toBe("Day 1 · 10:00 · the ticket itself on Tiqets");
    expect(sailing.options!.map((o) => o.label)).toEqual(["Viator", "Tiqets · Barcelona", "GetYourGuide"]);
    expect(sailing.note).toBe("Day 2 · 18:00 · search on Viator");
    const viator = new URL(sailing.url);
    expect(viator.origin + viator.pathname).toBe("https://www.viator.com/searchResults/all");
    expect(viator.searchParams.get("text")).toBe("Picnic on Barceloneta beach Barcelona");
    expect(viator.searchParams.get("pid")).toBe("P00327013");
    expect(viator.searchParams.get("mcid")).toBe("42383");
    const gyg = new URL(sailing.options!.find((o) => o.partner === "GetYourGuide")!.url);
    expect(gyg.searchParams.get("q")).toBe("Picnic on Barceloneta beach Barcelona");
    expect(gyg.searchParams.get("date_from")).toBe("2027-06-13");
  });

  it("works without dates (flexible)", () => {
    const h = buildHandoff({ ...trip, startDate: null }, {}, { origin: "AMS", destination: "JTR" });
    const f = new URL(h.flights[0].url);
    expect(f.searchParams.get("from")).toBe("AMS");
    expect(f.searchParams.get("to")).toBe("JTR");
    expect(f.searchParams.has("departure")).toBe(false);
    expect(h.stay[0].url).not.toContain("checkin");
  });

  it("wraps partner links in Travelpayouts tracking when the ids are set", () => {
    const tp = { marker: "339296", trs: "197987", bookingP: "4132" };
    const h = buildHandoff(trip, { tp }, { origin: "AMS", destination: "JTR" });
    // Kiwi: the documented c111 click link, with our prefilled search inside custom_url.
    const k = new URL(h.flights[0].url);
    expect(k.host).toBe("c111.travelpayouts.com");
    expect(k.searchParams.get("shmarker")).toBe("339296.flights");
    expect(k.searchParams.get("promo_id")).toBe("3791");
    expect(k.searchParams.get("custom_url")).toContain("kiwi.com/deep?from=AMS&to=JTR");
    // Booking: tp.media redirect with the campaign id.
    const b = new URL(h.stay[0].url);
    expect(b.origin + b.pathname).toBe("https://tp.media/r");
    expect(b.searchParams.get("p")).toBe("4132");
    expect(b.searchParams.get("u")).toContain("booking.com");
    expect(tpWrap("https://x.com", undefined, "1")).toBe("https://x.com");
  });
});

describe("partner links arrive filled in", () => {
  it("puts the trip's travellers into Aviasales search links (the API gives links for one adult)", async () => {
    const { withPassengers } = await import("../worker/lib/prices");
    expect(withPassengers("https://www.aviasales.com/search/AMS1206JTR15061?marker=m", 2)).toBe("https://www.aviasales.com/search/AMS1206JTR15062?marker=m");
    expect(withPassengers("https://www.aviasales.com/search/AMS1206JTR1?t=x", 3)).toBe("https://www.aviasales.com/search/AMS1206JTR3?t=x");
    expect(withPassengers("https://www.aviasales.com/search/AMS1206JTR15061", 1)).toBe("https://www.aviasales.com/search/AMS1206JTR15061");
    expect(withPassengers("https://www.aviasales.com/other", 2)).toBe("https://www.aviasales.com/other");
  });

  it("books a Duffel fare through Kiwi's filled-in deep link instead of Duffel's empty checkout", async () => {
    const { viaKiwi } = await import("../worker/lib/prices");
    const kiwi = { provider: "kiwi" as const, providerLabel: "Kiwi.com", kind: "search" as const, earns: true, freshness: "cached" as const, price: 0, currency: "EUR", title: "Search all flights", bookUrl: "https://www.kiwi.com/deep?from=AMS&to=JTR&departure=2027-06-12&return=2027-06-15&adults=2", unit: "per person" as const };
    const duffel = { provider: "duffel" as const, providerLabel: "KLM", earns: true, freshness: "live" as const, price: 210, currency: "EUR", title: "KLM · direct", detail: "airline fare", bookUrl: "/api/trips/t1/duffel-link?offer=off_1", unit: "per person" as const };
    const out = viaKiwi(duffel, [kiwi], 2);
    expect(out.bookUrl).toBe(kiwi.bookUrl);
    expect(out.providerLabel).toBe("Kiwi.com");
    expect(out.price).toBe(210);
    expect(out.detail).toContain("KLM");
    expect(out.note).toContain("2 travelers");
    // Without a Kiwi link there is nothing better: the Duffel checkout stays.
    expect(viaKiwi(duffel, [], 2).bookUrl).toBe(duffel.bookUrl);
    // Other providers are untouched.
    expect(viaKiwi(kiwi, [kiwi], 2)).toBe(kiwi);
  });
});
