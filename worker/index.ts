import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type {
  ApiError,
  CheckResult,
  CheckStatus,
  CheckSummary,
  LinkErrorCode,
  PlaceRef,
  StartCheckResponse,
} from "../shared/types";
import { isMock, type Env } from "./env";
import { analyze, cardFor, geminiConfig } from "./lib/analyze";
import { pingGemini } from "./lib/gemini";
import { normalizeRecord, type VideoRecord } from "./lib/extract-schema";
import { parseLink, resolveShortLink, type VideoLink } from "./lib/links";
import { mockGetExtract, mockJobId, mockMeta } from "./lib/mock";
import { lookupOEmbed } from "./lib/oembed";
import { placeKey } from "./lib/route";
import {
  claimForAnalysis,
  countBillableToday,
  getVideo,
  getVideoByKey,
  newId,
  reclaimStale,
  recordCheck,
  saveFailure,
  logError,
  saveResult,
  type VideoRow,
} from "./lib/store";
import { getExtract, startExtract, SupadataError } from "./lib/supadata";

type AppEnv = { Bindings: Env; Variables: { deviceId: string } };
const app = new Hono<AppEnv>().basePath("/api");

const LINK_MESSAGES: Record<LinkErrorCode, string> = {
  no_link: "Paste a link to a TikTok, Instagram Reel or YouTube Short.",
  unsupported_site: "That's a website, not a video. Paste a link to a TikTok, Instagram Reel or YouTube Short.",
  profile_link: "That's a profile. Open one of their videos and share that.",
  unavailable: "We can't open this post. It may be private or deleted.",
  daily_limit: "You've used today's free checks. Come back tomorrow, or open a reel someone already checked.",
};
const FRIENDLY_FAILURE = "We couldn't open this video. It may be private, deleted or blocked in our region.";
const FRIENDLY_ERROR = "Something went wrong while checking this reel. Try again in a minute.";

const fail = (c: Context<AppEnv>, status: 400 | 404 | 429 | 500, error: ApiError["error"], message: string) =>
  c.json<ApiError>({ error, message }, status);

// Anonymous device id (sign-up comes in a later phase). Used for daily limits and history.
app.use("*", async (c, next) => {
  let id = getCookie(c, "tz_device");
  if (!id || !/^[a-z0-9]{12,40}$/.test(id)) {
    id = crypto.randomUUID().replace(/-/g, "");
    setCookie(c, "tz_device", id, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  c.set("deviceId", id);
  await next();
});

function toStatus(v: VideoRow): CheckStatus {
  return {
    id: v.id,
    status: v.status,
    video: { platform: v.platform, url: v.url, title: v.title, author: v.author, thumbnailUrl: v.thumbnail_url },
    result: v.result_json ? (JSON.parse(v.result_json) as CheckResult) : undefined,
    error: v.status === "failed" ? (v.error ?? FRIENDLY_ERROR) : undefined,
  };
}

/** Start a Supadata job for a video row (or a mock job). */
async function startJob(env: Env, url: string): Promise<string> {
  if (isMock(env)) return mockJobId(url);
  return startExtract(env.SUPADATA_API_KEY!, url);
}

// ---------- POST /api/checks : paste a link ----------
app.post("/checks", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { input?: string };
  const input = (body.input ?? "").slice(0, 2000);
  const deviceId = c.get("deviceId");
  const env = c.env;

  // 1. Is it a supported video link at all? (instant, free)
  let parsed = parseLink(input);
  if (parsed.kind === "short") {
    parsed = isMock(env)
      ? { kind: "error", code: "unsupported_site" }
      : await resolveShortLink(parsed.url).catch(() => ({ kind: "error" as const, code: "unavailable" as const }));
  }
  if (parsed.kind !== "video") {
    const code = parsed.kind === "error" ? parsed.code : "unsupported_site";
    return fail(c, 400, code, LINK_MESSAGES[code]);
  }
  const link: VideoLink = parsed.link;

  // 2. Already checked by anyone? Reuse it: instant and free.
  const existing = await getVideoByKey(env.DB, link.canonicalKey);
  if (existing && existing.status !== "failed") {
    await recordCheck(env.DB, deviceId, existing.id, false);
    return c.json<StartCheckResponse>({ id: existing.id, cached: true });
  }

  // 2b. It failed after the video was already read: only redo the analysis.
  // No new Supadata job, so it's free for the user and for us.
  if (existing && existing.extract_json) {
    await env.DB.prepare(
      "UPDATE videos SET status = 'analyzing', error = NULL, error_detail = NULL, updated_at = ? WHERE id = ?",
    )
      .bind(Date.now(), existing.id)
      .run();
    c.executionCtx.waitUntil(runAnalysis(env, existing.id, JSON.parse(existing.extract_json) as VideoRecord));
    await recordCheck(env.DB, deviceId, existing.id, false);
    return c.json<StartCheckResponse>({ id: existing.id, cached: true });
  }

  // 3. Daily limit for new AI checks.
  const limit = Number(env.DAILY_LIMIT || "10");
  if ((await countBillableToday(env.DB, deviceId)) >= limit) {
    return fail(c, 429, "daily_limit", LINK_MESSAGES.daily_limit);
  }

  // 4. Public and still online? (official oEmbed, free)
  const meta = isMock(env) ? { available: true, ...mockMeta(link.url) } : await lookupOEmbed(link);
  if (!meta.available) return fail(c, 400, "unavailable", LINK_MESSAGES.unavailable);

  // 5. Start the paid extraction job.
  let jobId: string;
  try {
    jobId = await startJob(env, link.url);
  } catch (err) {
    console.error("startExtract failed", err);
    await logError(env.DB, "start-extract", err, link.url);
    const unavailable = err instanceof SupadataError && err.httpStatus >= 400 && err.httpStatus < 500;
    return unavailable
      ? fail(c, 400, "unavailable", LINK_MESSAGES.unavailable)
      : fail(c, 500, "server_error", FRIENDLY_ERROR);
  }

  const now = Date.now();
  const thumb = "thumbnailUrl" in meta ? (meta.thumbnailUrl ?? null) : null;
  let id: string;
  if (existing) {
    // A previous attempt failed: retry on the same row.
    id = existing.id;
    await env.DB.prepare(
      `UPDATE videos SET status = 'extracting', job_id = ?, error = NULL, result_json = NULL, outcome = NULL,
       extract_json = NULL, last_polled_at = NULL, updated_at = ? WHERE id = ?`,
    )
      .bind(jobId, now, id)
      .run();
  } else {
    id = newId();
    try {
      await env.DB.prepare(
        `INSERT INTO videos (id, canonical_key, platform, url, title, author, thumbnail_url, status, job_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'extracting', ?, ?, ?)`,
      )
        .bind(id, link.canonicalKey, link.platform, link.url, meta.title ?? null, meta.author ?? null, thumb, jobId, now, now)
        .run();
    } catch (err) {
      // Someone submitted the same video at the same moment: use their row.
      const raced = await getVideoByKey(env.DB, link.canonicalKey);
      if (!raced) throw err;
      await recordCheck(env.DB, deviceId, raced.id, false);
      return c.json<StartCheckResponse>({ id: raced.id, cached: true });
    }
  }
  await recordCheck(env.DB, deviceId, id, true);
  return c.json<StartCheckResponse>({ id, cached: false });
});

/** Run the analysis step and store the result (or a friendly failure). */
async function runAnalysis(env: Env, id: string, record: VideoRecord) {
  try {
    const result = await analyze(env, record);
    await saveResult(env.DB, id, result);
  } catch (err) {
    console.error("analysis failed", id, err);
    await logError(env.DB, "analysis", err, id);
    await saveFailure(env.DB, id, FRIENDLY_ERROR, String(err instanceof Error ? err.message : err));
  }
}

/**
 * Move a check forward. The app polls this every ~2 s while the "Checking your reel"
 * screen is open; each poll asks Supadata once (status checks are free).
 */
async function advance(env: Env, ctx: { waitUntil(p: Promise<unknown>): void }, v: VideoRow): Promise<VideoRow> {
  const now = Date.now();
  if (v.status === "extracting" && v.job_id && now - (v.last_polled_at ?? 0) > 1500) {
    await env.DB.prepare("UPDATE videos SET last_polled_at = ? WHERE id = ?").bind(now, v.id).run();
    const job = isMock(env) ? mockGetExtract(v.job_id) : await getExtract(env.SUPADATA_API_KEY!, v.job_id);
    if (job.status === "failed") {
      await saveFailure(env.DB, v.id, FRIENDLY_FAILURE, "Supadata job failed");
    } else if (job.status === "completed") {
      const record = normalizeRecord(job.data);
      if (await claimForAnalysis(env.DB, v.id, JSON.stringify(record))) {
        ctx.waitUntil(runAnalysis(env, v.id, record));
      }
    }
  } else if (v.status === "analyzing" && v.extract_json && (await reclaimStale(env.DB, v.id, 90_000))) {
    ctx.waitUntil(runAnalysis(env, v.id, JSON.parse(v.extract_json) as VideoRecord));
  }
  return (await getVideo(env.DB, v.id)) ?? v;
}

// ---------- GET /api/checks/:id : status + result ----------
app.get("/checks/:id", async (c) => {
  const v = await getVideo(c.env.DB, c.req.param("id"));
  if (!v) return fail(c, 404, "not_found", "This check doesn't exist.");
  const current = v.status === "ready" || v.status === "failed" ? v : await advance(c.env, c.executionCtx, v);
  return c.json<CheckStatus>(toStatus(current));
});

// ---------- GET /api/checks : this device's recent checks ----------
app.get("/checks", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT v.*, MAX(k.created_at) AS checked_at FROM checks k JOIN videos v ON v.id = k.video_id
     WHERE k.device_id = ? GROUP BY v.id ORDER BY checked_at DESC LIMIT 20`,
  )
    .bind(c.get("deviceId"))
    .all<VideoRow & { checked_at: number }>();
  const items: CheckSummary[] = rows.results.map((v) => {
    const r = v.result_json ? (JSON.parse(v.result_json) as CheckResult) : null;
    const label =
      r?.outcome === "single"
        ? [r.card.place.name, r.card.place.region].filter(Boolean).join(", ")
        : r?.outcome === "multi"
          ? `${r.places.length} places`
          : r?.outcome === "pick"
            ? `${r.candidates[0]?.name ?? "Place"}?`
            : r?.outcome === "vibe"
              ? "Places with this vibe"
              : r?.outcome === "not_travel"
                ? "Not a travel video"
                : v.status === "failed"
                  ? "Couldn't open"
                  : "Checking…";
    return {
      id: v.id,
      status: v.status,
      outcome: v.outcome,
      label,
      createdAt: v.checked_at,
      video: { platform: v.platform, url: v.url, title: v.title, author: v.author, thumbnailUrl: v.thumbnail_url },
    };
  });
  return c.json({ items });
});

// ---------- POST /api/checks/:id/place-card : Reality Card for one place ----------
// Used for a place inside a many-places reel, a picked candidate, or a typed name.
app.post("/checks/:id/place-card", async (c) => {
  const v = await getVideo(c.env.DB, c.req.param("id"));
  if (!v || v.status !== "ready") return fail(c, 404, "not_found", "This check isn't ready.");
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; typed?: boolean };
  const name = (body.name ?? "").trim().slice(0, 120);
  if (!name) return fail(c, 400, "bad_request", "Tell us the place name.");

  const key = placeKey(name);
  const cached = await c.env.DB.prepare("SELECT card_json FROM place_cards WHERE video_id = ? AND place_key = ?")
    .bind(v.id, key)
    .first<{ card_json: string }>();

  // Remember what users pick or type: it becomes labelled data for the AI review queue.
  if (body.typed || v.outcome === "pick" || v.outcome === "not_travel") {
    await c.env.DB.prepare("INSERT INTO feedback (id, video_id, device_id, kind, value, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(newId(), v.id, c.get("deviceId"), body.typed ? "typed_place" : "picked_place", name, Date.now())
      .run();
  }
  if (cached) return c.json({ card: JSON.parse(cached.card_json) });

  const result = v.result_json ? (JSON.parse(v.result_json) as CheckResult) : null;
  const known: PlaceRef | undefined =
    result?.outcome === "multi"
      ? result.places.find((p) => placeKey(p.name) === key)
      : result?.outcome === "pick"
        ? result.candidates.find((p) => placeKey(p.name) === key)
        : undefined;
  // A "places with this vibe" suggestion: the reel wasn't filmed there, so the card mustn't judge it by the reel.
  const lookalike =
    !body.typed && result?.outcome === "vibe"
      ? result.suggestions.find((s) => placeKey(`${s.name}, ${s.country}`) === key || placeKey(s.name) === key)
      : undefined;
  const place: PlaceRef = known ?? (lookalike ? { name: lookalike.name, country: lookalike.country, confidence: 0.8 } : { name, confidence: 0.6 });
  const record = v.extract_json ? (JSON.parse(v.extract_json) as VideoRecord) : null;

  try {
    const { card, backup } = await cardFor(c.env, { ...place, verified: undefined }, record, lookalike ? "lookalike" : "reel");
    // Cards from the backup model are shown but not kept, so the next visit gets Gemini's (better) card.
    if (!backup) {
      await c.env.DB.prepare("INSERT OR REPLACE INTO place_cards (video_id, place_key, card_json, created_at) VALUES (?, ?, ?, ?)")
        .bind(v.id, key, JSON.stringify(card), Date.now())
        .run();
    }
    return c.json({ card });
  } catch (err) {
    console.error("place card failed", err);
    await logError(c.env.DB, "place-card", err, `${v.id} ${name}`);
    return fail(c, 500, "server_error", FRIENDLY_ERROR);
  }
});

// ---------- POST /api/checks/:id/feedback : "We got this wrong" ----------
app.post("/checks/:id/feedback", async (c) => {
  const v = await getVideo(c.env.DB, c.req.param("id"));
  if (!v) return fail(c, 404, "not_found", "This check doesn't exist.");
  const body = (await c.req.json().catch(() => ({}))) as { kind?: string; value?: string };
  const kind = body.kind === "wrong_result" ? "wrong_result" : null;
  if (!kind) return fail(c, 400, "bad_request", "Unknown feedback.");
  await c.env.DB.prepare("INSERT INTO feedback (id, video_id, device_id, kind, value, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(newId(), v.id, c.get("deviceId"), kind, (body.value ?? "").slice(0, 500), Date.now())
    .run();
  return c.json({ ok: true });
});

// /api/health        → is the app up, and is it using real AI or sample results?
// /api/health?ai=1   → also sends Gemini a tiny test question (tells you if the key and model work).
app.get("/health", async (c) => {
  const base = {
    ok: true,
    mock: isMock(c.env),
    keys: { supadata: !!c.env.SUPADATA_API_KEY, gemini: !!c.env.GEMINI_API_KEY },
    models: (c.env.GEMINI_MODEL || "").split(",").map((m) => m.trim()).filter(Boolean),
  };
  if (c.req.query("ai") !== "1" || !c.env.GEMINI_API_KEY) return c.json(base);
  return c.json({ ...base, gemini: await pingGemini(geminiConfig(c.env)) });
});

app.notFound((c) => fail(c, 404, "not_found", "Not found."));
app.onError(async (err, c) => {
  console.error(err);
  await logError(c.env.DB, `${c.req.method} ${c.req.path}`, err);
  return fail(c, 500, "server_error", FRIENDLY_ERROR);
});

export default app;
