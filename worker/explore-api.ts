import { Hono } from "hono";
import type { CheckResult, ExploreItem, ExploreResponse, MonthRating, SavedPlace } from "../shared/types";
import { buildVibe } from "../shared/vibe";
import type { Env } from "./env";
import { distanceKm, placeKey } from "./lib/route";

type AppEnv = { Bindings: Env; Variables: AuthVars };
import type { AuthVars } from "./auth-api";
import { readProfile, VIBE_WORDS } from "./lib/auth";
export const explore = new Hono<AppEnv>();

interface Row {
  id: string;
  outcome: string;
  result_json: string;
  extract_json: string | null;
  thumbnail_url: string | null;
  author: string | null;
  platform: "tiktok" | "instagram" | "youtube";
  url: string;
  title: string | null;
  updated_at: number;
  checks: number;
  checks7d: number;
  saves: number;
}

/**
 * The public feed: every reel anyone checked, from stored results only (no AI, no partner calls).
 * Query: month=1..12, budget=euros, vibe=1 (match my saved vibe), near=1 (near my saved places),
 *        sort=trending|new|real, q=text
 */
explore.get("/explore", async (c) => {
  const db = c.env.DB;
  const deviceId = c.get("deviceId");
  const weekAgo = Date.now() - 7 * 86400_000;
  const [rows, mySaves, profile] = await Promise.all([
    db
      .prepare(
        `SELECT v.id, v.outcome, v.result_json, v.extract_json, v.thumbnail_url, v.author, v.platform, v.url, v.title, v.updated_at,
                (SELECT COUNT(*) FROM checks k WHERE k.video_id = v.id) AS checks,
                (SELECT COUNT(*) FROM checks k WHERE k.video_id = v.id AND k.created_at > ?) AS checks7d,
                (SELECT COUNT(*) FROM saves s WHERE s.check_id = v.id) AS saves
         FROM videos v WHERE v.status = 'ready' AND v.outcome IN ('single','multi','vibe')
         ORDER BY v.updated_at DESC LIMIT 300`,
      )
      .bind(weekAgo)
      .all<Row>(),
    db.prepare("SELECT name, country, lat, lng, vibe_json FROM saves WHERE device_id = ?").bind(deviceId).all<{ name: string; country: string | null; lat: number | null; lng: number | null; vibe_json: string }>(),
    readProfile(db, deviceId),
  ]);

  const saves: Pick<SavedPlace, "name" | "country" | "lat" | "lng" | "vibe">[] = mySaves.results.map((s) => ({ ...s, vibe: JSON.parse(s.vibe_json) as string[] }));
  // Saved places say the most about taste; the onboarding picks fill in before anything is saved.
  // The person can mute single words or switch learning off on the Vibe page (profile.vibeOff / learnVibe).
  const learned = buildVibe(
    saves.map((s, i) => ({ ...s, id: String(i), createdAt: 0 })),
    profile,
  );
  const myVibeCount = new Map<string, number>();
  learned.tags.forEach((t) => myVibeCount.set(t.key, t.count));
  const muted = new Set(learned.muted);
  (profile?.vibes ?? []).forEach((id) => (VIBE_WORDS[id] ?? []).forEach((w) => !muted.has(w) && myVibeCount.set(w, (myVibeCount.get(w) ?? 0) + 0.5)));
  const myVibe = [...myVibeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([v]) => v);

  const month = Number(c.req.query("month") || 0);
  const budget = Number(c.req.query("budget") || 0);
  const wantVibe = c.req.query("vibe") === "1" && myVibe.length > 0;
  const wantNear = c.req.query("near") === "1" && saves.some((s) => s.lat != null);
  const sort = c.req.query("sort") ?? "trending";
  const q = placeKey(c.req.query("q") ?? "");

  const items: ExploreItem[] = [];
  for (const r of rows.results) {
    let result: CheckResult;
    try {
      result = JSON.parse(r.result_json) as CheckResult;
    } catch {
      continue;
    }
    const extract = r.extract_json ? (JSON.parse(r.extract_json) as { vibe_tags?: string[]; filmed_in?: string }) : {};
    const base = {
      id: r.id,
      video: { platform: r.platform, url: r.url, title: r.title, author: r.author, thumbnailUrl: r.thumbnail_url },
      cover: r.thumbnail_url && r.thumbnail_url.startsWith("/api/img/") ? r.thumbnail_url : null,
      author: r.author,
      checks: r.checks,
      checks7d: r.checks7d,
      saves: r.saves,
      createdAt: r.updated_at,
    };
    let item: ExploreItem | null = null;
    if (result.outcome === "single") {
      const card = result.card;
      const best = card.months.map((m, i) => (m === "best" ? i + 1 : 0)).filter(Boolean);
      item = {
        ...base,
        outcome: "single",
        photoQuery: [card.place.name, card.place.country].filter(Boolean).join(", "),
        title: card.place.name,
        sub: [card.place.region, card.place.country].filter(Boolean).join(" · "),
        country: card.place.country || null,
        vibe: extract.vibe_tags ?? [],
        authenticity: card.authenticity,
        costFrom: card.cost.low || null,
        bestMonths: best,
        monthRating: month ? card.months[month - 1] : null,
        vibeMatch: 0,
        nearKm: null,
      };
      if (month && !["best", "good"].includes(card.months[month - 1])) continue;
      if (budget && card.cost.low > budget) continue;
      if (wantNear) {
        const d = Math.min(...saves.filter((s) => s.lat != null && card.place.lat != null).map((s) => distanceKm({ lat: s.lat!, lng: s.lng! }, { lat: card.place.lat!, lng: card.place.lng! })));
        item.nearKm = Number.isFinite(d) ? Math.round(d) : null;
        if (item.nearKm === null || item.nearKm > 400) continue;
      }
    } else if (result.outcome === "multi") {
      const p0 = result.places[0];
      const countries = [...new Set(result.places.map((p) => p.country).filter(Boolean))];
      item = {
        ...base,
        outcome: "multi",
        photoQuery: p0 ? [p0.name, p0.country].filter(Boolean).join(", ") : null,
        title: `${result.places.length} places`,
        sub: countries.slice(0, 2).join(" & ") || (result.regions[0]?.name ?? ""),
        country: countries[0] ?? null,
        vibe: extract.vibe_tags ?? [],
        authenticity: null,
        costFrom: null,
        bestMonths: [],
        monthRating: null,
        vibeMatch: 0,
        nearKm: null,
      };
      if (month || budget) continue; // only single-place cards carry months and cost
      if (wantNear) {
        const d = Math.min(...result.places.filter((p) => p.lat != null).flatMap((p) => saves.filter((s) => s.lat != null).map((s) => distanceKm({ lat: s.lat!, lng: s.lng! }, { lat: p.lat!, lng: p.lng! }))));
        item.nearKm = Number.isFinite(d) ? Math.round(d) : null;
        if (item.nearKm === null || item.nearKm > 400) continue;
      }
    } else if (result.outcome === "vibe") {
      const s0 = result.suggestions[0];
      item = {
        ...base,
        outcome: "vibe",
        photoQuery: s0 ? `${s0.name}, ${s0.country}` : null,
        title: result.filmedIn ? `Vibe of ${result.filmedIn.replace(/\s*\(.*\)\s*$/, "")}` : "A vibe",
        sub: result.vibe.slice(0, 2).join(", "),
        country: null,
        vibe: result.vibe,
        authenticity: null,
        costFrom: null,
        bestMonths: [],
        monthRating: null,
        vibeMatch: 0,
        nearKm: null,
      };
      if (month || budget || wantNear) continue;
    }
    if (!item) continue;
    if (q && !placeKey(`${item.title} ${item.sub} ${item.vibe.join(" ")} ${item.country ?? ""}`).includes(q)) continue;
    if (myVibe.length) {
      const hits = item.vibe.filter((v) => myVibe.some((m) => placeKey(v).includes(m) || m.includes(placeKey(v)))).length;
      item.vibeMatch = item.vibe.length ? hits / Math.min(item.vibe.length, 4) : 0;
      if (wantVibe && hits === 0) continue;
    }
    items.push(item);
  }

  items.sort((a, b) =>
    sort === "new"
      ? b.createdAt - a.createdAt
      : sort === "real"
        ? (b.authenticity ?? -1) - (a.authenticity ?? -1) || b.checks - a.checks
        : (wantVibe ? b.vibeMatch - a.vibeMatch : 0) || b.checks7d - a.checks7d || b.saves - a.saves || b.checks - a.checks || b.createdAt - a.createdAt,
  );
  c.header("cache-control", "private, max-age=60");
  return c.json<ExploreResponse>({ items: items.slice(0, 60), myVibe, hasSaves: saves.length > 0 });
});

export type { MonthRating };
