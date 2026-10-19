import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { MOODS, type Mood, type SavedPlace } from "../../shared/types";
import { ApiFailure, tripsApi } from "../api";
import { Icon, type IconName } from "../components/Icon";
import { MapView, toPoints } from "../components/MapView";
import { PlaceThumb } from "../components/PlacePhoto";
import { TabBar } from "../components/TabBar";
import { VibeCard } from "../components/VibeCard";
import { useMe } from "../auth";
import { groupPlaces, type GroupBy, type PlaceGroup } from "../groups";
import { planUrl } from "../plan-url";
import { toggleSave, useSaves } from "../saves";
import { Working } from "../components/Working";

const GROUPINGS: { id: GroupBy; label: string }[] = [
  { id: "country", label: "Country" },
  { id: "nearby", label: "Nearby" },
  { id: "region", label: "Region" },
];
const MOOD_ICON: Record<Mood, IconName> = { solo: "coffee", energetic: "bolt", friends: "users" };
const remember = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};
const recall = (k: string, fallback: string) => {
  try {
    return localStorage.getItem(k) ?? fallback;
  } catch {
    return fallback;
  }
};

const q = (p: SavedPlace) => [p.name, p.country].filter(Boolean).join(", ");

export function SavedPage() {
  const { items, loaded } = useSaves();
  const me = useMe();
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [by, setBy] = useState<GroupBy>(() => recall("tz_groupby", "country") as GroupBy);
  const [mood, setMood] = useState<Mood>(() => recall("tz_mood", "energetic") as Mood);
  useEffect(() => remember("tz_groupby", by), [by]);
  useEffect(() => remember("tz_mood", mood), [mood]);
  const groups = useMemo(() => groupPlaces(items, by), [items, by]);

  const togglePick = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <main className="page" style={{ gap: 18 }}>
        <div className="topbar">
          <h1>Your vibe</h1>
          {items.length > 1 && (
            <button
              className="btn-sm"
              onClick={() => {
                setPicking((v) => !v);
                setPicked(new Set());
              }}
            >
              {picking ? "Cancel" : "Pick places for a trip"}
            </button>
          )}
        </div>

        {!picking && <VibeCard items={items} profile={me.profile} loaded={loaded && me.loaded} />}

        {!loaded ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : items.length === 0 ? (
          <div className="card stack" style={{ padding: 18, alignItems: "center", textAlign: "center", gap: 8 }}>
            <span className="heart on" style={{ width: 44, height: 44 }}>
              <Icon name="heart" size={20} />
            </span>
            <h2>Nothing saved yet</h2>
            <p className="lead">Tap the heart on a Reality Card or a place. Every save teaches your vibe and, from three, suggests trips.</p>
            <Link to="/" className="btn" style={{ width: "auto" }}>
              Check a reel
            </Link>
          </div>
        ) : (
          <>
            {!picking && items.length < 3 && (
              <div className="tip">
                <span style={{ color: "var(--blue)", flex: "none" }}>
                  <Icon name="sparkle" size={18} />
                </span>
                <span>
                  <b>Magic trips</b> switch on at 3 saved places. {3 - items.length} more to go: we'll group what's near each other and write the trip in one tap.
                </span>
              </div>
            )}
            {!picking && items.length >= 3 && (
              <section className="stack" style={{ gap: 12 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h2>Magic trips</h2>
                  <div role="tablist" aria-label="Group by" className="seg">
                    {GROUPINGS.map((g) => (
                      <button key={g.id} role="tab" aria-selected={by === g.id} className={`seg-btn${by === g.id ? " on" : ""}`} onClick={() => setBy(g.id)}>
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <span className="small">Trip mood:</span>
                  {MOODS.map((m) => (
                    <button key={m.id} type="button" className={`chip${mood === m.id ? " on" : ""}`} style={{ height: 30, gap: 5, fontSize: 12 }} aria-pressed={mood === m.id} onClick={() => setMood(m.id)}>
                      <Icon name={MOOD_ICON[m.id]} size={13} />
                      {m.title}
                    </button>
                  ))}
                </div>
                {groups.filter((g) => g.places.length >= 2).map((g) => (
                  <GroupCard key={g.id} g={g} mood={mood} />
                ))}
                {groups.every((g) => g.places.length < 2) && (
                  <div className="small">No two saved places are grouped together yet. Try "Region", or pick places by hand.</div>
                )}
              </section>
            )}

            {picking && (
              <div className="tip">
                <span style={{ color: "var(--blue)", flex: "none" }}>
                  <Icon name="sparkle" size={18} />
                </span>
                <span>Choose the places for one trip, then plan it. Places far apart make a long trip.</span>
              </div>
            )}

            <section className="stack">
              <h2>
                Saved {items.length === 1 ? "place" : "places"} ({items.length})
              </h2>
              {items.map((p) => (
                <div key={p.id} className={`list-row${picked.has(p.id) ? " selected" : ""}`} style={{ padding: "10px 12px" }}>
                  {picking && <input type="checkbox" className="checkbox" checked={picked.has(p.id)} onChange={() => togglePick(p.id)} aria-label={`Include ${p.name}`} />}
                  <PlaceThumb q={q(p)} title={p.name} style={{ width: 52, height: 52 }} />
                  <Link
                    to={p.checkId ? `/check/${p.checkId}/place?name=${encodeURIComponent(p.name)}` : planUrl([p])}
                    style={{ flex: 1, minWidth: 0 }}
                    onClick={(e) => {
                      if (picking) {
                        e.preventDefault();
                        togglePick(p.id);
                      }
                    }}
                  >
                    <span className="row-title">{p.name}</span>
                    <span className="row-sub">
                      {[p.region, p.country].filter(Boolean).join(" · ")}
                    </span>
                    {p.vibe.length > 0 && <span className="row-sub taught">taught: {p.vibe.slice(0, 3).join(", ")}</span>}
                  </Link>
                  {!picking && (
                    <button className="heart on" aria-label={`Remove ${p.name}`} onClick={() => toggleSave(p)}>
                      <Icon name="heart" size={16} />
                    </button>
                  )}
                </div>
              ))}
            </section>
          </>
        )}
      </main>
      {picking ? (
        <div className="actionbar">
          <button className="btn" disabled={!picked.size} onClick={() => navigate(planUrl([], [...picked]))}>
            <Icon name="sparkle" size={18} />
            Plan a trip with {picked.size} {picked.size === 1 ? "place" : "places"}
          </button>
        </div>
      ) : (
        <TabBar />
      )}
    </>
  );
}

/** One group of saved places, with its Magic trip button. */
function GroupCard({ g, mood }: { g: PlaceGroup; mood: Mood }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = (p: SavedPlace) => [p.name, p.country].filter(Boolean).join(", ");
  const one = g.places.length === 1;

  async function magic() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { trip } = await tripsApi.createTrip({ placeIds: g.places.map((p) => p.id), mood, budgetMode: false, days: g.days });
      navigate(`/trips/${trip.id}`);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Couldn't write the trip. Try again.");
      setBusy(false);
    }
  }

  return (
    <section className="forming" aria-label={g.title}>
      <div className="forming-photos" style={one ? { gridTemplateColumns: "1fr", gridTemplateRows: "1fr" } : undefined}>
        {g.places.slice(0, 3).map((p, i) => (
          <PlaceThumb key={p.id} q={q(p)} title={p.name} style={{ width: "auto", height: "auto", borderRadius: 0, gridRow: i === 0 && !one ? "span 2" : undefined }} />
        ))}
      </div>
      <div className="stack" style={{ gap: 8, padding: "12px 14px 14px" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontFamily: "var(--display)", fontWeight: 800, letterSpacing: "-0.3px" }}>{g.title}</h3>
            <span className="small">
              {[g.sub, `${g.places.length} ${one ? "place" : "places"}`, `~${g.days} days`].filter(Boolean).join(" · ")}
            </span>
          </span>
          {g.vibe.length > 0 && <span className="badge soft" style={{ flex: "none", maxWidth: "45%", whiteSpace: "normal", textAlign: "right" }}>{g.vibe.join(" · ")}</span>}
        </div>
        <div className="chips" style={{ gap: 6 }}>
          {g.places.map((p) => (
            <span key={p.id} className="chip soft" style={{ height: 28, fontSize: 12 }}>
              {p.name}
            </span>
          ))}
        </div>
        {!one && <MapView points={toPoints(g.places)} height={110} />}
        {error && <div className="small" style={{ color: "var(--warn)" }}>{error}</div>}
        {busy ? (
          <Working label="Writing your trip" />
        ) : (
          <button className="btn" style={{ marginTop: 2 }} onClick={magic}>
            <Icon name="sparkle" size={18} />
            {one ? "Plan a trip here" : `Magic trip · ${g.places.length} places`}
          </button>
        )}
      </div>
    </section>
  );
}
