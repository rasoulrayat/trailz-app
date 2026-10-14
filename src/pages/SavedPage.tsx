import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { SavedPlace, TripSuggestion } from "../../shared/types";
import { Icon } from "../components/Icon";
import { MapView, toPoints } from "../components/MapView";
import { PlaceThumb } from "../components/PlacePhoto";
import { TabBar } from "../components/TabBar";
import { planUrl } from "../plan-url";
import { toggleSave, useSaves } from "../saves";

const q = (p: SavedPlace) => [p.name, p.country].filter(Boolean).join(", ");

export function SavedPage() {
  const { items, suggestions, loaded } = useSaves();
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

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
          <h1>Saved</h1>
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

        {!loaded ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : items.length === 0 ? (
          <div className="card stack" style={{ padding: 18, alignItems: "center", textAlign: "center", gap: 8 }}>
            <span className="heart on" style={{ width: 44, height: 44 }}>
              <Icon name="heart" size={20} />
            </span>
            <h2>Nothing saved yet</h2>
            <p className="lead">Tap the heart on a Reality Card or a place. After a few saves, we'll know your vibe and suggest trips.</p>
            <Link to="/" className="btn" style={{ width: "auto" }}>
              Check a reel
            </Link>
          </div>
        ) : (
          <>
            {!picking && suggestions.map((s) => <Forming key={s.placeIds.join()} s={s} places={items} />)}

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
                {items.length} {items.length === 1 ? "place" : "places"}
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
                      {p.vibe.length ? ` · ${p.vibe.slice(0, 2).join(", ")}` : ""}
                    </span>
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

/** "A trip is forming": saved places that are close together, with the vibe they share. */
function Forming({ s, places }: { s: TripSuggestion; places: SavedPlace[] }) {
  const members = s.placeIds.map((id) => places.find((p) => p.id === id)).filter((p): p is SavedPlace => !!p);
  return (
    <section className="forming">
      <div className="forming-photos">
        {members.slice(0, 3).map((p, i) => (
          <PlaceThumb key={p.id} q={q(p)} title={p.name} style={{ width: "auto", height: "auto", borderRadius: 0, gridRow: i === 0 ? "span 2" : undefined }} />
        ))}
      </div>
      <div className="stack" style={{ gap: 6, padding: "12px 14px 14px" }}>
        <span className="badge soft-real" style={{ alignSelf: "flex-start" }}>
          <Icon name="sparkle" size={12} /> A trip is forming
        </span>
        <h2 style={{ fontSize: 20, fontFamily: "var(--display)" }}>{s.title}</h2>
        <div className="small">
          {[s.country, `${members.length} places`, `~${s.days} days`, s.vibe.length ? `your vibe: ${s.vibe.join(", ")}` : null].filter(Boolean).join(" · ")}
        </div>
        <MapView points={toPoints(members)} height={120} />
        <Link to={planUrl([], s.placeIds)} className="btn" style={{ marginTop: 4 }}>
          <Icon name="sparkle" size={18} />
          Plan this trip
        </Link>
      </div>
    </section>
  );
}
