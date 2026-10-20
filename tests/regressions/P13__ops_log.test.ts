// The operation log: each workflow step records ok / empty / fail / skip, so the status page can show what works.
import { describe, expect, it } from "vitest";
import { clean, noteFail, noteSkip, opsSummary, recordOp, someOrEmpty, track } from "../../worker/lib/ops";
import { fakeD1 } from "./P4__fake-d1";

describe("operation log", () => {
  it("counts outcomes per step and keeps the details of what didn't simply work", async () => {
    const db = fakeD1();
    await track(db, "prices.google-flights", async () => [1, 2], { judge: someOrEmpty });
    await track(db, "prices.google-flights", async () => [], { judge: someOrEmpty });
    await track(db, "prices.google-flights", async () => (noteFail("HTTP 429"), []), { judge: someOrEmpty, ref: "t1 AMS→LIS" });
    await track(db, "prices.google-hotels", async () => (noteSkip("SerpApi monthly limit reached"), []), { judge: someOrEmpty });
    const s = await opsSummary(db);
    const flights = s.ops.find((o) => o.op === "prices.google-flights")!;
    expect(flights.last24h).toMatchObject({ ok: 1, empty: 1, fail: 1, skip: 0 });
    expect(flights.health).toBe("mixed");
    expect(flights.lastProblem).toMatchObject({ outcome: "fail", detail: "HTTP 429" });
    const hotels = s.ops.find((o) => o.op === "prices.google-hotels")!;
    expect(hotels.last24h.skip).toBe(1);
    expect(s.recent[0]).toMatchObject({ op: "prices.google-flights", outcome: "fail", ref: "t1 AMS→LIS" });
    // A step that never ran is "idle", and every known step is listed.
    expect(s.ops.find((o) => o.op === "auth.google")!.health).toBe("idle");
  });

  it("records a thrown error and rethrows it, or returns the fallback", async () => {
    const db = fakeD1();
    await expect(track(db, "trip.plan", async () => Promise.reject(new Error("Gemini 503")))).rejects.toThrow("Gemini 503");
    expect(await track(db, "activities.viator", async () => Promise.reject(new Error("timeout")), { fallback: null })).toBeNull();
    const s = await opsSummary(db);
    expect(s.ops.find((o) => o.op === "trip.plan")!).toMatchObject({ health: "failing", lastProblem: { detail: "Gemini 503" } });
  });

  it("keeps notes separate between steps running at the same time", async () => {
    const db = fakeD1();
    const slowFail = track(db, "prices.duffel", async () => {
      await new Promise((r) => setTimeout(r, 20));
      noteFail("HTTP 500");
      return [];
    }, { judge: someOrEmpty });
    const fastOk = track(db, "prices.aviasales", async () => [1], { judge: someOrEmpty });
    await Promise.all([slowFail, fastOk]);
    const s = await opsSummary(db);
    expect(s.ops.find((o) => o.op === "prices.aviasales")!.last24h).toMatchObject({ ok: 1, fail: 0 });
    expect(s.ops.find((o) => o.op === "prices.duffel")!.last24h).toMatchObject({ ok: 0, fail: 1 });
  });

  it("never stores secrets", () => {
    expect(clean("GET https://serpapi.com/search.json?engine=google_hotels&api_key=abc123secret&q=x failed")).toBe("GET https://serpapi.com/search.json?engine=google_hotels&api_key=…&q=x failed");
    expect(clean("Authorization: Bearer duffel_live_abcdefgh")).toBe("Authorization: Bearer …");
    expect(clean("token af56d316-9af1-4e20-a1c0-1643cdeac114af56d316 bad")).toBe("token … bad");
  });

  it("never breaks the request when the tables are missing", async () => {
    const db = { prepare: () => { throw new Error("no such table: op_stats"); } } as unknown as D1Database;
    await expect(recordOp(db, "photos", "ok")).resolves.toBeUndefined();
  });
});
