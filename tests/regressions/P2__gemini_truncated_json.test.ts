import { beforeEach, describe, expect, it } from "vitest";
import { _resetModelPauses, pingGemini } from "../../worker/lib/gemini";

/**
 * Hypothesis: generateJsonFrom treats a 200 answer whose text is not valid JSON (e.g. cut off with
 * finishReason MAX_TOKENS) as fatal: JSON.parse throws out of the model loop, so neither the next
 * model nor the Workers AI backup is tried, and the raw SyntaxError is what the caller sees.
 */
describe("Gemini model fallback on a truncated answer", () => {
  beforeEach(() => _resetModelPauses());

  it("tries the next model when the first one returns cut-off JSON", async () => {
    const tried: string[] = [];
    const fetcher = (async (url: string) => {
      tried.push(url);
      const truncated = url.includes("cutoff");
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: truncated ? '{"ok": tr' : '{"ok":true}' }] }, finishReason: truncated ? "MAX_TOKENS" : "STOP" }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const res = await pingGemini({ apiKey: "***", models: ["cutoff-model", "good-model"], baseUrl: "https://g" }, fetcher);
    expect(tried).toHaveLength(2);
    expect(res).toMatchObject({ ok: true, answeredBy: "good-model" });
  });
});
