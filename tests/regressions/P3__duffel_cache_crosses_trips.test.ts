import { describe, expect, it } from "vitest";
import { duffelFlights } from "../../worker/lib/providers";

/**
 * P3-01 — worker/lib/providers.ts:172,205
 * The Duffel cache key is route+dates+adults only, but every cached offer embeds the tripId of the
 * trip that filled the cache in its bookUrl (/api/trips/<tripId>/duffel-link). A second trip (same or
 * another device) on the same route gets Book buttons that point at the FIRST trip.
 */

function fakeDb() {
  const kv = new Map<string, { json: string; expires_at: number }>();
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (!/FROM kv_cache/.test(sql)) return null;
              const row = kv.get(String(args[0]));
              if (!row) return null;
              if (/expires_at > \?/.test(sql) && !(row.expires_at > Number(args[1]))) return null;
              return { json: row.json };
            },
            async all() {
              return { results: [] };
            },
            async run() {
              if (/INSERT OR REPLACE INTO kv_cache/.test(sql)) kv.set(String(args[0]), { json: String(args[1]), expires_at: Number(args[2]) });
              return {};
            },
          };
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const duffelBody = {
  data: {
    offers: [
      { id: "off_KLM_1", total_amount: "378.00", total_currency: "EUR", owner: { name: "KLM" }, slices: [{ duration: "PT2H40M", segments: [{}] }] },
    ],
  },
};

describe("P3-01 Duffel offers cached across trips", () => {
  it("a second trip on the same route gets bookUrls pointing at its own id", async () => {
    const db = fakeDb();
    let calls = 0;
    const fetcher = (async () => {
      calls++;
      return new Response(JSON.stringify(duffelBody), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const first = await duffelFlights(db, "duffel_live_***", "AMS", "NAP", "2027-06-12", "2027-06-15", 2, "trip_A", fetcher);
    expect(first[0].bookUrl).toContain("/api/trips/trip_A/duffel-link");

    // Another trip (possibly another user's) asks for the same route, dates and party size.
    const second = await duffelFlights(db, "duffel_live_***", "AMS", "NAP", "2027-06-12", "2027-06-15", 2, "trip_B", fetcher);
    expect(calls).toBe(1); // served from cache, as intended
    // Expected: Book goes to trip_B's checkout link. Actual: it goes to trip_A's.
    expect(second[0].bookUrl).toContain("/api/trips/trip_B/duffel-link");
  });
});
