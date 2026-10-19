import { describe, expect, it } from "vitest";
import { parseLink } from "../../worker/lib/links";

/**
 * Instagram's share sheet produces links of the form
 *   https://www.instagram.com/share/reel/_abc123   (and /share/p/..., /share/_abc123)
 * The token after /share/reel/ is an opaque redirect code, NOT the reel shortcode.
 * links.ts:66 treats parts[0] === "share" as a short link, but the reel/p/tv check on
 * line 58 runs first and matches "reel" at index 1, so the share link is reported as a
 * video with canonicalKey "instagram:<share-token>" and a URL that does not exist.
 */
describe("P1: Instagram /share/reel/<token> must be a short link, not a video", () => {
  it("share/reel is a short link", () => {
    const r = parseLink("https://www.instagram.com/share/reel/_tLK5m9zXy");
    expect(r.kind).toBe("short");
  });
  it("share/p is a short link", () => {
    const r = parseLink("https://www.instagram.com/share/p/_tLK5m9zXy/");
    expect(r.kind).toBe("short");
  });
  it("plain share token is a short link (control: this one already works)", () => {
    expect(parseLink("https://www.instagram.com/share/_tLK5m9zXy").kind).toBe("short");
  });
});
