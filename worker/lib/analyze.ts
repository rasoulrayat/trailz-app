import type { CheckResult, PlaceRef, RealityCard } from "../../shared/types";
import { DEFAULT_ORIGIN, isMock, type Env } from "../env";
import type { VideoRecord } from "./extract-schema";
import { generateRealityCard, suggestVibePlaces, type GeminiConfig } from "./gemini";
import { geocode, sleep } from "./geocode";
import { MOCK_VIBE_SUGGESTIONS, mockCard } from "./mock";
import { decide, regionAdvice } from "./route";

export function geminiConfig(env: Env): GeminiConfig {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  const models = (env.GEMINI_MODEL || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return { apiKey: env.GEMINI_API_KEY, models, baseUrl: env.GEMINI_BASE_URL };
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

export async function cardFor(env: Env, place: PlaceRef, record: VideoRecord | null): Promise<RealityCard> {
  if (isMock(env)) return mockCard(place, DEFAULT_ORIGIN);
  const checked = place.verified === undefined ? await verifyPlace(env, place) : place;
  return generateRealityCard(geminiConfig(env), checked, record, DEFAULT_ORIGIN, !!checked.verified);
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
        return { outcome: "vibe", vibe: record.vibe_tags ?? [], whatWeSaw: record.what_we_saw, suggestions: MOCK_VIBE_SUGGESTIONS };
      }
      const ideas = await suggestVibePlaces(geminiConfig(env), record, DEFAULT_ORIGIN);
      const real: typeof ideas = [];
      for (const idea of ideas) {
        if (real.length === 3) break;
        const hit = await geocode(env.DB, env.GEOCODER_CONTACT, `${idea.name}, ${idea.country}`);
        if (hit) real.push(idea);
        await sleep(1100);
      }
      return { outcome: "vibe", vibe: record.vibe_tags ?? [], whatWeSaw: record.what_we_saw, suggestions: real };
    }

    case "single": {
      const place = await verifyPlace(env, decision.place);
      // A place the map can't confirm is shown as a choice instead of a confident card.
      if (!place.verified) {
        return { outcome: "pick", candidates: [place], whatWeSaw: record.what_we_saw };
      }
      return { outcome: "single", card: await cardFor(env, place, record) };
    }
  }
}
