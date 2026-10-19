import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../../worker/index";
import { fakeD1, fakeCtx, readyRow } from "./P1__fakeD1";

/**
 * GET /api/checks/:id (index.ts:244-248) kicks off fillVideoMeta for a ready video whose
 * thumbnail_url is NULL and marks the response publicly cacheable as soon as
 * thumbnail_url is non-null. fillVideoMeta (media.ts:28) claims the row by writing ''
 * *before* it fetches the cover, and '' is also the "nothing found" sentinel. So a poll
 * that lands while the cover is still being fetched (CheckPage re-polls 4 s later for
 * exactly this reason) is served thumbnailUrl "" with
 * cache-control: public, max-age=3600, stale-while-revalidate=86400 -- the browser then
 * keeps the cover-less result for an hour although the cover lands in D1 seconds later.
 */
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("P1: ready check must not be cached publicly while its cover is still being filled", () => {
  it("second poll during the fill window", async () => {
    globalThis.fetch = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/metadata")) return Response.json({ title: "t", author: { username: "x" }, media: { thumbnailUrl: "https://cdn.example/cover.jpg" } });
      if (u.includes("cover.jpg")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
      return new Response("nope", { status: 500 });
    }) as typeof fetch;

    const row = readyRow({ thumbnail_url: null });
    const db = fakeD1([row]);
    const env = { DB: db, MOCK_AI: "0", SUPADATA_API_KEY: "***", DAILY_LIMIT: "10" } as unknown as Parameters<typeof app.request>[2];

    const ctx1 = fakeCtx();
    const r1 = await app.request("/api/checks/abc123def456", {}, env, ctx1);
    expect(r1.status).toBe(200);
    expect(r1.headers.get("cache-control")).toBeNull(); // cover not tried yet: fine
    await new Promise((r) => setTimeout(r, 50)); // let fillVideoMeta claim the row ('')

    const r2 = await app.request("/api/checks/abc123def456", {}, env, fakeCtx());
    const body2 = (await r2.json()) as { video: { thumbnailUrl: string | null } };
    const cc2 = r2.headers.get("cache-control");

    await Promise.all(ctx1.pending); // background fill finishes
    expect(row.thumbnail_url).toBe("/api/img/v-abc123def456"); // the cover did arrive

    // A response that will be cached for an hour must already carry the final cover.
    const publiclyCached = !!cc2 && /public/.test(cc2);
    expect(publiclyCached ? body2.video.thumbnailUrl : "/api/img/v-abc123def456").toBe("/api/img/v-abc123def456");
  }, 15_000);
});
