import { describe, expect, it } from "vitest";
import app from "../../worker/index";
import { fakeD1, fakeCtx, readyRow } from "./P1__fakeD1";

/**
 * Request bodies are parsed as JSON and then used as strings without a typeof check
 * (index.ts:102 `input.slice`, :283 `name.trim`, :350 `value.slice`). A number / object /
 * array in those fields throws a TypeError, which app.onError turns into a 500 and an
 * error_log row. Expected: a 400 with the usual validation code (no_link / bad_request).
 */
const env = { DB: fakeD1([readyRow()]), MOCK_AI: "1", DAILY_LIMIT: "10" } as unknown as Parameters<typeof app.request>[2];
const post = (path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, env, fakeCtx());

describe("P1: non-string JSON fields must be rejected with 400, not crash to 500", () => {
  it("POST /api/checks with a numeric input", async () => {
    const res = await post("/api/checks", { input: 123 });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("no_link");
  });
  it("POST /api/checks with an array input", async () => {
    const res = await post("/api/checks", { input: ["https://www.tiktok.com/@x/video/1"] });
    expect(res.status).toBe(400);
  });
  it("POST /api/checks/:id/place-card with a numeric name", async () => {
    const res = await post("/api/checks/abc123def456/place-card", { name: 42 });
    expect(res.status).toBe(400);
  });
  it("POST /api/checks/:id/feedback with a numeric value", async () => {
    const res = await post("/api/checks/abc123def456/feedback", { kind: "wrong_result", value: 42 });
    expect(res.status).toBe(200);
  });
});
