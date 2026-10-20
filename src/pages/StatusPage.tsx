import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../components/Icon";

/** /status (internal): every workflow step's outcomes, from /api/ops. Not linked from the app. */

type Counts = { ok: number; empty: number; fail: number; skip: number };
type Op = {
  op: string;
  name: string;
  last24h: Counts & { avgMs: number | null };
  last7d: Counts;
  health: "good" | "mixed" | "failing" | "idle";
  lastProblem: { at: number; outcome: string; detail: string | null } | null;
};
type Summary = { generatedAt: number; ops: Op[]; recent: { at: number; op: string; outcome: string; detail: string | null; ref: string | null; times: number }[] };

const GROUPS: [string, (op: string) => boolean][] = [
  ["Reading reels", (op) => op.startsWith("check.") || op === "photos"],
  ["Trip plans and prices", (op) => op.startsWith("trip.") || op.startsWith("prices.")],
  ["Activities and links", (op) => op.startsWith("activities.") || op.startsWith("links.")],
  ["Account and background", () => true],
];

const ago = (at: number, now: number) => {
  const m = Math.max(1, Math.round((now - at) / 60_000));
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const clock = (at: number) => new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const secs = (ms: number | null) => (ms === null ? "" : ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s` : `${ms} ms`);
const shortName = (name: string) => {
  const s = name.replace(/^(Reel|Trip|Prices|Activities|Links|Booking|Background): /, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function StatusPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setError(false);
    fetch("/api/ops", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setError(true));
  }, []);
  useEffect(load, [load]);

  const count = (h: Op["health"]) => data?.ops.filter((o) => o.health === h).length ?? 0;
  const placed = new Set<string>();

  return (
    <main className="page status-page" style={{ gap: 14 }}>
      <div className="topbar">
        <button className="icon-btn plain" aria-label="Back" onClick={() => navigate(-1)}>
          <Icon name="back" />
        </button>
        <h1 style={{ margin: 0, fontSize: 22 }}>Status</h1>
        <button className="btn link" onClick={load}>
          Refresh
        </button>
      </div>
      <p className="small" style={{ margin: 0 }}>
        What works and what doesn't, step by step. Last 24 hours{data ? ` · updated ${clock(data.generatedAt)}` : ""}.
      </p>
      {error && <div className="field-error">Couldn't load the status. Try Refresh.</div>}
      {!data && !error && <div className="skeleton" style={{ height: 320, borderRadius: 20 }} />}
      {data && (
        <>
          <div className="chips" style={{ gap: 6 }}>
            {(
              [
                ["good", "working"],
                ["mixed", "mixed"],
                ["failing", "failing"],
                ["idle", "not used"],
              ] as const
            ).map(([h, label]) => (
              <span key={h} className="chip status-chip">
                <i className={`status-dot ${h}`} />
                <b>{count(h)}</b> {label}
              </span>
            ))}
          </div>

          {GROUPS.map(([title, test]) => {
            const ops = data.ops.filter((o) => !placed.has(o.op) && test(o.op));
            ops.forEach((o) => placed.add(o.op));
            if (!ops.length) return null;
            return (
              <section key={title} className="card status-group" aria-label={title}>
                <h2>{title}</h2>
                {ops.map((o) => {
                  const ran = o.last24h.ok + o.last24h.empty + o.last24h.fail;
                  const rate = ran ? Math.round((100 * o.last24h.ok) / ran) : null;
                  const p = o.lastProblem;
                  return (
                    <div key={o.op} className="status-row">
                      <i className={`status-dot ${o.health}`} aria-label={o.health} />
                      <span className="status-name">
                        <b>{shortName(o.name)}</b>
                        {o.last24h.skip > 0 && <span>Skipped {o.last24h.skip}× (not set up or over a limit)</span>}
                        {p && <span className={o.health === "failing" ? "bad" : ""}>Last problem {ago(p.at, data.generatedAt)}: {p.detail ?? p.outcome}</span>}
                      </span>
                      <span className="status-nums">{rate === null ? (o.last24h.skip ? "skipped" : o.op === "api.error" ? "none" : "not used") : `${rate}% · ${ran}${o.last24h.avgMs ? ` · ${secs(o.last24h.avgMs)}` : ""}`}</span>
                    </div>
                  );
                })}
              </section>
            );
          })}

          <section className="card status-group" aria-label="Recent failures">
            <h2>Recent failures</h2>
            {data.recent.length === 0 ? (
              <p className="small" style={{ margin: "6px 0" }}>None in the last 7 days.</p>
            ) : (
              data.recent.map((r, i) => (
                <div key={i} className="status-fail">
                  <b>{ago(r.at, data.generatedAt)}</b> · {shortName(data.ops.find((o) => o.op === r.op)?.name ?? r.op)} · {r.detail ?? "failed"}
                  {r.times > 1 ? <span> · {r.times} times, last: {r.ref ?? "—"}</span> : r.ref ? <span> · {r.ref}</span> : null}
                </div>
              ))
            )}
          </section>
          <p className="small" style={{ margin: 0 }}>
            The same events are in Cloudflare: Workers &amp; Pages → trailz-app → Observability, filter <b>event = op</b>.
          </p>
        </>
      )}
    </main>
  );
}
