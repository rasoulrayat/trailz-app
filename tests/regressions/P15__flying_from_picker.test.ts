// "Flying from" on When do you go? was a free text box with 8 hard-coded cities. It now opens the same
// country and city list as onboarding (canvas 12a–12b) and shows the pick with its country.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { Trip } from "../../shared/types";
import { CityPicker, theCountry } from "../../src/components/CityPicker";
import { TripSetup } from "../../src/pages/book/TripSetup";

const trip: Trip = {
  id: "t1",
  status: "saved",
  mood: "solo",
  budgetMode: false,
  origin: "Rotterdam, Netherlands",
  travelers: 1,
  startDate: null,
  places: [{ id: "p1", name: "Lisbon", country: "Portugal", vibe: [], createdAt: 0 }],
  plan: { title: "Lisbon", summary: "", days: [{ day: 1, title: "A", base: "Lisbon", items: [] }], estimate: { travel: 1, stay: 1, activities: 1, food: 1 }, tips: [] },
  booked: {},
  bestMonths: [],
  createdAt: 0,
  updatedAt: 0,
};

describe("P15 Flying from: a city picker, not a text box", () => {
  it("shows the trip's departure as a button that opens the picker", () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(TripSetup, { trip, onDone: () => {}, busy: false })));
    expect(html).toContain('class="from-field"');
    expect(html).toContain("<b>Rotterdam</b>");
    expect(html).toContain("Netherlands");
    expect(html).toContain("Change");
    expect(html).not.toContain("<datalist");
  });
  it("the picker's light look has the search over every city and country", () => {
    const html = renderToStaticMarkup(createElement(CityPicker, { light: true, value: "Rotterdam, Netherlands", onPick: () => {} }));
    expect(html).toContain("city-picker city-light");
    expect(html).toContain('placeholder="Search a city or country"');
  });
  it("names countries the way a sentence needs them", () => {
    expect(theCountry("Netherlands")).toBe("the Netherlands");
    expect(theCountry("United Kingdom")).toBe("the United Kingdom");
    expect(theCountry("Spain")).toBe("Spain");
    expect(theCountry("Iran")).toBe("Iran");
  });
});
