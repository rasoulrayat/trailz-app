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
    id: "t1", status: "saved", mood: "solo", budgetMode: true, origin: "Amsterdam", travelers: 2, startDate: "2027-06-12",
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
    expect(h.flights[0].url).toContain("/amsterdam/santorini/12/06/2027/15/06/2027");
    expect(h.flights[0].url).toContain("adults=2");
    expect(h.flights[0].url).toContain("affilid=trailz");
    expect(h.stay.map((s) => [s.city, s.nights])).toEqual([["Fira", 2], ["Pyrgos", 1]]);
    expect(h.stay[0].url).toContain("checkin=2027-06-12");
    expect(h.stay[0].url).toContain("checkout=2027-06-14");
    expect(h.stay[1].url).toContain("checkin=2027-06-14");
    expect(h.stay[0].url).toContain("aid=123");
    expect(h.stay[0].url).toContain("order=price");
    expect(h.activities[0].url).toContain("date_from=2027-06-13");
    expect(h.transport).toHaveLength(1);
  });

  it("works without dates (flexible)", () => {
    const h = buildHandoff({ ...trip, startDate: null });
    expect(h.flights[0].url).toContain("/anytime/anytime");
    expect(h.stay[0].url).not.toContain("checkin");
  });

  it("wraps partner links in Travelpayouts tracking when the ids are set", () => {
    const tp = { marker: "339296", trs: "197987", kiwiP: "2211" };
    const h = buildHandoff(trip, { tp });
    const u = new URL(h.flights[0].url);
    expect(u.origin + u.pathname).toBe("https://tp.media/r");
    expect(u.searchParams.get("marker")).toBe("339296");
    expect(u.searchParams.get("p")).toBe("2211");
    expect(u.searchParams.get("u")).toContain("kiwi.com/en/search/results/amsterdam/santorini");
    // No Booking campaign id: Booking stays a plain link.
    expect(h.stay[0].url).toContain("booking.com");
    expect(tpWrap("https://x.com", undefined, "1")).toBe("https://x.com");
  });
});
