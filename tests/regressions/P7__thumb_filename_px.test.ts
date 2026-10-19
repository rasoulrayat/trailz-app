import { describe, expect, it } from "vitest";
import { thumb } from "../../src/components/PlacePhoto";

/**
 * P7: thumb() rewrites the FIRST "/<n>px-" segment in a Wikimedia thumb URL. When the Commons file is
 * itself named "<n>px-…" (common for re-uploaded downscales, e.g. "File:1200px-Oia_sunset.jpg"), that
 * segment is the original file's directory name, not the thumbnail size, so the rewritten URL is a 404.
 */
describe("thumb() on a Commons file whose name starts with <n>px-", () => {
  const url = "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/1200px-Oia_sunset.jpg/1000px-1200px-Oia_sunset.jpg";

  it("changes only the thumbnail-size segment (the last one)", () => {
    expect(thumb(url, 400)).toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/1200px-Oia_sunset.jpg/400px-1200px-Oia_sunset.jpg");
  });

  it("still works for an ordinary file name (control)", () => {
    const ok = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Oia_sunset.jpg/1000px-Oia_sunset.jpg";
    expect(thumb(ok, 400)).toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Oia_sunset.jpg/400px-Oia_sunset.jpg");
  });
});
