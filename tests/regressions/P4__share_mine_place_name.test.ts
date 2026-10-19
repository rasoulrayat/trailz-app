// P4-04: a share made for one place inside a many-places reel stores place_name (worker/share-api.ts:30,40), but
// the client's tally lookup (src/api.ts:121, used by src/components/ShareButton.tsx:14,31) calls
// GET /api/share/mine?kind=check&id=<id> without placeName, and the server then filters on place_name IS NULL
// (worker/share-api.ts:51-54). The owner never sees friends' votes on that card.
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { share } from "../../worker/share-api";
import { fakeD1 } from "./P4__fake-d1";

const DEVICE = "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1";

function appWith(db: D1Database) {
  const app = new Hono<{ Bindings: { DB: D1Database }; Variables: { deviceId: string; rawDeviceId: string; user: null } }>().basePath("/api");
  app.use("*", async (c, next) => {
    c.set("deviceId", DEVICE);
    c.set("rawDeviceId", DEVICE);
    c.set("user", null);
    await next();
  });
  app.route("/", share as unknown as Hono);
  return (path: string, init?: RequestInit) => app.request(`https://trailz.test${path}`, init, { DB: db });
}

describe("P4 share/mine for a place inside a many-places reel", () => {
  it("P4-04: the client's /share/mine call finds the share it just created with a placeName", async () => {
    const db = fakeD1();
    const now = Date.now();
    await db.prepare("INSERT INTO videos (id, canonical_key, platform, url, status, outcome, result_json, created_at, updated_at) VALUES ('vid1','tiktok:1','tiktok','https://t/1','ready','multi','{}',?,?)").bind(now, now).run();
    const req = appWith(db);

    // ShareButton.go(): shareApi.create("check", id, placeName)
    const created = await req("/api/share", { method: "POST", body: JSON.stringify({ kind: "check", id: "vid1", placeName: "Positano" }), headers: { "content-type": "application/json" } });
    expect(created.status).toBe(200);
    const { token } = (await created.json()) as { token: string };
    expect(token).toBeTruthy();

    // A friend votes on it.
    const voted = await req(`/api/share/${token}/vote`, { method: "POST", body: JSON.stringify({ vote: "in", name: "Ana" }), headers: { "content-type": "application/json" } });
    expect(voted.status).toBe(200);

    // ShareButton effect: shareApi.mine(kind, id) → exactly the URL src/api.ts:121 builds.
    // What src/api.ts shareApi.mine(kind, id, placeName) sends now.
    const mine = await req(`/api/share/mine?kind=check&id=${encodeURIComponent("vid1")}&placeName=${encodeURIComponent("Positano")}`);
    const body = (await mine.json()) as { token: string | null; votes: { in: number } | null };
    expect(body.token).toBe(token);
    expect(body.votes?.in).toBe(1);
  });
});
