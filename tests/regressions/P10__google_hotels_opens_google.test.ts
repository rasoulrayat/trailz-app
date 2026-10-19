// Stays found on Google Hotels used to open the hotel's own website (no dates, no guests). They must open
// Google Hotels itself, on that hotel's page, with the trip's dates and travelers set.
import { describe, expect, it } from "vitest";
import { googleHotelsTs } from "../../worker/lib/google-hotels-link";
import { googleHotels } from "../../worker/lib/providers";
import { fakeD1 } from "./P4__fake-d1";

const serp = {
  properties: [
    { name: "Brown's Avenue Hotel", link: "https://www.brownsavenuehotel.com/", property_token: "ChkIhLCQwvjO2IYWGg0vZy8xMXE0bTZieDkyEAE", overall_rating: 4.6, extracted_hotel_class: 5, total_rate: { extracted_lowest: 387 }, rate_per_night: { extracted_lowest: 129 } },
    { name: "Rossio Hostel", link: "https://rossio.example/", overall_rating: 4.4, total_rate: { extracted_lowest: 150 } },
  ],
};
const fetcher = (async () => new Response(JSON.stringify(serp), { status: 200 })) as unknown as typeof fetch;

describe("Google Hotels offers", () => {
  it("open Google Hotels, never the hotel's own site", async () => {
    const offers = await googleHotels(fakeD1(), "key", 100, "Lisbon", "Portugal", "2026-12-03", "2026-12-06", 3, fetcher);
    expect(offers.map((o) => o.title.split(" · ")[0])).toEqual(["Rossio Hostel", "Brown's Avenue Hotel"]);
    const ts = googleHotelsTs("2026-12-03", "2026-12-06", 3);
    const browns = offers.find((o) => o.title.startsWith("Brown"))!;
    expect(browns.bookUrl).toBe(`https://www.google.com/travel/hotels/entity/ChkIhLCQwvjO2IYWGg0vZy8xMXE0bTZieDkyEAE?hl=en&curr=EUR&ts=${ts}`);
    // No token: the town's hotel list on Google, same dates and travelers.
    const hostel = new URL(offers.find((o) => o.title.startsWith("Rossio"))!.bookUrl);
    expect(hostel.hostname).toBe("www.google.com");
    expect(hostel.searchParams.get("ts")).toBe(ts);
    for (const o of offers) expect(o.bookUrl).not.toMatch(/brownsavenuehotel|rossio\.example/);
  });
});
