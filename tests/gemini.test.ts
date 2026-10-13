import { describe, expect, it } from "vitest";
import { pingGemini } from "../worker/lib/gemini";

const ok = () =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 });

describe("Gemini model fallback", () => {
  it("skips a model that returns 404 and uses the next one", async () => {
    const tried: string[] = [];
    const fetcher = (async (url: string) => {
      tried.push(url);
      return url.includes("old-model") ? new Response("no longer available", { status: 404 }) : ok();
    }) as unknown as typeof fetch;
    const res = await pingGemini({ apiKey: "k", models: ["old-model", "new-model"], baseUrl: "https://g" }, fetcher);
    expect(res.ok).toBe(true);
    expect(tried).toHaveLength(2);
  });

  it("moves on when a model is overloaded (503)", async () => {
    const fetcher = (async (url: string) =>
      url.includes("busy") ? new Response("high demand", { status: 503 }) : ok()) as unknown as typeof fetch;
    const res = await pingGemini({ apiKey: "k", models: ["busy-model", "calm-model"], baseUrl: "https://g" }, fetcher);
    expect(res.ok).toBe(true);
  });

  it("reports every model when none is available", async () => {
    const fetcher = (async () => new Response("gone", { status: 404 })) as unknown as typeof fetch;
    const res = await pingGemini({ apiKey: "k", models: ["a", "b"], baseUrl: "https://g" }, fetcher);
    expect(res).toMatchObject({ ok: false });
    expect(!res.ok && res.error).toContain("a: 404 gone");
  });

  it("stops on other errors such as a bad key", async () => {
    let calls = 0;
    const fetcher = (async () => {
      calls++;
      return new Response("API key not valid", { status: 400 });
    }) as unknown as typeof fetch;
    const res = await pingGemini({ apiKey: "k", models: ["a", "b"], baseUrl: "https://g" }, fetcher);
    expect(res.ok).toBe(false);
    expect(calls).toBe(1);
  });
});
