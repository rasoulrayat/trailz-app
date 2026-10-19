import { useMemo } from "react";
import { Link } from "react-router";
import type { Profile, SavedPlace } from "../../shared/types";
import { buildVibe } from "../../shared/vibe";
import { saveProfile } from "../auth";
import { homeCity } from "../cities";
import { VIBES } from "../onboarding-data";
import { Icon } from "./Icon";

/**
 * "What TrailZ learned": the vibe words the saved places taught, each removable, plus the onboarding picks.
 * It is what sorts Explore's "My vibe" and seeds every plan, so the person can see and correct it here.
 */
export function VibeCard({ items, profile, loaded }: { items: SavedPlace[]; profile: Profile | null; loaded: boolean }) {
  const vibe = useMemo(() => buildVibe(items, profile), [items, profile]);
  const picks = (profile?.vibes ?? []).map((id) => VIBES.find((v) => v.id === id)?.label ?? id);
  const home = homeCity(profile?.home);
  const nothingYet = loaded && vibe.tags.length === 0 && picks.length === 0;

  const mute = (key: string) => saveProfile({ vibeOff: [...new Set([...vibe.muted, key])] });
  const unmuteAll = () => saveProfile({ vibeOff: [] });
  const setLearning = (on: boolean) => saveProfile({ learnVibe: on });

  return (
    <section className="card dark stack" style={{ gap: 12 }} aria-labelledby="vibe-h">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 id="vibe-h" style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--sky)", display: "inline-flex" }}>
            <Icon name="sparkle" size={18} />
          </span>
          What TrailZ learned
        </h2>
        <span className="small" style={{ color: "var(--muted-on-dark)" }}>
          {vibe.learning ? `from ${vibe.saves} ${vibe.saves === 1 ? "save" : "saves"}` : "learning off"}
        </span>
      </div>

      {!loaded ? (
        <div className="skeleton" style={{ height: 34, background: "rgba(255,255,255,0.12)" }} />
      ) : nothingYet ? (
        <p className="small" style={{ color: "var(--muted-on-dark)", margin: 0 }}>
          Nothing yet. Save a few places, or <Link to="/welcome?step=1" style={{ color: "#fff", textDecoration: "underline" }}>pick your vibe</Link>, and Explore starts sorting for you.
        </p>
      ) : (
        <>
          {vibe.learning && vibe.tags.length > 0 && (
            <ul className="chips" style={{ gap: 8, listStyle: "none", margin: 0, padding: 0 }} aria-label="Learned from your saves">
              {vibe.tags.map((t) => (
                <li key={t.key} className="chip vibe-tag" title={`From ${t.from.join(", ")}`}>
                  <span>{t.label}</span>
                  <span className="vibe-count">{t.count}</span>
                  <button type="button" className="vibe-x" aria-label={`Remove ${t.label} from your vibe`} onClick={() => mute(t.key)}>
                    <Icon name="close" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {vibe.learning && vibe.tags.length === 0 && items.length > 0 && (
            <p className="small" style={{ color: "var(--muted-on-dark)", margin: 0 }}>Your saves have no vibe words yet; the picks below do the sorting for now.</p>
          )}
          {(picks.length > 0 || home) && (
            <div className="vibe-facts">
              {picks.length > 0 && (
                <div>
                  <span className="small" style={{ color: "var(--muted-on-dark)" }}>From your picks</span>
                  <b>{picks.join(" · ")}</b>
                </div>
              )}
              {home && (
                <div>
                  <span className="small" style={{ color: "var(--muted-on-dark)" }}>Flying from</span>
                  <b>{home}</b>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <p className="small" style={{ color: "var(--muted-on-dark)", margin: 0, lineHeight: 1.5 }}>
        This sorts Explore's “My vibe” and starts every plan. Every save updates it; remove a word with ✕
        {vibe.muted.length > 0 && (
          <>
            {" "}
            (<button type="button" className="linkish" onClick={unmuteAll}>restore {vibe.muted.length} removed</button>)
          </>
        )}
        , or stop learning from saves and TrailZ keeps only your picks.
      </p>

      <div className="row" style={{ gap: 8 }}>
        <label className={`toggle row${vibe.learning ? " on" : ""}`} style={{ gap: 10, flex: 1, cursor: "pointer" }}>
          <input type="checkbox" className="sr-only" checked={vibe.learning} onChange={(e) => setLearning(e.target.checked)} />
          <span className="switch" aria-hidden="true" />
          <span className="small" style={{ color: "#fff" }}>Learn from my saves</span>
        </label>
        <Link to="/explore?vibe=1" className="btn-sm" style={{ background: "#fff", borderColor: "#fff", color: "var(--navy)", flex: "none" }}>
          See reels for this vibe
        </Link>
      </div>
    </section>
  );
}
