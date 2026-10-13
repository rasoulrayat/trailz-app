import { describe, expect, it } from "vitest";
import { findUrl, parseLink, resolveShortLink } from "../worker/lib/links";

const video = (input: string) => {
  const r = parseLink(input);
  if (r.kind !== "video") throw new Error(`expected video, got ${JSON.stringify(r)}`);
  return r.link;
};
const errorCode = (input: string) => {
  const r = parseLink(input);
  return r.kind === "error" ? r.code : r.kind;
};

describe("findUrl", () => {
  it("pulls the link out of share-sheet text", () => {
    expect(findUrl("Check this out!! https://www.tiktok.com/@lena/video/7301234567890123456?lang=en wow")).toBe(
      "https://www.tiktok.com/@lena/video/7301234567890123456?lang=en",
    );
  });
  it("adds https to bare links", () => {
    expect(findUrl("youtube.com/shorts/abcDEF12345")).toBe("https://youtube.com/shorts/abcDEF12345");
  });
  it("returns null without a link", () => {
    expect(findUrl("santorini sunset")).toBeNull();
  });
});

describe("parseLink", () => {
  it("TikTok video: same key with or without tracking params", () => {
    const a = video("https://www.tiktok.com/@sunset.lena/video/7301234567890123456?is_from_webapp=1&sender_device=pc");
    const b = video("https://m.tiktok.com/@sunset.lena/video/7301234567890123456");
    expect(a.canonicalKey).toBe("tiktok:7301234567890123456");
    expect(b.canonicalKey).toBe(a.canonicalKey);
    expect(a.url).toBe("https://www.tiktok.com/@sunset.lena/video/7301234567890123456");
  });
  it("TikTok short links need a redirect lookup", () => {
    expect(parseLink("https://vm.tiktok.com/ZMabc123/").kind).toBe("short");
    expect(parseLink("https://www.tiktok.com/t/ZTabc123/").kind).toBe("short");
  });
  it("TikTok profile is refused with a helpful code", () => {
    expect(errorCode("https://www.tiktok.com/@sunset.lena")).toBe("profile_link");
  });
  it("Instagram reels and posts", () => {
    expect(video("https://www.instagram.com/reel/C8xYz12AbC/?igsh=abc").canonicalKey).toBe("instagram:C8xYz12AbC");
    expect(video("https://instagram.com/p/C8xYz12AbC/").canonicalKey).toBe("instagram:C8xYz12AbC");
    expect(video("https://www.instagram.com/reels/C8xYz12AbC/").url).toBe("https://www.instagram.com/reel/C8xYz12AbC/");
  });
  it("Instagram profile", () => {
    expect(errorCode("https://www.instagram.com/sunset.lena/")).toBe("profile_link");
  });
  it("YouTube shorts, watch links and youtu.be share the same key", () => {
    const keys = [
      "https://www.youtube.com/shorts/abcDEF12345",
      "https://youtube.com/watch?v=abcDEF12345&t=3s",
      "https://youtu.be/abcDEF12345?si=xyz",
      "https://m.youtube.com/shorts/abcDEF12345",
    ].map((u) => video(u).canonicalKey);
    expect(new Set(keys)).toEqual(new Set(["youtube:abcDEF12345"]));
  });
  it("YouTube channel is a profile", () => {
    expect(errorCode("https://www.youtube.com/@travelwithtom")).toBe("profile_link");
  });
  it("other websites are unsupported", () => {
    expect(errorCode("https://www.booking.com/hotel/gr/aethrio.html")).toBe("unsupported_site");
  });
  it("plain text is no_link", () => {
    expect(errorCode("oia sunset")).toBe("no_link");
  });
});

describe("resolveShortLink", () => {
  it("follows redirects to the real video", async () => {
    const fake = (async (url: string) => {
      if (url.includes("vm.tiktok.com"))
        return new Response(null, { status: 301, headers: { location: "https://www.tiktok.com/@lena/video/123456789?x=1" } });
      return new Response("ok");
    }) as unknown as typeof fetch;
    const r = await resolveShortLink("https://vm.tiktok.com/ZMabc/", fake);
    expect(r.kind === "video" && r.link.canonicalKey).toBe("tiktok:123456789");
  });
  it("reports unavailable when there is no redirect", async () => {
    const fake = (async () => new Response("not found", { status: 404 })) as unknown as typeof fetch;
    const r = await resolveShortLink("https://vm.tiktok.com/dead/", fake);
    expect(r).toEqual({ kind: "error", code: "unavailable" });
  });
});
