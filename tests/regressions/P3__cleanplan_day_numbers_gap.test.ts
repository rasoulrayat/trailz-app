import { describe, expect, it, vi } from "vitest";
import type { Trip } from "../../shared/types";
import { buildHandoff, generatePlan } from "../../worker/lib/trips";

/**
 * P3-04 — worker/lib/trips.ts:152-171 (cleanPlan)
 * Days are numbered i+1 BEFORE empty days are filtered out, so a day whose items all fail the
 * title/detail check leaves a gap (1, 3, 4...). Downstream treats `day` as the ordinal: the hand-off
 * dates activities with addDays(start, day - 1) while nights/checkout come from days.length - 1,
 * so an activity can be dated after the stay has ended.
 */

vi.mock("../../worker/lib/gemini", () => ({
  generateJsonPublic: async () => ({
    title: "Santorini", summary: "", estimate: { travel: 100, stay: 100, activities: 50, food: 50 }, tips: [],
    gateway: { arrive: "Santorini", leave: "Santorini" },
    days: [
      { day: 1, title: "Arrive", base: "Fira", items: [{ time: "08:00", kind: "travel", title: "Fly", detail: "ok", cost: 100, fromReel: false, book: "flights" }] },
      // The model returned a day with no usable items (no `detail` on any of them).
      { day: 2, title: "Rest", base: "Fira", items: [{ time: "10:00", kind: "free", title: "Beach" }] },
      { day: 3, title: "Boat", base: "Fira", items: [{ time: "09:00", kind: "do", title: "Caldera boat trip", detail: "ok", cost: 65, fromReel: false, book: "activity" }] },
    ],
  }),
}));

describe("P3-04 cleanPlan leaves gaps in day numbers", () => {
  it("renumbers days contiguously after dropping empty ones", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plan = await generatePlan({} as any, { places: [{ id: "oia", name: "Oia", country: "Greece", vibe: [], createdAt: 0 }], mood: "solo", budgetMode: false, days: 3, origin: "Amsterdam", travelers: 1 });
    expect(plan.days).toHaveLength(2);

    const trip: Trip = { id: "t", status: "saved", mood: "solo", budgetMode: false, origin: "Amsterdam", travelers: 1, startDate: "2027-06-12", booked: {}, bestMonths: [], places: [], plan, createdAt: 0, updatedAt: 0 };
    const h = buildHandoff(trip, {});
    const checkout = new URL(h.stay[0].url).searchParams.get("checkout"); // 2027-06-13 (1 night)
    const activityDate = new URL(h.activities[0].url).searchParams.get("date_from");
    // Expected: the activity falls within the stay. Actual: 2027-06-14, after the 2027-06-13 checkout.
    expect(activityDate! <= checkout!).toBe(true);
    expect(plan.days.map((d) => d.day)).toEqual([1, 2]);
  });
});
