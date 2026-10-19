import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { CheckResult, CheckStatus, PlaceRef } from "../../shared/types";
import { api, prefetchCards } from "../api";
import { Icon } from "./Icon";
import { Img } from "./Img";
import { MapView, toPoints } from "./MapView";
import { planUrl } from "../plan-url";
import { PhotoStrip, PlaceThumb } from "./PlacePhoto";
import { SaveButton } from "./SaveButton";
import { platformLabel, VideoChip } from "./VideoChip";
import { TabBar } from "./TabBar";

type Of<T extends CheckResult["outcome"]> = Extract<CheckResult, { outcome: T }>;

const placeUrl = (id: string, name: string, typed = false) =>
  `/check/${id}/place?name=${encodeURIComponent(name)}${typed ? "&typed=1" : ""}`;

function TopBar({ check, back = "/" }: { check: CheckStatus; back?: string }) {
  return (
    <div className="topbar">
      <Link to={back} className="icon-btn plain" aria-label="Back">
        <Icon name="back" size={22} />
      </Link>
      <span className="meta">{platformLabel(check.video)}</span>
      <span style={{ width: 44 }} />
    </div>
  );
}

function WrongLink({ id }: { id: string }) {
  const [sent, setSent] = useState(false);
  return (
    <button
      className="linkish"
      onClick={() => api.reportWrong(id).then(() => setSent(true)).catch(() => setSent(true))}
      disabled={sent}
    >
      {sent ? "Thanks, we'll review it" : "We got this wrong"}
    </button>
  );
}

// ---------------- Not a travel video ----------------
export function NotTravelView({ check, result }: { check: CheckStatus; result: Of<"not_travel"> }) {
  return (
    <main className="page">
      <TopBar check={check} />
      <VideoChip video={check.video} />
      <div className="stack" style={{ gap: 10, paddingTop: 6 }}>
        <span
          style={{ width: 56, height: 56, borderRadius: 18, background: "var(--seg)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="noPin" size={28} strokeWidth={1.8} />
        </span>
        <h1>{result.kind === "tips" ? "These are travel tips, not a place" : "This doesn’t look like a travel video"}</h1>
      </div>
      <section className="card stack" style={{ gap: 8 }}>
        <h2 style={{ fontSize: 13, color: "var(--muted)" }}>What we saw</h2>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{result.whatWeSaw}</p>
      </section>
      <div className="stack">
        <Link to={`/check/${check.id}/where`} className="btn">
          <Icon name="pin" size={18} />
          It is a place, let me say where
        </Link>
        <Link to="/" className="btn secondary">
          Try another link
        </Link>
      </div>
      <div className="footer-note">
        <span>Not counted toward your daily checks</span>
        <WrongLink id={check.id} />
      </div>
    </main>
  );
}

// ---------------- Is it one of these? ----------------
export function PickView({ check, result }: { check: CheckStatus; result: Of<"pick"> }) {
  const navigate = useNavigate();
  const [choice, setChoice] = useState<number>(0);
  const [typed, setTyped] = useState("");
  const one = result.candidates.length === 1;

  return (
    <main className="page" style={{ gap: 18 }}>
      <TopBar check={check} />
      <div className="row" style={{ gap: 14 }}>
        <Img src={check.video.thumbnailUrl} className="thumb" style={{ width: 64, height: 86 }} />
        <div>
          <h1 style={{ fontSize: 28 }}>{one ? "Is this the place?" : "Is it one of these?"}</h1>
          <div className="small" style={{ marginTop: 4 }}>{result.whatWeSaw}</div>
        </div>
      </div>

      <fieldset className="stack" style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="sr-only">Choose the place</legend>
        {result.candidates.map((p, i) => (
          <label key={p.name} className={`list-row${choice === i && !typed ? " selected" : ""}`}>
            <input
              type="radio"
              name="place"
              className="checkbox"
              checked={choice === i && !typed}
              onChange={() => {
                setChoice(i);
                setTyped("");
              }}
            />
            <PlaceThumb q={[p.name, p.country ?? p.region].filter(Boolean).join(", ")} title={p.name} style={{ width: 48, height: 48 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="row-title">{[p.name, p.country].filter(Boolean).join(", ")}</span>
              <span className="row-sub">{p.evidence ?? p.region}</span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: i === 0 ? "var(--blue)" : "var(--muted)" }}>
              {i === 0 ? "Likely" : "Maybe"}
            </span>
          </label>
        ))}
      </fieldset>

      <section className="card dashed stack">
        <h2 style={{ fontSize: 14 }}>{one ? "Not this one?" : "None of these?"}</h2>
        <label htmlFor="typed-place" className="sr-only">
          Type the place name
        </label>
        <input
          id="typed-place"
          placeholder="Type the place name"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          style={{ height: 46, borderRadius: 12, border: "1px solid var(--line-strong)", padding: "0 12px", fontSize: 15 }}
        />
      </section>

      <div className="stack" style={{ marginTop: "auto" }}>
        <button
          className="btn"
          onClick={() =>
            navigate(typed.trim() ? placeUrl(check.id, typed.trim(), true) : placeUrl(check.id, result.candidates[choice].name))
          }
        >
          Show the Reality Card
          <Icon name="arrow" size={18} />
        </button>
        <div className="small" style={{ textAlign: "center" }}>
          Your answer helps TrailZ get better for everyone.
        </div>
      </div>
    </main>
  );
}

// ---------------- No exact spot: places with this vibe ----------------
export function VibeView({ check, result }: { check: CheckStatus; result: Of<"vibe"> }) {
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  // Start the Reality Cards now, so tapping a place opens it straight away.
  const names = result.suggestions.map((s) => `${s.name}, ${s.country}`).join("|");
  useEffect(() => {
    prefetchCards(check.id, names ? names.split("|") : []);
  }, [check.id, names]);
  return (
    <main className="page" style={{ gap: 18 }}>
      <TopBar check={check} />
      <VideoChip video={check.video} />
      <div className="stack" style={{ gap: 8 }}>
        <span className="badge soft" style={{ alignSelf: "flex-start", fontSize: 12, borderRadius: 999, padding: "4px 10px" }}>
          No exact spot found
        </span>
        <h1 style={{ fontSize: 28 }}>We can’t pin the spot, but we know the vibe</h1>
      </div>
      {(result.filmedIn || result.vibe.length > 0) && (
        <div className="chips">
          {result.filmedIn && (
            <span className="chip" style={{ fontWeight: 600 }}>
              <Icon name="pin" size={14} /> Filmed in {result.filmedIn}
            </span>
          )}
          {result.vibe.map((v) => (
            <span key={v} className="chip soft">
              {v}
            </span>
          ))}
        </div>
      )}
      <section className="stack" style={{ gap: 12 }}>
        <h2>
          {result.suggestions.length} real {result.suggestions.length === 1 ? "place" : "places"} with this vibe
        </h2>
        <span className="small" style={{ marginTop: -6 }}>
          Swipe the photos, tap one to see it big.
        </span>
        <MapView points={toPoints(result.suggestions)} height={180} />
        {result.suggestions.map((s, i) => {
          const q = `${s.name}, ${s.country}`;
          const to = placeUrl(check.id, q);
          return (
            <article key={s.name} className="card place-card">
              <PhotoStrip q={q} title={s.name} height={150} cardTo={to} />
              <Link to={to} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                <span className="num">{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="row-title">{s.name}</span>
                  <span className="row-sub">
                    {s.country} · {s.why}
                  </span>
                </span>
                <span className={`badge ${s.authenticity >= 7 ? "real" : "reel"}`}>{s.authenticity}/10</span>
              </Link>
              <div className="row" style={{ gap: 8 }}>
                <SaveButton compact place={{ name: s.name, country: s.country, lat: s.lat ?? null, lng: s.lng ?? null, vibe: result.vibe, checkId: check.id, authenticity: s.authenticity }} />
                <Link to={to} className="btn secondary" style={{ height: 44, flex: 1 }}>
                  See the Reality Card <Icon name="arrow" size={16} />
                </Link>
              </div>
            </article>
          );
        })}
      </section>
      <form
        className="card dashed stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) navigate(placeUrl(check.id, typed.trim(), true));
        }}
      >
        <h2 style={{ fontSize: 14 }}>Know where it is?</h2>
        <div className="row" style={{ gap: 8 }}>
          <label htmlFor="knows" className="sr-only">
            Place name
          </label>
          <input
            id="knows"
            placeholder="Type the place name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 12, border: "1px solid var(--line-strong)", padding: "0 12px", fontSize: 15 }}
          />
          <button className="btn" style={{ width: "auto", height: 44, borderRadius: 12 }} type="submit">
            Find
          </button>
        </div>
      </form>
    </main>
  );
}

// ---------------- Many places in one reel ----------------
export function MultiView({ check, result }: { check: CheckStatus; result: Of<"multi"> }) {
  const [region, setRegion] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(result.regions[0]?.placeIndexes ?? []));
  const [showAll, setShowAll] = useState(false);
  // Start the first places' Reality Cards in the background (more would cost AI calls nobody uses).
  const firstNames = result.places.slice(0, 3).map((p) => p.name).join("|");
  useEffect(() => {
    prefetchCards(check.id, firstNames ? firstNames.split("|") : []);
  }, [check.id, firstNames]);

  const visible = useMemo(() => {
    const idx = region === null ? result.places.map((_, i) => i) : result.regions[region].placeIndexes;
    return showAll || region !== null ? idx : idx.slice(0, 5);
  }, [region, showAll, result]);
  const hiddenCount = (region === null ? result.places.length : result.regions[region].placeIndexes.length) - visible.length;

  const toggle = (i: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <>
      <main className="page" style={{ gap: 16 }}>
        <TopBar check={check} />
        <div>
          {check.video.title && <div className="small">“{check.video.title}”</div>}
          <h1 style={{ marginTop: 4 }}>
            This reel shows {result.places.length} places
            {result.regions.length > 1 ? ` in ${result.regions.length} regions` : ""}
          </h1>
          {result.skippedClips > 0 && (
            <div className="small" style={{ marginTop: 6 }}>
              {result.skippedClips} {result.skippedClips === 1 ? "clip had" : "clips had"} no recognizable place and{" "}
              {result.skippedClips === 1 ? "was" : "were"} skipped
            </div>
          )}
        </div>

        <MapView points={toPoints(result.places, (i) => selected.has(i))} />

        {result.regions.length > 1 && (
          <div role="tablist" aria-label="Regions" className="chips" style={{ flexWrap: "nowrap", overflowX: "auto", paddingBottom: 2 }}>
            <button role="tab" aria-selected={region === null} className={`chip${region === null ? " on" : ""}`} onClick={() => setRegion(null)}>
              All {result.places.length}
            </button>
            {result.regions.map((r, ri) => (
              <button
                key={r.name + ri}
                role="tab"
                aria-selected={region === ri}
                className={`chip${region === ri ? " on" : ""}`}
                style={{ flex: "none" }}
                onClick={() => setRegion(ri)}
              >
                {r.name} {r.placeIndexes.length}
              </button>
            ))}
          </div>
        )}

        <div className="tip">
          <span style={{ color: "var(--blue)", flex: "none", marginTop: 1 }}>
            <Icon name="sparkle" size={18} />
          </span>
          <span>{result.advice}</span>
        </div>

        <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 8 }}>
          {visible.map((i) => (
            <PlaceRow key={i} place={result.places[i]} index={i} checked={selected.has(i)} onToggle={() => toggle(i)} checkId={check.id} />
          ))}
          {hiddenCount > 0 && (
            <li style={{ textAlign: "center" }}>
              <button className="btn link" onClick={() => setShowAll(true)}>
                Show all {result.places.length} places
              </button>
            </li>
          )}
        </ul>
      </main>
      <div className="actionbar col above-tabs">
        <Link
          className={`btn${selected.size ? "" : " disabled"}`}
          to={planUrl(
            [...selected].map((i) => {
              const p = result.places[i];
              return { name: p.name, region: p.region ?? null, country: p.country ?? null, lat: p.lat ?? null, lng: p.lng ?? null, vibe: [], checkId: check.id, authenticity: null };
            }),
          )}
          onClick={(e) => !selected.size && e.preventDefault()}
        >
          <Icon name="sparkle" size={18} />
          Plan a trip with {selected.size} {selected.size === 1 ? "place" : "places"}
        </Link>
        <span className="small" style={{ textAlign: "center" }}>
          Tap a place to see its Reality Card
        </span>
      </div>
      <TabBar />
    </>
  );
}

function PlaceRow({
  place,
  index,
  checked,
  onToggle,
  checkId,
}: {
  place: PlaceRef;
  index: number;
  checked: boolean;
  onToggle: () => void;
  checkId: string;
}) {
  return (
    <li className={`list-row${checked ? " selected" : ""}`} style={{ padding: "10px 12px" }}>
      <input
        type="checkbox"
        className="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={`Include ${place.name} in the route`}
      />
      <span className={`num${checked ? " sel" : ""}`}>{index + 1}</span>
      <PlaceThumb
        q={[place.name, place.country ?? place.region].filter(Boolean).join(", ")}
        title={place.name}
        cardTo={placeUrl(checkId, place.name)}
        style={{ width: 48, height: 48 }}
      />
      <Link to={placeUrl(checkId, place.name)} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="row-title" style={{ fontSize: 14 }}>
            {place.name}
          </span>
          {place.creatorLabel ? (
            <span className="row-sub" style={{ color: "var(--warn)" }}>
              Creator says {place.creatorLabel}, it looks like {place.name}
            </span>
          ) : (
            <span className="row-sub">{[place.region, place.country].filter(Boolean).join(" · ")}</span>
          )}
        </span>
        <span style={{ textAlign: "right", flex: "none" }}>
          {place.t && <span className="row-sub">{place.t}</span>}
          <span className="row-sub" style={{ color: "var(--navy)" }}>
            <Icon name="chevron" size={16} />
          </span>
        </span>
      </Link>
      <SaveButton compact place={{ name: place.name, region: place.region ?? null, country: place.country ?? null, lat: place.lat ?? null, lng: place.lng ?? null, vibe: [], checkId, authenticity: null }} />
    </li>
  );
}

