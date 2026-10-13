import { beforeEach, describe, expect, it } from "vitest";
import { _resetModelPauses, pingGemini } from "../worker/lib/gemini";

const ok = () =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 });

describe("Gemini model fallback", () => {
  beforeEach(() => _resetModelPauses());
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

  it("uses the Workers AI backup when every Gemini model is busy", async () => {
    const fetcher = (async () => new Response("high demand", { status: 503 })) as unknown as typeof fetch;
    let schemaSeen: unknown;
    const res = await pingGemini(
      {
        apiKey: "k",
        models: ["a", "b"],
        baseUrl: "https://g",
        fallback: {
          name: "backup",
          run: async (_p, schema) => {
            schemaSeen = schema;
            return { ok: true };
          },
        },
      },
      fetcher,
    );
    expect(res).toMatchObject({ ok: true, answeredBy: "backup" });
    expect(schemaSeen).toMatchObject({ type: "object", properties: { ok: { type: "boolean" } } });
  });

  it("skips a model that was busy a moment ago", async () => {
    const tried: string[] = [];
    const busy = (async (url: string) => {
      tried.push(url);
      return new Response("high demand", { status: 503 });
    }) as unknown as typeof fetch;
    await pingGemini({ apiKey: "k", models: ["m1"], baseUrl: "https://g" }, busy);
    await pingGemini({ apiKey: "k", models: ["m1"], baseUrl: "https://g" }, busy);
    expect(tried).toHaveLength(1);
  });
});
