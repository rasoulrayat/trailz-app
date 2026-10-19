import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../worker/env";
import { fillVideoMeta } from "../../worker/lib/media";

/**
 * Hypothesis: fillVideoMeta fetches title/author/cover from Supadata, then calls storeImage for the
 * cover. When the cover download is not a usable image (getMetadata falls back to media.url, which
 * can be the video file; or the file is > 1.5 MB), storeImage throws BEFORE the UPDATE that writes
 * title and author, so the metadata that was just paid for is thrown away and the video keeps
 * title = NULL / author = NULL for good (thumbnail_url stays '' = "tried, give up").
 */
function fakeDb() {
  const executed: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => (sql.startsWith("SELECT url") ? { url: "https://www.instagram.com/reel/abc/", title: null, author: null } : null),
        run: async () => {
          executed.push({ sql, args });
          return { meta: { changes: 1 } };
        },
        all: async () => ({ results: [] }),
      }),
    }),
  } as unknown as D1Database;
  return { db, executed };
}

describe("fillVideoMeta when the cover cannot be stored", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("still saves the title and creator that Supadata returned", async () => {
    const { db, executed } = fakeDb();
    vi.stubGlobal(
      "fetch",
      async (url: string) => {
        if (url.includes("/metadata")) {
          return new Response(
            JSON.stringify({ title: "Monsoon trip", author: { username: "wanderer" }, media: { url: "https://cdn.example/x.mp4" } }),
            { status: 200 },
          );
        }
        // The "cover" is the video file itself: not an image.
        return new Response(new Uint8Array(16), { status: 200, headers: { "content-type": "video/mp4" } });
      },
    );
    const env = { DB: db, MOCK_AI: "0", SUPADATA_API_KEY: "***", GEMINI_MODEL: "", GEMINI_BASE_URL: "", GEOCODER_CONTACT: "", DAILY_LIMIT: "" } as unknown as Env;

    await fillVideoMeta(env, "vid1").catch(() => {});

    const titleWrite = executed.find((e) => e.sql.includes("title = COALESCE") && e.args.includes("Monsoon trip"));
    expect(titleWrite, "an UPDATE writing title 'Monsoon trip' and author '@wanderer'").toBeTruthy();
  }, 15_000);
});
