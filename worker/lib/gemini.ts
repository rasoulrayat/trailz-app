import type { MonthRating, PlaceRef, RealityCard } from "../../shared/types";
import type { VideoRecord } from "./extract-schema";

export interface GeminiConfig {
  apiKey: string;
  /** Models to try in order. The next one is used when Google says a model doesn't exist (404). */
  models: string[];
  /** Google's API, or a Cloudflare AI Gateway URL in front of it. */
  baseUrl: string;
  /**
   * Backup when no Gemini model answers (Google overloaded): Cloudflare Workers AI.
   * Gets the prompt and a standard JSON schema, returns the parsed JSON.
   */
  fallback?: { name: string; run(prompt: string, jsonSchema: object): Promise<unknown> };
  /** Set to the model that answered the last request (so backup answers can be refreshed later). */
  answeredBy?: string;
  /** Give up on one Gemini call after this long (default 30 s). */
  timeoutMs?: number;
}

/** Gemini's schema uses upper-case types ("OBJECT"); standard JSON Schema uses lower-case. */
export function toJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toJsonSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    out[k] = k === "type" && typeof v === "string" ? v.toLowerCase() : toJsonSchema(v);
  }
  return out;
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
    signal: AbortSignal.timeout(cfg.timeoutMs ?? 30_000),
  });
}

/**
 * Models that just said "busy" (or don't exist) are skipped for a while, so a request doesn't
 * spend a minute asking four overloaded models before trying the backup. Per Worker instance.
 */
const unavailableUntil = new Map<string, number>();
const BUSY_PAUSE_MS = 3 * 60_000;
const GONE_PAUSE_MS = 60 * 60_000;
export const _resetModelPauses = () => unavailableUntil.clear();

/** Statuses where another model may well answer: overloaded, rate-limited, or a passing server error. */
const BUSY = new Set([429, 500, 502, 503, 504]);

async function generateJson<T>(cfg: GeminiConfig, prompt: string, schema: object, fetcher: typeof fetch): Promise<T> {
  const { data, model } = await generateJsonFrom<T>(cfg, prompt, schema, fetcher);
  cfg.answeredBy = model;
  return data;
}

async function generateJsonFrom<T>(
  cfg: GeminiConfig,
  prompt: string,
  schema: object,
  fetcher: typeof fetch,
): Promise<{ data: T; model: string }> {
  const skipped: string[] = [];
  for (const model of cfg.models) {
    const pausedUntil = unavailableUntil.get(model) ?? 0;
    if (pausedUntil > Date.now()) {
      skipped.push(`${model}: skipped (busy or unavailable a moment ago)`);
      continue;
    }
    let res: Response;
    try {
      res = await callModel(cfg, model, prompt, schema, fetcher);
    } catch (err) {
      // Timeout or network error: treat like "busy".
      unavailableUntil.set(model, Date.now() + BUSY_PAUSE_MS);
      skipped.push(`${model}: ${String(err instanceof Error ? err.name : err).slice(0, 60)}`);
      continue;
    }
    // 404: retired model, or one this key may not use. Busy: Google is overloaded right now.
    // Either way the next model in the list may answer.
    if (res.status === 404 || BUSY.has(res.status)) {
      unavailableUntil.set(model, Date.now() + (res.status === 404 ? GONE_PAUSE_MS : BUSY_PAUSE_MS));
      skipped.push(`${model}: ${res.status} ${(await res.text()).replace(/\s+/g, " ").slice(0, 160)}`);
      continue;
    }
    // Anything else (bad key, bad request) won't be fixed by another model.
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
    return { data: JSON.parse(text) as T, model };
  }
  if (cfg.fallback) {
    try {
      const data = (await cfg.fallback.run(prompt, toJsonSchema(schema) as object)) as T;
      return { data, model: cfg.fallback.name };
    } catch (err) {
      skipped.push(`${cfg.fallback.name}: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`);
    }
  }
  throw new Error(`No AI model answered. ${skipped.join(" | ") || "GEMINI_MODEL is empty"}`);
}

/** Small live test used by /api/health?ai=1: which model answers with this key. */
export async function pingGemini(cfg: GeminiConfig, fetcher: typeof fetch = fetch) {
  try {
    const { model } = await generateJsonFrom<{ ok?: boolean }>(
      cfg,
      'Answer with {"ok": true}.',
      { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] },
      fetcher,
    );
    return { ok: true as const, answeredBy: model };
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
    base: {
      type: "OBJECT",
      description:
        "The city or town a visitor would base themselves in to experience this place. If the place is a city, that city. If it is an airport, station, hotel, beach, viewpoint or landmark, the city it belongs to or serves.",
      properties: {
        city: S,
        country: S,
        fromPlace: { type: "STRING", description: "How the place relates to the city, e.g. 'The airport is 25 min by train from the centre'." },
        vibe: { type: "STRING", description: "One honest line on what the city is really like." },
        do: {
          type: "ARRAY",
          description: "3 or 4 things to do the authentic, local way (neighbourhoods, markets, times of day), not the tourist way.",
          items: { type: "OBJECT", properties: { title: S, detail: S }, required: ["title", "detail"] },
        },
        eat: { type: "ARRAY", description: "2 or 3 local dishes or the kind of place locals eat at.", items: S },
        skip: { type: "ARRAY", description: "1 or 2 overrated tourist traps to skip.", items: S },
        localTip: { type: "STRING", description: "One practical tip only locals would tell you (transport, timing, etiquette, money)." },
      },
      required: ["city", "fromPlace", "vibe", "do", "eat", "skip", "localTip"],
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
  required: ["country", "authenticity", "summary", "comparisons", "months", "cost", "base", "gems"],
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
  base?: {
    city?: string;
    country?: string;
    fromPlace?: string;
    vibe?: string;
    do?: { title?: string; detail?: string }[];
    eat?: string[];
    skip?: string[];
    localTip?: string;
  };
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

const strList = (xs: unknown, max: number) =>
  (Array.isArray(xs) ? xs : []).filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, max);

function cleanBase(b: RawCard["base"]): RealityCard["base"] {
  if (!b?.city?.trim()) return undefined;
  const todo = (b.do ?? []).filter((d) => d.title && d.detail).slice(0, 4).map((d) => ({ title: d.title!, detail: d.detail! }));
  if (!todo.length) return undefined;
  return {
    city: b.city.trim(),
    country: b.country?.trim() || undefined,
    fromPlace: b.fromPlace ?? "",
    vibe: b.vibe ?? "",
    do: todo,
    eat: strList(b.eat, 3),
    skip: strList(b.skip, 2),
    localTip: b.localTip ?? "",
  };
}

export async function generateRealityCard(
  cfg: GeminiConfig,
  place: PlaceRef,
  record: VideoRecord | null,
  origin: string,
  verified: boolean,
  fetcher: typeof fetch = fetch,
  /** "reel": the reel shows this place. "lookalike": we suggested it because it has the reel's vibe. */
  relation: "reel" | "lookalike" = "reel",
): Promise<RealityCard> {
  const where = [place.name, place.region, place.country].filter((x, i, a) => x && a.indexOf(x) === i).join(", ");
  const common = `Place: ${where}
Traveler departs from: ${origin}`;
  const rules = `Write honest, specific, practical facts. If you are unsure about a fact, leave it out.
"months": 12 ratings for January to December, based on this place's real weather, seasons and crowds.
"gems": 2 or 3 real, less crowded places near ${place.name} with a similar appeal.
"base": the city to base yourself in for ${place.name} (if ${place.name} is an airport, station, hotel, beach or landmark: the city it belongs to or serves), and how to enjoy that city like a local rather than a tourist: real neighbourhoods, markets, the right time of day, what locals eat, what to skip.
Costs are typical estimates in euros for one person for a trip of 3-5 days, including return travel from ${origin} (flights or trains, never 0); keep them realistic and round them.`;
  const prompt =
    relation === "lookalike"
      ? `You write the "Reality Card" for TrailZ, an app that helps young travelers see what places are really like compared with how social media shows them.

${common}

A traveler saved a reel filmed somewhere else and we suggested ${place.name} because it has the same look and feel.
The reel's vibe: ${record?.vibe_tags?.join(", ") || "not known"}. What the reel showed: ${record?.what_we_saw ?? "not known"}

Do NOT judge ${place.name} by that reel: it wasn't filmed there. "comparisons" pair how ${place.name} is usually shown on social media ("reel") with what visitors really find ("reality"): crowds, seasons, filters, access, cost. "authenticity" (0-10) says how well ${place.name} lives up to its own online image.
${rules}`
      : `You write the "Reality Card" for TrailZ, an app that helps young travelers see what a place from a social media reel is really like.

${common}

The reel:
${reelContext(record)}

Compare the reel's promises with what visitors really find (crowds, seasons, filters, private vs public access, cost).
${rules}`;

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
    base: cleanBase(raw.base),
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
