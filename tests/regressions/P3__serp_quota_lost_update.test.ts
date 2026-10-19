import { describe, expect, it } from "vitest";
import { serpBudget } from "../../worker/lib/providers";

/**
 * P3-05 — worker/lib/providers.ts:16-26
 * serpBudget is read-then-write with two independent statements and no atomic increment, so
 * concurrent requests (two users opening Compare & go at once) both read the same count and the
 * quota is under-counted; with the count sitting at limit-1 both calls are allowed.
 */

function fakeDb() {
  const kv = new Map<string, { json: string; expires_at: number }>();
  return {
    kv,
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (!/FROM kv_cache/.test(sql)) return null;
              const row = kv.get(String(args[0]));
              return row ? { json: row.json } : null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              if (/INSERT OR REPLACE INTO kv_cache/.test(sql)) kv.set(String(args[0]), { json: String(args[1]), expires_at: Number(args[2]) });
              if (/INSERT OR IGNORE INTO kv_cache/.test(sql) && !kv.has(String(args[0]))) kv.set(String(args[0]), { json: "0", expires_at: Number(args[1]) });
              if (/UPDATE kv_cache SET json = CAST/.test(sql)) {
                // Same semantics as SQLite: one statement, read+compare+write atomically.
                const row = kv.get(String(args[0]));
                if (row && Number(row.json) < Number(args[1])) {
                  row.json = String(Number(row.json) + 1);
                  return { success: true, meta: { changes: 1 } };
                }
                return { success: true, meta: { changes: 0 } };
              }
              return {};
            },
          };
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("P3-05 SerpApi quota counter loses concurrent increments", () => {
  it("counts every allowed call and never allows more than the limit", async () => {
    const db = fakeDb();
    const month = new Date().toISOString().slice(0, 7);
    db.kv.set(`serp:quota:${month}`, { json: "4", expires_at: Date.now() + 1e9 }); // limit 5, one call left

    const allowed = await Promise.all([serpBudget(db, 5), serpBudget(db, 5), serpBudget(db, 5)]);
    const used = JSON.parse(db.kv.get(`serp:quota:${month}`)!.json) as number;
    // Expected: exactly one of the three is allowed and the counter reaches 5.
    // Actual: all three are allowed and the counter reads 5 (two increments lost).
    expect(allowed.filter(Boolean)).toHaveLength(1);
    expect(used).toBe(5);
  });
});
