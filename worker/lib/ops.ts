/**
 * Operation log: every step of a workflow records whether it worked, so we can see what works and what doesn't.
 *
 *  - Cloudflare: each outcome is one structured log line ({ event: "op", op, outcome, ms, ref, detail }) in
 *    Workers Logs (dashboard → Workers & Pages → trailz-app → Observability; filter event = op, outcome = fail).
 *  - D1: counts per hour and step (op_stats) and the details of anything that didn't simply work (op_events).
 *    Read them at /status in the app or /api/health?ops=1.
 *
 * Outcomes: ok (worked), empty (worked, found nothing), fail (error), skip (not configured, over a limit).
 * Logging never breaks the request: every write is guarded.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type Outcome = "ok" | "empty" | "fail" | "skip";

/** The steps we watch, in workflow order, with a plain-language name for the status page. */
export const OPS: Record<string, string> = {
  "check.read-start": "Reel: start reading the video (Supadata)",
  "check.read": "Reel: video read (transcript, frames)",
  "check.analysis": "Reel: AI analysis (Reality Card)",
  "check.video-meta": "Reel: cover image and creator",
  "check.place-card": "Reel: card for a place",
  photos: "Place photos (Wikimedia)",
  "trip.plan": "Trip: AI plan",
  "prices.airports": "Prices: airports for the trip",
  "prices.google-flights": "Prices: Google Flights",
  "prices.duffel": "Prices: airlines via Duffel",
  "prices.aviasales": "Prices: Aviasales fares",
  "prices.google-hotels": "Prices: Google Hotels",
  "activities.viator": "Activities: Viator price",
  "links.travelpayouts": "Links: Travelpayouts tracking (Tiqets)",
  "booking.duffel-link": "Booking: Duffel checkout link",
  "auth.google": "Sign-in with Google",
  "cron.prebuild": "Background: place cards (cron)",
  "api.error": "Unexpected server errors",
  "health.edge": "Health check from a monitor (by data centre)",
};

const als = new AsyncLocalStorage<{ fail?: string; skip?: string }>();

/** Inside a tracked step: it failed (an HTTP error, a timeout…), even if it then returns an empty answer. */
export function noteFail(detail: string) {
  const s = als.getStore();
  if (s && !s.fail) s.fail = detail;
}
/** Inside a tracked step: it didn't run (no key, monthly limit reached). */
export function noteSkip(detail: string) {
  const s = als.getStore();
  if (s && !s.skip) s.skip = detail;
}

/** Never store secrets: query keys, tokens and long ids are masked. */
export function clean(detail: unknown): string | null {
  if (detail === null || detail === undefined || detail === "") return null;
  const text = detail instanceof Error ? detail.message : typeof detail === "string" ? detail : JSON.stringify(detail);
  return text
    .replace(/((?:api_?key|key|token|secret|password|access_token|exp-api-key)=)[^&\s"]+/gi, "$1…")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/g, "$1…")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "…")
    .slice(0, 300);
}

let lastPrune = 0;

export async function recordOp(db: D1Database, op: string, outcome: Outcome, o: { ms?: number; ref?: string | null; detail?: unknown } = {}) {
  const at = Date.now();
  const ms = Math.max(0, Math.round(o.ms ?? 0));
  const detail = clean(o.detail);
  const ref = o.ref ? String(o.ref).slice(0, 120) : null;
  // Workers Logs (Cloudflare dashboard): one JSON line per outcome.
  const line = JSON.stringify({ event: "op", op, outcome, ms, ref, detail });
  if (outcome === "fail") console.error(line);
  else console.log(line);
  try {
    await db
      .prepare(
        `INSERT INTO op_stats (hour, op, ok, empty, fail, skip, ms) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (hour, op) DO UPDATE SET ok = ok + excluded.ok, empty = empty + excluded.empty,
           fail = fail + excluded.fail, skip = skip + excluded.skip, ms = ms + excluded.ms`,
      )
      .bind(Math.floor(at / 3_600_000), op, +(outcome === "ok"), +(outcome === "empty"), +(outcome === "fail"), +(outcome === "skip"), ms)
      .run();
    if (outcome !== "ok") {
      await db.prepare("INSERT INTO op_events (id, at, op, outcome, ms, ref, detail) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), at, op, outcome, ms, ref, detail).run();
    }
    // Keep the tables small, at most once an hour per worker.
    if (at - lastPrune > 3_600_000) {
      lastPrune = at;
      await db.prepare("DELETE FROM op_events WHERE at < ?").bind(at - 14 * 86_400_000).run();
      await db.prepare("DELETE FROM op_stats WHERE hour < ?").bind(Math.floor((at - 90 * 86_400_000) / 3_600_000)).run();
    }
  } catch {
    // Logging must never break the request.
  }
}

/**
 * Run one step and record how it went. `judge` turns the answer into an outcome (e.g. no offers = "empty").
 * With `fallback`, an error is recorded and the fallback returned; without, the error is recorded and rethrown.
 */
export async function track<T>(
  db: D1Database,
  op: string,
  run: () => Promise<T>,
  o: { ref?: string | null; judge?: (v: T) => Outcome | [Outcome, string]; fallback?: T } = {},
): Promise<T> {
  const t0 = Date.now();
  const store: { fail?: string; skip?: string } = {};
  try {
    const value = await als.run(store, run);
    const judged = o.judge ? o.judge(value) : "ok";
    const [outcome, why] = Array.isArray(judged) ? judged : [judged, undefined];
    // A step that noted a failure or a skip inside counts as that, whatever it returned.
    const final: Outcome = store.fail ? "fail" : store.skip ? "skip" : outcome;
    await recordOp(db, op, final, { ms: Date.now() - t0, ref: o.ref, detail: store.fail ?? store.skip ?? why });
    return value;
  } catch (err) {
    await recordOp(db, op, "fail", { ms: Date.now() - t0, ref: o.ref, detail: err });
    if ("fallback" in o) return o.fallback as T;
    throw err;
  }
}

/** Is it a list with something in it? (for judge) */
export const someOrEmpty = (v: unknown): Outcome => (Array.isArray(v) ? (v.length ? "ok" : "empty") : v ? "ok" : "empty");

export type OpSummary = {
  op: string;
  name: string;
  last24h: { ok: number; empty: number; fail: number; skip: number; avgMs: number | null };
  last7d: { ok: number; empty: number; fail: number; skip: number };
  health: "good" | "mixed" | "failing" | "idle";
  lastProblem: { at: number; outcome: Outcome; detail: string | null } | null;
};

/** Per step: the last 24 hours and 7 days, and its most recent problem. */
export async function opsSummary(db: D1Database): Promise<{ generatedAt: number; ops: OpSummary[]; recent: { at: number; op: string; outcome: string; detail: string | null; ref: string | null; times: number }[] }> {
  const now = Date.now();
  const h24 = Math.floor((now - 86_400_000) / 3_600_000);
  const h7d = Math.floor((now - 7 * 86_400_000) / 3_600_000);
  const rows = await db
    .prepare(
      `SELECT op,
         SUM(CASE WHEN hour >= ?1 THEN ok ELSE 0 END) AS ok24, SUM(CASE WHEN hour >= ?1 THEN empty ELSE 0 END) AS empty24,
         SUM(CASE WHEN hour >= ?1 THEN fail ELSE 0 END) AS fail24, SUM(CASE WHEN hour >= ?1 THEN skip ELSE 0 END) AS skip24,
         SUM(CASE WHEN hour >= ?1 THEN ms ELSE 0 END) AS ms24,
         SUM(ok) AS ok7, SUM(empty) AS empty7, SUM(fail) AS fail7, SUM(skip) AS skip7
       FROM op_stats WHERE hour >= ?2 GROUP BY op`,
    )
    .bind(h24, h7d)
    .all<Record<string, number> & { op: string }>();
  // SQLite returns the other columns from the row holding MAX(at): each step's latest problem.
  const last = await db
    .prepare("SELECT op, MAX(at) AS at, outcome, detail FROM op_events WHERE at >= ? GROUP BY op")
    .bind(now - 7 * 86_400_000)
    .all<{ op: string; at: number; outcome: Outcome; detail: string | null }>();
  // The same failure many times (Wikimedia down for every photo) is one line with a count.
  const recent = await db
    .prepare(
      `SELECT MAX(at) AS at, op, outcome, detail, ref, COUNT(*) AS times FROM op_events
       WHERE outcome = 'fail' AND at >= ? GROUP BY op, detail ORDER BY at DESC LIMIT 15`,
    )
    .bind(now - 7 * 86_400_000)
    .all<{ at: number; op: string; outcome: string; detail: string | null; ref: string | null; times: number }>();
  const byOp = new Map(rows.results.map((r) => [r.op, r]));
  const lastByOp = new Map(last.results.map((r) => [r.op, r]));
  const names = [...new Set([...Object.keys(OPS), ...byOp.keys()])];
  const ops = names.map((op): OpSummary => {
    const r = byOp.get(op);
    const n = (k: string) => Number(r?.[k] ?? 0);
    const ran24 = n("ok24") + n("empty24") + n("fail24");
    const health: OpSummary["health"] = !ran24 && !n("skip24") ? "idle" : n("fail24") === 0 && n("ok24") > 0 ? "good" : n("ok24") === 0 ? "failing" : "mixed";
    const p = lastByOp.get(op);
    return {
      op,
      name: OPS[op] ?? op,
      last24h: { ok: n("ok24"), empty: n("empty24"), fail: n("fail24"), skip: n("skip24"), avgMs: ran24 ? Math.round(n("ms24") / ran24) : null },
      last7d: { ok: n("ok7"), empty: n("empty7"), fail: n("fail7"), skip: n("skip7") },
      health,
      lastProblem: p ? { at: p.at, outcome: p.outcome, detail: p.detail } : null,
    };
  });
  return { generatedAt: now, ops, recent: recent.results };
}
