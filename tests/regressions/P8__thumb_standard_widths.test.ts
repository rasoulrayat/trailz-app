import { describe, expect, it } from "vitest";
import { thumb, thumbWidth, WIKIMEDIA_WIDTHS } from "../../src/components/PlacePhoto";

// Wikimedia answers non-standard thumbnail widths with an HTTP 429 error page, so every picture that asked for
// 360/400/640 px (onboarding vibes, Explore and Home tiles without a reel cover) showed nothing.
const url =
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d3/Navagio%2C_Zante_01.jpg/1280px-Navagio%2C_Zante_01.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail";

describe("thumb", () => {
  it("only ever asks Wikimedia for a width it serves, rounding up", () => {
    expect(thumbWidth(360)).toBe(500);
    expect(thumbWidth(400)).toBe(500);
    expect(thumbWidth(200)).toBe(250);
    expect(thumbWidth(640)).toBe(960);
    expect(thumbWidth(330)).toBe(330);
    expect(thumbWidth(5000)).toBe(3840);
    for (const w of [1, 100, 200, 360, 400, 640, 1000, 1500]) expect(WIKIMEDIA_WIDTHS).toContain(thumbWidth(w));
  });

  it("rewrites the size in a Wikimedia thumbnail URL and keeps the rest", () => {
    expect(thumb(url, 360)).toBe(url.replace("/1280px-", "/500px-"));
    expect(thumb("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/1200px-Foo.jpg/1280px-1200px-Foo.jpg", 200)).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/1200px-Foo.jpg/250px-1200px-Foo.jpg",
    );
  });

  it("leaves other images alone", () => {
    expect(thumb("https://p16-sign.tiktokcdn.com/cover.jpg", 360)).toBe("https://p16-sign.tiktokcdn.com/cover.jpg");
  });
});
