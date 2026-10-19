import { describe, expect, it } from "vitest";
import type { Trip } from "../../shared/types";
import { buildHandoff } from "../../worker/lib/trips";

/**
 * P3-03 — worker/trips-api.ts:233 (PATCH validation) + worker/lib/trips.ts:190-194 (addDays)
 * PATCH /trips/:id accepts any string matching \d{4}-\d{2}-\d{2} as startDate, e.g. "2027-13-45".
 * Once stored, buildHandoff (GET /trips/:id/handoff, and the mock /prices path) calls
 * addDays -> new Date("2027-13-45T00:00:00Z").toISOString() which throws RangeError, so the
 * booking screen for that trip returns 500 until the date is changed.
 */

const trip: Trip = {
  id: "t1", status: "saved", mood: "solo", budgetMode: false, origin: "Amsterdam", travelers: 1, booked: {}, bestMonths: [],
  startDate: "2027-13-45", // passes /^\d{4}-\d{2}-\d{2}$/
  places: [{ id: "oia", name: "Oia", country: "Greece", vibe: [], createdAt: 0 }],
  plan: {
    title: "x", summary: "", estimate: { travel: 0, stay: 0, activities: 0, food: 0 }, tips: [],
    days: [
      { day: 1, title: "", base: "Fira", items: [{ time: "07:00", kind: "travel", title: "Fly", detail: "", cost: 0 }] },
      { day: 2, title: "", base: "Fira", items: [{ time: "15:00", kind: "travel", title: "Fly home", detail: "", cost: 0 }] },
    ],
  },
  createdAt: 0, updatedAt: 0,
};

describe("P3-03 a stored start date the PATCH regex admits can crash the hand-off", () => {
  it("accepts the same value PATCH accepts, or PATCH should have rejected it", () => {
    expect(/^\d{4}-\d{2}-\d{2}$/.test(trip.startDate!)).toBe(true); // what trips-api.ts:233 checks
    // Expected: a Handoff (or a 400 at PATCH time). Actual: RangeError: Invalid time value.
    expect(() => buildHandoff(trip, {})).not.toThrow();
  });
});
