import { describe, expect, it } from "vitest";
import { googleHotelsLink, googleHotelsTs } from "../worker/lib/google-hotels-link";

describe("Google Hotels links", () => {
  it("builds the same ts Google writes after choosing dates and travelers", () => {
    // Copied from Google's address bar: Brown's Avenue Hotel, 3–6 Dec 2026, 3 adults, EUR.
    expect(googleHotelsTs("2026-12-03", "2026-12-06", 3)).toBe("CAESDgoCCAMKAggDCgIIAxABGiAKAhoAEhoSFAoHCOoPEAwYAxIHCOoPEAwYBhgDMgIIAioJCgU6A0VVUhoA");
    expect(googleHotelsTs("2026-12-03", "2026-12-06", 1)).toBe("CAESBgoCCAMQARogCgIaABIaEhQKBwjqDxAMGAMSBwjqDxAMGAYYAzICCAIqCQoFOgNFVVIaAA");
    expect(googleHotelsTs("2026-12-03", "2026-12-06", 4)).toBe("CAESEgoCCAMKAggDCgIIAwoCCAMQARogCgIaABIaEhQKBwjqDxAMGAMSBwjqDxAMGAYYAzICCAIqCQoFOgNFVVIaAA");
  });

  it("opens the hotel's own Google Hotels page when there is a token", () => {
    const url = googleHotelsLink({ token: "ChkIhLCQwvjO2IYWGg0vZy8xMXE0bTZieDkyEAE", place: "Lisbon, Portugal", checkIn: "2026-12-03", checkOut: "2026-12-06", adults: 3 });
    expect(url).toBe("https://www.google.com/travel/hotels/entity/ChkIhLCQwvjO2IYWGg0vZy8xMXE0bTZieDkyEAE?hl=en&curr=EUR&ts=CAESDgoCCAMKAggDCgIIAxABGiAKAhoAEhoSFAoHCOoPEAwYAxIHCOoPEAwYBhgDMgIIAioJCgU6A0VVUhoA");
  });

  it("falls back to the town's hotel list with the same dates, never to the hotel's own site", () => {
    const url = new URL(googleHotelsLink({ token: null, place: "Positano, Italy", checkIn: "2027-05-14", checkOut: "2027-05-18", adults: 2 }));
    expect(url.hostname).toBe("www.google.com");
    expect(url.pathname).toBe("/travel/search");
    expect(url.searchParams.get("q")).toBe("hotels in Positano, Italy");
    expect(url.searchParams.get("ts")).toBe(googleHotelsTs("2027-05-14", "2027-05-18", 2));
  });

  it("leaves dates out rather than sending broken ones", () => {
    expect(googleHotelsLink({ token: "ChkIhLCQwvjO2IYWGg0vZy8xMXE0bTZieDkyEAE", place: "Lisbon", checkIn: "2026-12-06", checkOut: "2026-12-03", adults: 2 })).not.toContain("ts=");
    expect(googleHotelsLink({ token: "not a token!", place: "Lisbon", checkIn: "x", checkOut: "y", adults: 2 })).toContain("/travel/search?q=hotels%20in%20Lisbon");
  });
});
