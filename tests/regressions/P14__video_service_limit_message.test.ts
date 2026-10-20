// Seen live on 20 Oct: Supadata's plan limit ("Limit Exceeded", HTTP 429) told people their reel was
// "private or deleted". The limit is ours, not their link's: say so, and keep "unavailable" for real 4xx.
import { describe, expect, it } from "vitest";
import { startFailure } from "../../worker/index";
import { SupadataError } from "../../worker/lib/supadata";

describe("when the video service won't start reading a reel", () => {
  it("its plan limit is 'busy', not 'private or deleted'", () => {
    const f = startFailure(new SupadataError("Limit Exceeded", 429));
    expect(f).toMatchObject({ status: 503, code: "busy" });
    expect(f.message).toContain("paused");
    expect(f.message).not.toMatch(/private|deleted/);
    expect(startFailure(new SupadataError("Payment required", 402)).code).toBe("busy");
  });
  it("a post it really can't open is still 'unavailable'", () => {
    expect(startFailure(new SupadataError("Forbidden", 403))).toMatchObject({ status: 400, code: "unavailable" });
  });
  it("a bad key or anything else is a server error", () => {
    expect(startFailure(new SupadataError("Unauthorized", 401)).code).toBe("server_error");
    expect(startFailure(new Error("socket hang up")).code).toBe("server_error");
  });
});
