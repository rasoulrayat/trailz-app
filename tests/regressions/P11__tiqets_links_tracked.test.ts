// Tiqets deep links must earn commission: they go through the Travelpayouts links API (TrailZ's account),
// are cached, and fall back to the plain link when Tiqets isn't joined or the API is down.
import { describe, expect, it } from "vitest";
import { trackedLinks } from "../../worker/lib/tp-links";
import { fakeD1 } from "./P4__fake-d1";

const keys = { token: "t", marker: "789861", trs: "585453" };
const TICKET = "https://www.tiqets.com/en/barcelona-attractions-c66342/tickets-for-sagrada-familia-entry-ticket-p1111400/";
const TOWN = "https://www.tiqets.com/en/barcelona-attractions-c66342/";

function api(answer: (url: string) => { code: string; partner_url?: string; message?: string }, status = 200) {
  const calls: unknown[] = [];
  const fetcher = (async (_u: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { trs: number; marker: number; links: { url: string }[] };
    calls.push(body);
    if (status !== 200) return new Response("{}", { status });
    return new Response(JSON.stringify({ result: { links: body.links.map((l) => ({ url: l.url, ...answer(l.url) })) }, code: "success", status: 200 }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe("tracked Tiqets links", () => {
  it("turns each deep link into a tracked one, once, with our marker and project", async () => {
    const db = fakeD1();
    const { fetcher, calls } = api((u) => ({ code: "success", partner_url: `https://tiqets.tpx.gr/x?u=${encodeURIComponent(u)}` }));
    const first = await trackedLinks(db, keys, [TICKET, TOWN, TICKET], "activity", fetcher);
    expect(first.get(TICKET)).toContain("tiqets.tpx.gr");
    expect(first.get(TOWN)).toContain("tiqets.tpx.gr");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ trs: 585453, marker: 789861, shorten: false });
    const again = await trackedLinks(db, keys, [TICKET], "activity", fetcher);
    expect(again.get(TICKET)).toBe(first.get(TICKET));
    expect(calls).toHaveLength(1); // from the cache
  });

  it("keeps the plain link when Tiqets isn't joined on this project, and doesn't ask again today", async () => {
    const db = fakeD1();
    const { fetcher, calls } = api(() => ({ code: "failed", message: "trs is not subscribed for brand" }));
    expect((await trackedLinks(db, keys, [TICKET], "activity", fetcher)).size).toBe(0);
    expect((await trackedLinks(db, keys, [TICKET], "activity", fetcher)).size).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it("asks again next time when the API itself fails (bad token, outage)", async () => {
    const db = fakeD1();
    const { fetcher, calls } = api(() => ({ code: "success" }), 401);
    expect((await trackedLinks(db, keys, [TICKET], "activity", fetcher)).size).toBe(0);
    await trackedLinks(db, keys, [TICKET], "activity", fetcher);
    expect(calls).toHaveLength(2);
  });

  it("does nothing without a token", async () => {
    const { fetcher, calls } = api(() => ({ code: "success", partner_url: "x" }));
    expect((await trackedLinks(fakeD1(), { marker: "1", trs: "2" }, [TICKET], "activity", fetcher)).size).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
