import type { MonthRating, PlaceRef, RealityCard } from "../../shared/types";
import type { VideoRecord } from "./extract-schema";

export interface GeminiConfig {
  apiKey: string;
  /** Models to try in order. The next one is used when Google says a model doesn't exist (404). */
  models: string[];
  /** Google's API, or a Cloudflare AI Gateway URL in front of it. */
  baseUrl: string;
}

async function callModel(
  cfg: GeminiConfig,
  model: string,
  prompt: string,
  schema: object,
  fetcher: typeof fetch,
): Promise<Response> {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  return fetcher(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.4 },
    }),
  });
}

async function generateJson<T>(cfg: GeminiConfig, prompt: string, schema: object, fetcher: typeof fetch): Promise<T> {
  if (!cfg.models.length) throw new Error("GEMINI_MODEL is empty");
  const notFound: string[] = [];
  for (const model of cfg.models) {
    const res = await callModel(cfg, model, prompt, schema, fetcher);
    if (res.status === 404) {
      // Retired model, or one this API key may not use: try the next one.
      notFound.push(`${model}: ${(await res.text()).slice(0, 160)}`);
      continue;
    }
    if (!res.ok) throw new Error(`Gemini ${model} error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) {
      const why = body.promptFeedback?.blockReason ?? body.candidates?.[0]?.finishReason ?? "empty answer";
      throw new Error(`Gemini ${model} returned no text (${why})`);
    }
    return JSON.parse(text) as T;
  }
  throw new Error(`No Gemini model available. ${notFound.join(" | ")}`);
}

/** Small live test used by /api/health?ai=1: which model answers with this key. */
export async function pingGemini(cfg: GeminiConfig, fetcher: typeof fetch = fetch) {
  try {
    await generateJson<{ ok?: boolean }>(
      cfg,
      'Answer with {"ok": true}.',
      { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] },
      fetcher,
    );
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: String(err instanceof Error ? err.message : err).slice(0, 600) };
  }
}

// Gemini's response schema uses OpenAPI-style upper-case types.
const S = { type: "STRING" } as const;
const N = { type: "NUMBER" } as const;
const CARD_SCHEMA = {
  type: "OBJECT",
  properties: {
    region: S,
    country: S,
    authenticity: { type: "NUMBER", description: "0-10. 10 = visitors find exactly what the reel shows." },
    summary: { type: "STRING", description: "One honest sentence about what the place is really like." },
    comparisons: {
      type: "ARRAY",
      description: "2 to 4 pairs: what the reel shows or claims, and what visitors really find.",
      items: { type: "OBJECT", properties: { reel: S, reality: S }, required: ["reel", "reality"] },
    },
    months: {
      type: "ARRAY",
      description: "Exactly 12 ratings, January to December.",
      items: { type: "STRING", enum: ["best", "good", "crowded", "quiet"] },
    },
    cost: {
      type: "OBJECT",
      description: "Typical budget for one person, in euros, including return travel from the origin city.",
      properties: { days: N, low: N, high: N, flights: N, stay: N, food: N },
      required: ["days", "low", "high", "flights", "stay", "food"],
    },
    gems: {
      type: "ARRAY",
      description: "2 or 3 nearby real places with the same appeal but fewer crowds.",
      items: {
        type: "OBJECT",
        properties: { name: S, why: S, authenticity: N },
        required: ["name", "why", "authenticity"],
      },
    },
  },
  required: ["country", "authenticity", "summary", "comparisons", "months", "cost", "gems"],
};

interface RawCard {
  region?: string;
  country?: string;
  authenticity?: number;
  summary?: string;
  comparisons?: { reel?: string; reality?: string }[];
  months?: string[];
  cost?: Partial<Record<"days" | "low" | "high" | "flights" | "stay" | "food", number>>;
  gems?: { name?: string; why?: string; authenticity?: number }[];
}

function reelContext(record: VideoRecord | null): string {
  if (!record) return "No video details available.";
  const lines = [
    `What the video shows: ${record.what_we_saw}`,
    record.claims?.length ? `What the video claims: ${record.claims.join("; ")}` : "",
    record.editing?.filter_suspected ? "A colour filter seems to be applied." : "",
    record.editing?.time_of_day ? `Filmed at: ${record.editing.time_of_day}` : "",
    record.on_screen_text?.length ? `On-screen text: ${record.on_screen_text.map((x) => x.text).join(" | ")}` : "",
    record.transcript?.length ? `Spoken: ${record.transcript.map((x) => x.text).join(" ").slice(0, 1200)}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

const clamp = (n: unknown, lo: number, hi: number, fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
const money = (n: unknown) => Math.round(clamp(n, 0, 100000, 0) / 10) * 10;

export async function generateRealityCard(
  cfg: GeminiConfig,
  place: PlaceRef,
  record: VideoRecord | null,
  origin: string,
  verified: boolean,
  fetcher: typeof fetch = fetch,
): Promise<RealityCard> {
  const where = [place.name, place.region, place.country].filter(Boolean).join(", ");
  const prompt = `You write the "Reality Card" for TrailZ, an app that helps young travelers see what a place from a social media reel is really like.

Place: ${where}
Traveler departs from: ${origin}

The reel:
${reelContext(record)}

Write honest, specific, practical facts. Compare the reel's promises with what visitors really find (crowds, seasons, filters, private vs public access, cost). If you are unsure about a fact, leave it out. Costs are typical estimates in euros for one person for a trip of 3-5 days including return travel; keep them realistic and round them.`;

  const raw = await generateJson<RawCard>(cfg, prompt, CARD_SCHEMA, fetcher);
  const months = (raw.months ?? []).slice(0, 12) as MonthRating[];
  while (months.length < 12) months.push("good");
  const low = money(raw.cost?.low);
  return {
    place: {
      name: place.name,
      region: raw.region || place.region,
      country: raw.country || place.country || "",
      lat: place.lat,
      lng: place.lng,
    },
    confidence: verified ? "high" : "medium",
    authenticity: Math.round(clamp(raw.authenticity, 0, 10, 5)),
    summary: raw.summary ?? "",
    comparisons: (raw.comparisons ?? [])
      .filter((c) => c.reel && c.reality)
      .slice(0, 4)
      .map((c) => ({ reel: c.reel!, reality: c.reality! })),
    months: months.map((m) => (["best", "good", "crowded", "quiet"].includes(m) ? m : "good")),
    cost: {
      currency: "EUR",
      from: origin,
      days: Math.round(clamp(raw.cost?.days, 1, 21, 4)),
      low,
      high: Math.max(low, money(raw.cost?.high)),
      flights: money(raw.cost?.flights),
      stay: money(raw.cost?.stay),
      food: money(raw.cost?.food),
    },
    gems: (raw.gems ?? [])
      .filter((g) => g.name && g.why)
      .slice(0, 3)
      .map((g) => ({ name: g.name!, why: g.why!, authenticity: Math.round(clamp(g.authenticity, 0, 10, 7)) })),
  };
}

const VIBE_SCHEMA = {
  type: "OBJECT",
  properties: {
    suggestions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: S, country: S, why: S, authenticity: N },
        required: ["name", "country", "why", "authenticity"],
      },
    },
  },
  required: ["suggestions"],
};

export async function suggestVibePlaces(
  cfg: GeminiConfig,
  record: VideoRecord,
  origin: string,
  fetcher: typeof fetch = fetch,
): Promise<{ name: string; country: string; why: string; authenticity: number }[]> {
  const prompt = `A traveler from ${origin} saved a travel reel but the exact place cannot be identified.
What the video shows: ${record.what_we_saw}
Vibe: ${(record.vibe_tags ?? []).join(", ")}

Suggest 4 real, specific places that look and feel like this, reachable for a short trip from ${origin}. Prefer places where reality matches the look (authenticity 0-10). "why" is one short line.`;
  const raw = await generateJson<{ suggestions?: { name?: string; country?: string; why?: string; authenticity?: number }[] }>(
    cfg,
    prompt,
    VIBE_SCHEMA,
    fetcher,
  );
  return (raw.suggestions ?? [])
    .filter((s) => s.name && s.country)
    .slice(0, 4)
    .map((s) => ({
      name: s.name!,
      country: s.country!,
      why: s.why ?? "",
      authenticity: Math.round(clamp(s.authenticity, 0, 10, 7)),
    }));
}
