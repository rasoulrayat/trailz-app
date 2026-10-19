import { describe, expect, it } from "vitest";
import { iataFor } from "../../worker/lib/prices";

/**
 * P3-02 — worker/lib/prices.ts:28-41 (+ cached() at :6-12)
 * iataFor returns null when the autocomplete call fails (non-2xx, timeout, network error) and that
 * null is written to kv_cache with the 30-day TTL. One transient failure makes the airport lookup for
 * that place return null for a month: no flight prices, Kiwi link falls back to the city name.
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

describe("P3-02 a failed airport lookup is cached for 30 days", () => {
  it("retries the lookup after a transient 5xx instead of returning the cached null", async () => {
    const db = fakeDb();
    const failing = (async () => new Response("upstream down", { status: 503 })) as unknown as typeof fetch;
    const working = (async () =>
      new Response(JSON.stringify([{ code: "JTR", name: "Santorini", country_name: "Greece", type: "city" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    expect(await iataFor(db, "Santorini, Greece", failing)).toBeNull(); // the outage itself: fine

    // Next request, upstream healthy. Expected: JTR. Actual: null (poisoned cache, TTL 30 days).
    const hit = await iataFor(db, "Santorini, Greece", working);
    expect(hit?.code).toBe("JTR");
  });
});
