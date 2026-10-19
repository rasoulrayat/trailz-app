import { describe, expect, it } from "vitest";
import { placeGallery } from "../../worker/lib/media";

/**
 * Hypothesis: placeGallery keeps a Commons file when placeKey(title).includes(first), where first is
 * the FIRST WORD of the place name and includes() is a substring test. For names that start with a
 * short word ("La Digue", "St. Moritz", "El Nido", "The Wave") the filter accepts almost any file,
 * so photos of other places enter the gallery (tests/media.test.ts expects "files about other
 * places" to be skipped).
 */
const fakeDb = {
  prepare: () => ({ bind: () => ({ first: async () => null, run: async () => ({ meta: { changes: 1 } }) }) }),
} as unknown as D1Database;

const apis = (wiki: unknown[], commons: unknown[]) =>
  (async (url: string) =>
    new Response(JSON.stringify({ query: { pages: url.includes("commons.wikimedia.org") ? commons : wiki } }), { status: 200 })) as unknown as typeof fetch;

const file = (title: string, thumburl: string) => ({
  title,
  imageinfo: [{ thumburl, mime: "image/jpeg", descriptionurl: `https://commons.wikimedia.org/wiki/${title}`, extmetadata: {} }],
});

describe("place gallery for a name starting with a short word", () => {
  it("skips files about other places for 'La Digue, Seychelles'", async () => {
    const g = await placeGallery(
      fakeDb,
      "x",
      "La Digue, Seychelles",
      apis(
        [{ index: 1, title: "Praslin", fullurl: "https://en.wikipedia.org/wiki/Praslin", thumbnail: { source: "https://u/praslin-lead.jpg" } }],
        [file("File:Praslin Anse Lazio.jpg", "https://u/praslin.jpg"), file("File:La Digue Anse Source d'Argent.jpg", "https://u/ladigue.jpg")],
      ),
    );
    expect(g.pageUrl).not.toBe("https://en.wikipedia.org/wiki/Praslin");
    expect(g.photos.map((p) => p.url)).toEqual(["https://u/ladigue.jpg"]);
  });
});
