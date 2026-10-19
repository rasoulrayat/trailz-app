import type { CheckResult, PlaceCardResponse, PlaceRef, RealityCard } from "../../shared/types";
import type { Env } from "../env";
import { cardFor, profileFor, verdictFor } from "./analyze";
import type { VideoRecord } from "./extract-schema";
import { placeKey } from "./route";
import { getVideo, logError, type VideoRow } from "./store";

type Ctx = { waitUntil(p: Promise<unknown>): void };

/**
 * The Reality Card for one place of a checked reel: served from `place_cards` when it exists,
 * written (and stored) otherwise. Used by the place-card route and by the prebuilder.
 *
 * `partial` (the route): the place facts are returned as soon as they exist (stored profile → instantly), and the
 * verdict on the reel is finished in the background; the client polls until the full card is stored.
 * Without `partial` (prebuild, cron): the full card is written before returning.
 */
export async function placeCardFor(env: Env, v: VideoRow, name: string, typed: boolean, ctx?: Ctx, partial = false): Promise<PlaceCardResponse> {
  const key = placeKey(name);
  const cached = await env.DB.prepare("SELECT card_json, created_at FROM place_cards WHERE video_id = ? AND place_key = ?")
    .bind(v.id, key)
    .first<{ card_json: string; created_at: number }>();

  const result = v.result_json ? (JSON.parse(v.result_json) as CheckResult) : null;
  const known: PlaceRef | undefined =
    result?.outcome === "multi"
      ? result.places.find((p) => placeKey(p.name) === key)
      : result?.outcome === "pick"
        ? result.candidates.find((p) => placeKey(p.name) === key)
        : undefined;
  // A "places with this vibe" suggestion: the reel wasn't filmed there, so the card mustn't judge it by the reel.
  const lookalike =
    !typed && result?.outcome === "vibe"
      ? result.suggestions.find((s) => placeKey(`${s.name}, ${s.country}`) === key || placeKey(s.name) === key)
      : undefined;
  const place: PlaceRef = known ?? (lookalike ? { name: lookalike.name, country: lookalike.country, confidence: 0.8 } : { name, confidence: 0.6 });
  const record = v.extract_json ? (JSON.parse(v.extract_json) as VideoRecord) : null;
  const relation = lookalike ? "lookalike" : "reel";
  const save = (card: RealityCard, backup: boolean) =>
    env.DB.prepare("INSERT OR REPLACE INTO place_cards (video_id, place_key, card_json, created_at) VALUES (?, ?, ?, ?)")
      .bind(v.id, key, JSON.stringify(backup ? { ...card, _backup: true } : card), Date.now())
      .run();

  if (cached) {
    const { _backup, ...card } = JSON.parse(cached.card_json) as RealityCard & { _backup?: boolean };
    // Written by the backup model: show it now, and try for Gemini's better card in the background.
    if (_backup && ctx && Date.now() - cached.created_at > 10 * 60_000) {
      ctx.waitUntil(
        cardFor(env, { ...place, verified: undefined }, record, relation, true)
          .then((r) => save(r.card, false))
          .catch(() => {}),
      );
    }
    return { card, pending: false };
  }

  if (partial && ctx) {
    // Facts first (instant when the place is known), the reel verdict in the background.
    const p = await profileFor(env, { ...place, verified: undefined });
    if (await claim(env, v.id, `verdict:${key}`)) {
      ctx.waitUntil(
        verdictFor(env, p, record, relation)
          .then((r) => save(r.card, r.backup))
          .catch((err) => logError(env.DB, "place-verdict", err, `${v.id} ${name}`)),
      );
    }
    return { profile: p.profile, pending: true };
  }

  const { card, backup } = await cardFor(env, { ...place, verified: undefined }, record, relation);
  await save(card, backup);
  return { card, pending: false };
}

/** The places of a reel whose cards are worth having ready before anyone taps them. */
export function placesToPrebuild(v: VideoRow): string[] {
  if (v.status !== "ready" || !v.result_json) return [];
  const result = JSON.parse(v.result_json) as CheckResult;
  switch (result.outcome) {
    case "multi":
      return result.places.map((p) => p.name);
    case "pick":
      return result.candidates.slice(0, 3).map((p) => p.name);
    case "vibe":
      return result.suggestions.map((s) => `${s.name}, ${s.country}`);
    default:
      return [];
  }
}

const LOCK_MS = 3 * 60_000;

/** One build per place at a time, across isolates: a short-lived row in kv_cache. */
async function claim(env: Env, videoId: string, key: string): Promise<boolean> {
  const lock = `prebuild:${videoId}:${key}`;
  // (also used for in-flight verdicts: key "verdict:<place>")
  await env.DB.prepare("DELETE FROM kv_cache WHERE key = ? AND expires_at < ?").bind(lock, Date.now()).run();
  const res = await env.DB.prepare("INSERT OR IGNORE INTO kv_cache (key, json, expires_at) VALUES (?, '1', ?)").bind(lock, Date.now() + LOCK_MS).run();
  return (res.meta.changes ?? 0) === 1;
}

/**
 * Write up to `maxCards` missing Reality Cards for a reel's places, so a tap on a place opens instantly.
 * Returns how many were built. Safe to call often: cards that exist or are being built are skipped.
 */
export async function prebuildCards(env: Env, videoId: string, maxCards = 1): Promise<number> {
  const v = await getVideo(env.DB, videoId);
  if (!v) return 0;
  const names = placesToPrebuild(v);
  if (!names.length) return 0;
  const have = new Set(
    (await env.DB.prepare("SELECT place_key FROM place_cards WHERE video_id = ?").bind(v.id).all<{ place_key: string }>()).results.map((r) => r.place_key),
  );
  let built = 0;
  for (const name of names) {
    if (built >= maxCards) break;
    const key = placeKey(name);
    if (!key || have.has(key)) continue;
    if (!(await claim(env, v.id, key))) continue;
    try {
      await placeCardFor(env, v, name, false);
      built++;
    } catch (err) {
      await logError(env.DB, "prebuild", err, `${v.id} ${name}`);
    }
  }
  return built;
}

/** Cron: keep recent reels' cards filled in, a few at a time. */
export async function prebuildRecent(env: Env, maxCards = 3): Promise<number> {
  const since = Date.now() - 72 * 3600_000;
  const rows = await env.DB.prepare("SELECT id FROM videos WHERE status = 'ready' AND outcome IN ('multi','pick','vibe') AND updated_at > ? ORDER BY updated_at DESC LIMIT 30")
    .bind(since)
    .all<{ id: string }>();
  let built = 0;
  for (const r of rows.results) {
    if (built >= maxCards) break;
    built += await prebuildCards(env, r.id, maxCards - built);
  }
  return built;
}
