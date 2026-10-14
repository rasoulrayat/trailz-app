import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import type { ExploreItem } from "../../shared/types";
import { exploreApi } from "../api";
import { Icon } from "../components/Icon";
import { Img } from "../components/Img";
import { thumb, usePlaceGallery } from "../components/PlacePhoto";
import { TabBar } from "../components/TabBar";
import { setExploreFeed } from "../explore-feed";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BUDGETS = [300, 500, 800];
const SORTS: { id: string; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "new", label: "New" },
  { id: "real", label: "Most real" },
];

/** Reels everyone has checked, from stored results only. Filters never call an outside service. */
export function ExplorePage() {
  const [items, setItems] = useState<ExploreItem[] | null>(null);
  const [myVibe, setMyVibe] = useState<string[]>([]);
  const [hasSaves, setHasSaves] = useState(false);
  const [vibe, setVibe] = useState(false);
  const [near, setNear] = useState(false);
  const [month, setMonth] = useState(0);
  const [budget, setBudget] = useState(0);
  const [sort, setSort] = useState("trending");
  const [q, setQ] = useState("");
  const [monthOpen, setMonthOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);

  const params = useMemo(() => {
    const p: Record<string, string> = { sort };
    if (vibe) p.vibe = "1";
    if (near) p.near = "1";
    if (month) p.month = String(month);
    if (budget) p.budget = String(budget);
    if (q.trim()) p.q = q.trim();
    return p;
  }, [vibe, near, month, budget, sort, q]);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      exploreApi
        .list(params)
        .then((r) => {
          if (!live) return;
          setItems(r.items);
          setExploreFeed(r.items);
          setMyVibe(r.myVibe);
          setHasSaves(r.hasSaves);
        })
        .catch(() => live && setItems([]));
    }, q ? 250 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [params, q]);

  const now = new Date().getMonth() + 1;
  return (
    <>
      <main className="page" style={{ gap: 14 }}>
        <div className="topbar">
          <h1>Explore</h1>
          <span className="small">{items ? `${items.length} reels` : ""}</span>
        </div>

        <label className="search">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Place, country or vibe" aria-label="Search reels" />
          {q && (
            <button className="icon-btn plain" style={{ width: 28, height: 28 }} aria-label="Clear" onClick={() => setQ("")}>
              ×
            </button>
          )}
        </label>

        <div className="chips scroll" style={{ gap: 6 }}>
          <button className={`chip${vibe ? " on" : ""}`} aria-pressed={vibe} disabled={!myVibe.length} title={myVibe.length ? `Your vibe: ${myVibe.join(", ")}` : "Save a few places first"} onClick={() => setVibe((v) => !v)}>
            <Icon name="sparkle" size={13} /> My vibe
          </button>
          <button className={`chip${near ? " on" : ""}`} aria-pressed={near} disabled={!hasSaves} title={hasSaves ? "Within 400 km of a place you saved" : "Save a place first"} onClick={() => setNear((v) => !v)}>
            <Icon name="pin" size={13} /> Near my places
          </button>
          <button className={`chip${month ? " on" : ""}`} aria-expanded={monthOpen} onClick={() => { setMonthOpen((v) => !v); setBudgetOpen(false); }}>
            <Icon name="calendar" size={13} /> {month ? `Good in ${MONTHS[month - 1]}` : "Good in…"}
          </button>
          <button className={`chip${budget ? " on" : ""}`} aria-expanded={budgetOpen} onClick={() => { setBudgetOpen((v) => !v); setMonthOpen(false); }}>
            <Icon name="euro" size={13} /> {budget ? `Under €${budget}` : "Budget"}
          </button>
        </div>
        {monthOpen && (
          <div className="chips" style={{ gap: 6 }}>
            <button className={`chip${!month ? " on" : ""}`} onClick={() => { setMonth(0); setMonthOpen(false); }}>Any month</button>
            {Array.from({ length: 6 }, (_, i) => ((now - 1 + i) % 12) + 1).map((m) => (
              <button key={m} className={`chip${month === m ? " on" : ""}`} onClick={() => { setMonth(m); setMonthOpen(false); }}>
                {MONTHS[m - 1]}{m === now ? " (now)" : ""}
              </button>
            ))}
          </div>
        )}
        {budgetOpen && (
          <div className="chips" style={{ gap: 6 }}>
            <button className={`chip${!budget ? " on" : ""}`} onClick={() => { setBudget(0); setBudgetOpen(false); }}>Any</button>
            {BUDGETS.map((b) => (
              <button key={b} className={`chip${budget === b ? " on" : ""}`} onClick={() => { setBudget(b); setBudgetOpen(false); }}>
                Under €{b} <span className="small" style={{ marginLeft: 4 }}>per person</span>
              </button>
            ))}
          </div>
        )}

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <div role="tablist" className="seg">
            {SORTS.map((s) => (
              <button key={s.id} role="tab" aria-selected={sort === s.id} className={`seg-btn${sort === s.id ? " on" : ""}`} onClick={() => setSort(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {items === null ? (
          <div className="mosaic">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className={`skeleton tile${i === 1 ? " big" : ""}`} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="card stack" style={{ padding: 18, alignItems: "center", textAlign: "center", gap: 8 }}>
            <span className="mood-icon">
              <Icon name="compass" size={22} />
            </span>
            <h2>Nothing here yet</h2>
            <p className="lead">{month || budget || vibe || near || q ? "Loosen a filter, or check a reel: it joins Explore for everyone." : "Every reel anyone checks appears here. Be the first."}</p>
            <Link to="/" className="btn" style={{ width: "auto" }}>Check a reel</Link>
          </div>
        ) : (
          <div className="mosaic">
            {items.map((it, i) => (
              <Tile key={it.id} it={it} month={month} big={i % 7 === 1} />
            ))}
          </div>
        )}
      </main>
      <TabBar />
    </>
  );
}

/** One mosaic tile: picture first, the three deciding facts on top. Tap plays the reel. */
function Tile({ it, month, big }: { it: ExploreItem; month: number; big: boolean }) {
  const { photos } = usePlaceGallery(it.cover ? null : it.photoQuery);
  const src = it.cover ?? (photos[0] ? thumb(photos[0].url, big ? 640 : 400) : null);
  const when = month && it.monthRating ? (it.monthRating === "best" ? `best in ${MONTHS[month - 1]}` : `good in ${MONTHS[month - 1]}`) : it.bestMonths.length ? `best ${it.bestMonths.slice(0, 2).map((m) => MONTHS[m - 1]).join("/")}` : null;
  const title = it.outcome === "multi" ? it.sub || it.title : it.title;
  const sub = it.outcome === "multi" ? it.title : it.outcome === "vibe" ? it.sub : it.country ?? it.sub;
  return (
    <Link to={`/explore/reel/${it.id}`} className={`tile${big ? " big" : ""}`} aria-label={`Watch: ${title}${it.authenticity !== null ? `, ${it.authenticity} of 10 real` : ""}`}>
      <Img src={src} style={{ position: "absolute", inset: 0 }} />
      <span className="tile-shade" />
      <span className="tile-play" aria-hidden="true">
        <Icon name="play" size={big ? 22 : 14} />
      </span>
      {it.authenticity !== null && <span className={`reel-score ${it.authenticity >= 7 ? "good" : it.authenticity >= 5 ? "mid" : "low"}`}>{it.authenticity}/10</span>}
      {it.outcome === "multi" && <span className="reel-score">{it.title}</span>}
      {it.vibeMatch >= 0.5 && (
        <span className="reel-tag">
          <Icon name="sparkle" size={10} /> your vibe
        </span>
      )}
      <span className="tile-text">
        <b>{title}</b>
        <span>{sub}</span>
        {big && (
          <span className="tile-facts">
            {it.costFrom ? <span>from €{it.costFrom}</span> : null}
            {when ? <span>{when}</span> : null}
            {it.checks7d > 1 ? <span>{it.checks7d} this week</span> : null}
          </span>
        )}
        {!big && (it.costFrom || when) && (
          <span className="tile-facts">
            <span>{month && when ? when : it.costFrom ? `€${it.costFrom}+` : when}</span>
          </span>
        )}
      </span>
    </Link>
  );
}
