import { isMock, type Env } from "./env";

/**
 * Everything the app needs to run, with a status and what to do about it.
 * GET /api/health shows it; ?tp=1, ?providers=1, ?ai=1 add live calls (see index.ts).
 */
export type Status = "ok" | "missing" | "placeholder" | "warn" | "off";
export interface Check {
  status: Status;
  /** What it does and what to do when it's not ok. */
  note: string;
}

const isPlaceholder = (v: string | undefined) => !!v && /^\[.*\]$/.test(v.trim());

/** Settings: secrets and vars. Keys themselves are never shown, only whether they're set. */
export function settingsReport(env: Env, origin: string): Record<string, Check> {
  const mock = isMock(env);
  const s = (set: boolean, note: string, when: Status = "missing"): Check => ({ status: set ? "ok" : when, note });
  const email = (v: string | undefined, note: string): Check => (isPlaceholder(v) || !v ? { status: "placeholder", note } : { status: "ok", note });
  return {
    MOCK_AI: { status: mock ? "warn" : "ok", note: mock ? "Sample results instead of real analysis. Set to \"0\" for real users." : "Real analysis." },
    SUPADATA_API_KEY: s(!!env.SUPADATA_API_KEY, "Secret. Reads the video (transcript, frames, cover). Required."),
    GEMINI_API_KEY: s(!!env.GEMINI_API_KEY, "Secret. Writes the Reality Card. Required."),
    GEMINI_MODEL: s(!!env.GEMINI_MODEL, "Models to try in order; the next one is used when one is retired or overloaded."),
    FALLBACK_MODEL: s(!!env.FALLBACK_MODEL && !!env.AI, "Workers AI backup when every Gemini model is down. Needs the `ai` binding in wrangler.jsonc.", "off"),
    DAILY_LIMIT: s(!!env.DAILY_LIMIT, `Paid checks per device per day (now ${env.DAILY_LIMIT || "10"}).`),
    GEOCODER_CONTACT: email(env.GEOCODER_CONTACT, "Real email sent to OpenStreetMap's geocoder (its usage policy). Placeholder = may be blocked."),
    CONTACT_EMAIL: email(env.CONTACT_EMAIL, "Shown on /privacy for data-deletion requests. Google's consent screen links there."),
    GOOGLE_CLIENT_ID: s(!!env.GOOGLE_CLIENT_ID, "Google sign-in client id (public). Without it the login button is hidden."),
    GOOGLE_CLIENT_SECRET: s(!!env.GOOGLE_CLIENT_SECRET, `Secret. Google sign-in. Register this redirect URI in Google Cloud: ${origin}/api/auth/google/callback`),
    TP_TOKEN: s(!!env.TP_TOKEN, "Secret. Travelpayouts API token → cached Aviasales fares before the hand-off.", "warn"),
    TP_MARKER: s(!!env.TP_MARKER, "Travelpayouts marker (partner id): Kiwi/Booking links earn commission.", "warn"),
    TP_TRS: s(!!env.TP_TRS, "Travelpayouts project id (trs) on the links.", "warn"),
    TP_BRAND_CAMPAIGNS: s(!!(env.TP_KIWI_P && env.TP_BOOKING_P), "Per-brand campaign ids (p=) for Kiwi/Booking/GYG/Omio. Empty = links still work, Travelpayouts may not attribute.", "warn"),
    SERPAPI_KEY: s(!!env.SERPAPI_KEY, `Secret. Google Flights + Hotels live prices (free ${env.SERPAPI_MONTHLY_LIMIT || "250"}/month).`, "off"),
    DUFFEL_TOKEN: s(!!env.DUFFEL_TOKEN, "Secret. Airline fares + hosted checkout.", "off"),
    VIATOR_API_KEY: s(!!env.VIATOR_API_KEY, "Secret. Viator activity prices per day (\"from €X\"), ratings and affiliate product links. Test: /api/health?viator=1", "off"),
    DUFFEL_ALLOW_TEST: {
      status: env.DUFFEL_ALLOW_TEST === "1" ? "warn" : "ok",
      note: env.DUFFEL_ALLOW_TEST === "1" ? "Sandbox airline (\"Duffel Airways\") is shown to users. Set \"0\" before launch." : "Sandbox fares hidden.",
    },
  };
}

/** Numbers that tell whether the app is being used, and whether anything is stuck. */
export async function dbReport(db: D1Database) {
  const one = async <T>(sql: string): Promise<T | null> => db.prepare(sql).first<T>().catch(() => null);
  const count = async (sql: string) => (await one<{ n: number }>(sql))?.n ?? null;
  const tables = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")
    .all<{ name: string }>()
    .then((r) => r.results.map((x) => x.name))
    .catch(() => [] as string[]);
  const needed = ["videos", "checks", "place_cards", "feedback", "geocode_cache", "error_log", "images", "place_galleries", "saves", "trips", "kv_cache", "shares", "votes", "users", "sessions", "profiles", "place_profiles"];
  const missingTables = needed.filter((t) => !tables.includes(t));
  const latestMigration = (await one<{ name: string }>("SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1"))?.name ?? null;
  const dayAgo = Date.now() - 86400_000;
  const tenMinAgo = Date.now() - 10 * 60_000;
  const stuck = await count(`SELECT COUNT(*) AS n FROM videos WHERE status IN ('extracting','analyzing') AND updated_at < ${tenMinAgo}`);
  const errors24h = await count(`SELECT COUNT(*) AS n FROM error_log WHERE at > ${dayAgo}`);
  const lastErrors = await db
    .prepare("SELECT at, route, detail FROM error_log ORDER BY at DESC LIMIT 3")
    .all<{ at: number; route: string; detail: string }>()
    .then((r) => r.results.map((e) => ({ at: new Date(e.at).toISOString(), route: e.route, detail: e.detail.slice(0, 120) })))
    .catch(() => []);
  return {
    status: missingTables.length ? "missing" : "ok",
    latestMigration,
    missingTables,
    counts: {
      videosReady: await count("SELECT COUNT(*) AS n FROM videos WHERE status = 'ready'"),
      videosFailed: await count("SELECT COUNT(*) AS n FROM videos WHERE status = 'failed'"),
      checks24h: await count(`SELECT COUNT(*) AS n FROM checks WHERE created_at > ${dayAgo}`),
      placeCards: await count("SELECT COUNT(*) AS n FROM place_cards"),
      saves: await count("SELECT COUNT(*) AS n FROM saves"),
      trips: await count("SELECT COUNT(*) AS n FROM trips"),
      users: await count("SELECT COUNT(*) AS n FROM users"),
      activeSessions: await count(`SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ${Date.now()}`),
      profiles: await count("SELECT COUNT(*) AS n FROM profiles"),
      shares: await count("SELECT COUNT(*) AS n FROM shares"),
      placeProfiles: await count("SELECT COUNT(*) AS n FROM place_profiles"),
      placeCardsMissing: await count("SELECT COUNT(*) AS n FROM videos v WHERE v.status = 'ready' AND v.outcome IN ('multi','pick','vibe') AND v.updated_at > " + (Date.now() - 72 * 3600_000) + " AND NOT EXISTS (SELECT 1 FROM place_cards c WHERE c.video_id = v.id)"),
    },
    stuckVideos: stuck,
    errors24h,
    lastErrors,
  };
}

export const summarize = (settings: Record<string, Check>, db: { status: string; stuckVideos: number | null }) => {
  const missing = Object.entries(settings).filter(([, c]) => c.status === "missing").map(([k]) => k);
  const placeholders = Object.entries(settings).filter(([, c]) => c.status === "placeholder").map(([k]) => k);
  const warnings = Object.entries(settings).filter(([, c]) => c.status === "warn").map(([k]) => k);
  return {
    ok: missing.length === 0 && db.status === "ok",
    missing,
    placeholders,
    warnings: [...warnings, ...(db.stuckVideos ? [`${db.stuckVideos} video(s) stuck in processing > 10 min`] : [])],
  };
};
