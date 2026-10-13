import { describe, expect, it } from "vitest";
import { placeGallery } from "../worker/lib/media";
import { getMetadata } from "../worker/lib/supadata";

/** Just enough of D1: cache always misses, writes are ignored. */
const fakeDb = {
  prepare: () => ({ bind: () => ({ first: async () => null, run: async () => ({ meta: { changes: 1 } }) }) }),
} as unknown as D1Database;

/** Answers Wikipedia and Commons searches with the given pages. */
const apis = (wiki: unknown[], commons: unknown[] = []) =>
  (async (url: string) =>
    new Response(JSON.stringify({ query: { pages: url.includes("commons.wikimedia.org") ? commons : wiki } }), {
      status: 200,
    })) as unknown as typeof fetch;

const file = (title: string, thumburl: string, mime = "image/jpeg") => ({
  title,
  imageinfo: [
    {
      thumburl,
      mime,
      descriptionurl: `https://commons.wikimedia.org/wiki/${title}`,
      extmetadata: { Artist: { value: '<a href="//x">Jane Doe</a>' }, LicenseShortName: { value: "CC BY-SA 4.0" } },
    },
  ],
});

describe("place photo galleries", () => {
  it("puts the Wikipedia image first, then Commons photos with credits", async () => {
    const g = await placeGallery(
      fakeDb,
      "x",
      "Kandersteg, Switzerland",
      apis(
        [{ index: 1, title: "Kandersteg", fullurl: "https://en.wikipedia.org/wiki/Kandersteg", thumbnail: { source: "https://upload.wikimedia.org/k.jpg" } }],
        [file("File:Kandersteg Oeschinensee.jpg", "https://upload.wikimedia.org/o.jpg")],
      ),
    );
    expect(g.pageUrl).toBe("https://en.wikipedia.org/wiki/Kandersteg");
    expect(g.photos.map((p) => p.url)).toEqual(["https://upload.wikimedia.org/k.jpg", "https://upload.wikimedia.org/o.jpg"]);
    expect(g.photos[1]).toMatchObject({ credit: "Jane Doe", license: "CC BY-SA 4.0" });
  });

  it("skips coats of arms, maps, PNG drawings and files about other places", async () => {
    const g = await placeGallery(
      fakeDb,
      "x",
      "Flåm, Norway",
      apis(
        [{ index: 1, title: "Flåm", thumbnail: { source: "https://upload.wikimedia.org/thumb/Coat_of_arms.svg/800px-x.svg.png" } }],
        [
          file("File:Flåm location map.jpg", "https://u/map.jpg"),
          file("File:Flam railway drawing.png", "https://u/d.png", "image/png"),
          file("File:Bergen harbour.jpg", "https://u/bergen.jpg"),
          file("File:Flåmsbana train.jpg", "https://u/train.jpg"),
        ],
      ),
    );
    expect(g.photos.map((p) => p.url)).toEqual(["https://u/train.jpg"]);
  });

  it("returns no photos when nothing matches", async () => {
    const g = await placeGallery(fakeDb, "x", "Secret Cove, Portugal", apis([{ index: 1, title: "Lisbon", thumbnail: { source: "https://u/l.jpg" } }]));
    expect(g.photos).toEqual([]);
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
