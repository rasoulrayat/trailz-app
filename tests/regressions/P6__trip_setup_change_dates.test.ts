import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { Trip } from "../../shared/types";
import { TripSetup } from "../../src/pages/book/TripSetup";

// Hypothesis: opening "Change" on a trip that already has a start date renders the setup screen
// with the month chips on the first "best" month (not the trip's month), no start row selected and
// the custom date input empty, while "See prices" is enabled and would resubmit the hidden old date.
const trip: Trip = {
  id: "t1",
  status: "saved",
  mood: "solo",
  budgetMode: false,
  origin: "Amsterdam",
  travelers: 2,
  startDate: "2027-03-12",
  places: [{ id: "p1", name: "Lisbon", country: "Portugal", vibe: [], createdAt: 0 }],
  plan: { title: "Lisbon", summary: "", days: [{ day: 1, title: "A", base: "Lisbon", items: [] }, { day: 2, title: "B", base: "Lisbon", items: [] }, { day: 3, title: "C", base: "Lisbon", items: [] }], estimate: { travel: 1, stay: 1, activities: 1, food: 1 }, tips: [] },
  booked: {},
  bestMonths: [6],
  createdAt: 0,
  updatedAt: 0,
};

describe("P6 TripSetup: Change dates", () => {
  it("shows the trip's current start date as the selection", () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(TripSetup, { trip, onDone: () => {}, busy: false })));
    const submitEnabled = !/<button class="btn"[^>]*disabled/.test(html.slice(html.indexOf('class="actionbar')));
    expect(submitEnabled).toBe(true); // the old date is submittable...
    const showsDate = html.includes('value="2027-03-12"') || html.includes("list-row selected");
    expect(showsDate).toBe(true); // ...but is it visible anywhere?
  });
});
