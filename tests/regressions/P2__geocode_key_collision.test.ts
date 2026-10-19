import { describe, expect, it } from "vitest";
import { geocode } from "../../worker/lib/geocode";

/**
 * Hypothesis: geocode's cache key is placeKey(query), which strips every non [a-z0-9] character.
 * For a place whose name is in a non-Latin script ("東京, Japan"), the key collapses to "japan",
 * so every non-Latin place in the same country shares one cache row and gets the FIRST place's
 * coordinates forever (the cache never expires).
 */
function fakeDb() {
  const rows = new Map<string, string | null>();
  return {
    rows,
    db: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => (sql.startsWith("SELECT") && rows.has(args[0] as string) ? { result_json: rows.get(args[0] as string) } : null),
          run: async () => {
            if (sql.startsWith("INSERT")) rows.set(args[0] as string, args[1] as string | null);
            return { meta: { changes: 1 } };
          },
          all: async () => ({ results: [] }),
        }),
      }),
    } as unknown as D1Database,
  };
}

describe("geocode cache key for non-Latin place names", () => {
  it("looks up Kyoto separately from Tokyo (both have Japan as country)", async () => {
    const { db, rows } = fakeDb();
    const asked: string[] = [];
    const fetcher = (async (url: string) => {
      const q = decodeURIComponent(new URL(url).searchParams.get("q") ?? "");
      asked.push(q);
      const tokyo = q.startsWith("東京");
      return new Response(
        JSON.stringify([{ lat: tokyo ? "35.6762" : "35.0116", lon: tokyo ? "139.6503" : "135.7681", display_name: tokyo ? "Tokyo" : "Kyoto", address: { country: "Japan" } }]),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const tokyo = await geocode(db, "qa@example.com", "東京, Japan", fetcher);
    const kyoto = await geocode(db, "qa@example.com", "京都, Japan", fetcher);

    expect(tokyo?.displayName).toBe("Tokyo");
    // Two different places → two lookups, two cache rows, Kyoto's own coordinates.
    expect(asked).toHaveLength(2);
    expect([...rows.keys()]).not.toEqual(["japan"]);
    expect(kyoto?.displayName).toBe("Kyoto");
  });
});
