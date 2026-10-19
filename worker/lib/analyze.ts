import type { CheckResult, PlaceRef, RealityCard } from "../../shared/types";
import { DEFAULT_ORIGIN, isMock, type Env } from "../env";
import type { VideoRecord } from "./extract-schema";
import { generateRealityCard, generateReelVerdict, suggestVibePlaces, type GeminiConfig } from "./gemini";
import { getProfile, profileKey, PROFILE_TTL, saveProfile, toProfile, withVerdict } from "./profiles";
import { geocode, sleep } from "./geocode";
import { MOCK_VIBE_SUGGESTIONS, mockCard } from "./mock";
import { decide, regionAdvice } from "./route";

export function geminiConfig(env: Env): GeminiConfig {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  const models = (env.GEMINI_MODEL || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return { apiKey: env.GEMINI_API_KEY, models, baseUrl: env.GEMINI_BASE_URL, fallback: workersAiFallback(env) };
}

/** Accept an already-parsed object, or find the JSON object inside a text answer. */
export function readJson(r: unknown): object {
  if (r && typeof r === "object") return r as object;
  if (typeof r !== "string" || !r.trim()) throw new Error("empty answer");
  const start = r.indexOf("{");
  const end = r.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`no JSON in answer: ${r.slice(0, 80)}`);
  return JSON.parse(r.slice(start, end + 1)) as object;
}

/** Cloudflare Workers AI as a backup model, used only when every Gemini model is busy or gone. */
function workersAiFallback(env: Env): GeminiConfig["fallback"] {
  const ai = env.AI;
  const model = env.FALLBACK_MODEL?.trim();
  if (!ai || !model) return undefined;
  return {
    name: model,
    async run(prompt, jsonSchema) {
      const messages = [
        { role: "system", content: "You are a careful travel expert. Reply only with JSON that matches the schema." },
        { role: "user", content: prompt },
      ];
      let first: unknown;
      try {
        const out = (await ai.run(model, {
          messages,
          response_format: { type: "json_schema", json_schema: jsonSchema },
          max_tokens: 2048,
          temperature: 0.4,
        })) as { response?: unknown };
        return readJson(out?.response);
      } catch (err) {
        first = err;
      }
      // Strict JSON mode can refuse long schemas ("JSON Mode couldn't be met"): ask again with the
      // schema written into the prompt, and pull the JSON out of the answer.
      try {
        const out = (await ai.run(model, {
          messages: [
            messages[0],
            { role: "user", content: `${prompt}\n\nReply with only a JSON object matching this JSON Schema:\n${JSON.stringify(jsonSchema)}` },
          ],
          max_tokens: 2048,
          temperature: 0.4,
        })) as { response?: unknown };
        return readJson(out?.response);
      } catch (err) {
        throw new Error(`JSON mode: ${String(first instanceof Error ? first.message : first).slice(0, 150)}; plain: ${String(err instanceof Error ? err.message : err).slice(0, 150)}`);
      }
    },
  };
}

/**
 * Confirm a place exists on the map. Unconfirmed places are kept but marked,
 * and lose confidence, which protects users from invented places.
 */
async function verifyPlace(env: Env, place: PlaceRef): Promise<PlaceRef> {
  if (isMock(env)) return { ...place, verified: true };
  const query = [place.name, place.region, place.country].filter(Boolean).join(", ");
  let hit = await geocode(env.DB, env.GEOCODER_CONTACT, query);
  if (!hit && (place.region || place.country)) {
    await sleep(1100); // Nominatim allows 1 request per second
    hit = await geocode(env.DB, env.GEOCODER_CONTACT, `${place.name}, ${place.country ?? place.region}`);
  }
  if (!hit) return { ...place, verified: false, confidence: place.confidence * 0.6 };
  return { ...place, lat: hit.lat, lng: hit.lng, country: place.country ?? hit.country, verified: true };
}

export async function cardFor(
  env: Env,
  place: PlaceRef,
  record: VideoRecord | null,
  relation: "reel" | "lookalike" = "reel",
  /** Only Gemini, no backup model: used to upgrade a card the backup wrote. */
  geminiOnly = false,
): Promise<{ card: RealityCard; backup: boolean }> {
  if (isMock(env)) return { card: mockCard(place, DEFAULT_ORIGIN), backup: false };
  const checked = place.verified === undefined ? await verifyPlace(env, place) : place;
  const cfg = geminiConfig(env);
  if (geminiOnly) cfg.fallback = undefined;
  const answeredByBackup = () => !!cfg.fallback && cfg.answeredBy === cfg.fallback.name;

  // The place's own facts are shared by every reel: reuse them and only judge this reel (a short, fast call).
  const key = profileKey(checked);
  const stored = await getProfile(env.DB, key);
  if (stored && !stored.backup && stored.age < PROFILE_TTL) {
    const verdict = await generateReelVerdict(cfg, checked, record, stored.profile, fetch, relation);
    return { card: withVerdict(stored.profile, verdict, checked), backup: answeredByBackup() };
  }

  // First reel for this place (or a stale/backup profile): write the whole card, keep its place part for everyone.
  const card = await generateRealityCard(cfg, checked, record, DEFAULT_ORIGIN, !!checked.verified, fetch, relation);
  const backup = answeredByBackup();
  await saveProfile(env.DB, key, toProfile(card), backup).catch(() => {});
  return { card, backup };
}

/** Turn a video text record into the result screen the user sees. */
export async function analyze(env: Env, record: VideoRecord): Promise<CheckResult> {
  const decision = decide(record);

  switch (decision.outcome) {
    case "not_travel":
      return { outcome: "not_travel", whatWeSaw: record.what_we_saw, kind: decision.kind };

    case "pick":
      return { outcome: "pick", candidates: decision.candidates, whatWeSaw: record.what_we_saw };

    case "multi":
      // Each place's Reality Card is generated only when the user taps it.
      return {
        outcome: "multi",
        places: decision.places,
        regions: decision.regions,
        skippedClips: record.skipped_clips ?? 0,
        advice: regionAdvice(decision.regions, decision.places.length),
      };

    case "vibe": {
      if (isMock(env)) {
        return {
          outcome: "vibe",
          vibe: record.vibe_tags ?? [],
          whatWeSaw: record.what_we_saw,
          filmedIn: record.filmed_in || undefined,
          suggestions: MOCK_VIBE_SUGGESTIONS,
        };
      }
      const ideas = await suggestVibePlaces(geminiConfig(env), record, DEFAULT_ORIGIN);
      const real: (typeof ideas[number] & { lat: number; lng: number })[] = [];
      for (const idea of ideas) {
        if (real.length === 3) break;
        const hit = await geocode(env.DB, env.GEOCODER_CONTACT, `${idea.name}, ${idea.country}`);
        if (hit) real.push({ ...idea, lat: hit.lat, lng: hit.lng });
        await sleep(1100);
      }
      return {
        outcome: "vibe",
        vibe: record.vibe_tags ?? [],
        whatWeSaw: record.what_we_saw,
        filmedIn: record.filmed_in || undefined,
        suggestions: real,
      };
    }

    case "single": {
      const place = await verifyPlace(env, decision.place);
      // A place the map can't confirm is shown as a choice instead of a confident card.
      if (!place.verified) {
        return { outcome: "pick", candidates: [place], whatWeSaw: record.what_we_saw };
      }
      return { outcome: "single", card: (await cardFor(env, place, record)).card };
    }
  }
}
