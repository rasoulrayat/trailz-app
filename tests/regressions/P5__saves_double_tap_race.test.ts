// P5 web-check-flow: toggleSave() optimistic toggle is not idempotent under a quick double tap.
// Tap 1 (save) is still in flight when tap 2 (unsave) runs: tap 2 finds the optimistic
// `tmp-…` row, DELETEs that fake id (the server never had it), then the late POST response
// (and the reload) put the place back as saved. The user's last action was "unsave".
import { describe, expect, it, vi } from "vitest";
import { findSaved, toggleSave } from "../../src/saves";

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("P5 saves: double tap on the heart", () => {
  it("ends unsaved (last tap was unsave) and never leaves the server row behind", async () => {
    const place = { name: "Oia", region: null, country: "Greece", lat: 36.46, lng: 25.37, vibe: [], checkId: "c1", authenticity: 8 };
    const serverRow = { ...place, id: "srv-1", createdAt: 1 };
    const post = deferred<Response>();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const m = `${init?.method ?? "GET"} ${url}`;
        calls.push(m);
        if (m === "POST /api/saves") return post.promise; // tap 1: slow network
        if (m === "DELETE /api/saves/srv-1") return json({ items: [], suggestions: [] }); // the real row is gone
        if (m.startsWith("DELETE /api/saves/")) return json({ items: [serverRow], suggestions: [] }); // unknown (tmp) id: nothing deleted
        if (m === "GET /api/saves") return json({ items: [serverRow], suggestions: [] });
        throw new Error(`unexpected ${m}`);
      }),
    );

    const tap1 = toggleSave(place); // save (optimistic)
    expect(findSaved("Oia", "Greece")).toBeTruthy();
    const tap2 = toggleSave(place); // unsave, while tap 1 is still in flight
    expect(findSaved("Oia", "Greece")).toBeFalsy();
    setTimeout(() => post.resolve(json({ items: [serverRow], suggestions: [] })), 20); // tap 1's response arrives after tap 2
    await tap1;
    await tap2;
    await new Promise((r) => setTimeout(r, 0));

    // The heart must be empty: the user's last tap was "unsave".
    expect(findSaved("Oia", "Greece"), `heart is on; calls: ${calls.join(" | ")}`).toBeFalsy();
    // And the DELETE must not go to the fake optimistic id.
    const deletes = calls.filter((c) => c.startsWith("DELETE "));
    expect(deletes.some((c) => c.includes("/tmp-"))).toBe(false);
  });
});
