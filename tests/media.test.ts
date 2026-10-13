import { describe, expect, it } from "vitest";
import { placePhoto } from "../worker/lib/media";
import { getMetadata } from "../worker/lib/supadata";

/** Just enough of D1 for the cache: always a miss, writes ignored. */
const fakeDb = {
  prepare: () => ({ bind: () => ({ first: async () => null, run: async () => ({ meta: { changes: 1 } }) }) }),
} as unknown as D1Database;

const wiki = (pages: unknown[]) =>
  (async () => new Response(JSON.stringify({ query: { pages } }), { status: 200 })) as unknown as typeof fetch;

describe("place photos", () => {
  it("uses the photo of the matching article", async () => {
    const p = await placePhoto(
      fakeDb,
      "x",
      "Kandersteg, Switzerland",
      wiki([{ index: 1, title: "Kandersteg", fullurl: "https://en.wikipedia.org/wiki/Kandersteg", thumbnail: { source: "https://upload.wikimedia.org/k.jpg" } }]),
    );
    expect(p).toMatchObject({ url: "https://upload.wikimedia.org/k.jpg", title: "Kandersteg" });
  });

  it("skips coats of arms, flags and maps", async () => {
    const p = await placePhoto(
      fakeDb,
      "x",
      "Flåm, Norway",
      wiki([
        { index: 1, title: "Flåm", thumbnail: { source: "https://upload.wikimedia.org/thumb/Coat_of_arms.svg/800px-x.svg.png" } },
        { index: 2, title: "Flåm Line", thumbnail: { source: "https://upload.wikimedia.org/flamsbana.jpg" } },
      ]),
    );
    expect(p.url).toBe("https://upload.wikimedia.org/flamsbana.jpg");
  });

  it("returns nothing when the article is about something else", async () => {
    const p = await placePhoto(fakeDb, "x", "Secret Cove, Portugal", wiki([{ index: 1, title: "Lisbon", thumbnail: { source: "https://u/l.jpg" } }]));
    expect(p.url).toBeNull();
  });
});

describe("Supadata metadata", () => {
  it("reads cover, title and creator", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({ title: null, description: "Monsoon trip", author: { username: "wanderer" }, media: { thumbnailUrl: "https://cdn/x.jpg" } }),
        { status: 200 },
      )) as unknown as typeof fetch;
    expect(await getMetadata("k", "https://www.instagram.com/reel/abc/", fetcher)).toEqual({
      title: "Monsoon trip",
      author: "@wanderer",
      thumbnailUrl: "https://cdn/x.jpg",
    });
  });
});
