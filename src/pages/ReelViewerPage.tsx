import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { ExploreItem } from "../../shared/types";
import { api, exploreApi } from "../api";
import { Icon } from "../components/Icon";
import { Img } from "../components/Img";
import { usePlaceGallery } from "../components/PlacePhoto";
import { embedUrl, platformLabel } from "../components/VideoChip";
import { getExploreFeed, setExploreFeed } from "../explore-feed";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Video first: a full-screen, swipeable viewer over the Explore list.
 * Only the reel on screen plays (muted, looping); its neighbours show their cover,
 * so one tap shows the reel and one swipe shows the next.
 */
export function ReelViewerPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState<ExploreItem[]>(() => getExploreFeed());
  const [missing, setMissing] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, getExploreFeed().findIndex((it) => it.id === id)));
  const [sound, setSound] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  // Arrived by link (or after a reload): rebuild the list, and if this reel is not in it, show it alone.
  useEffect(() => {
    if (items.some((it) => it.id === id)) return;
    let live = true;
    exploreApi
      .list({ sort: "trending" })
      .then(async (r) => {
        if (!live) return;
        let list = r.items;
        if (!list.some((it) => it.id === id)) {
          const c = await api.getCheck(id).catch(() => null);
          if (!c) {
            setMissing(true);
            return;
          }
          const one: ExploreItem = {
            id: c.id, outcome: "single", video: c.video, cover: c.video.thumbnailUrl ?? null, photoQuery: null,
            title: c.video.title ?? "This reel", sub: platformLabel(c.video), country: null, vibe: [], authenticity: null,
            costFrom: null, bestMonths: [], checks: 1, checks7d: 0, saves: 0, author: c.video.author ?? null, vibeMatch: 0, nearKm: null, createdAt: Date.now(),
          };
          list = [one, ...list];
        }
        setExploreFeed(list);
        setItems(list);
        setActive(Math.max(0, list.findIndex((it) => it.id === id)));
      })
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [id, items]);

  // Start on the tapped reel without animating past the ones before it.
  useEffect(() => {
    const el = track.current;
    if (!el || !items.length) return;
    el.scrollTo({ top: active * el.clientHeight, behavior: "instant" as ScrollBehavior });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  // Which slide is on screen decides which reel plays.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const i = Math.round(el.scrollTop / Math.max(1, el.clientHeight));
        setActive((a) => (a === i ? a : i));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [items.length]);

  // Keep the URL on the reel being watched, so sharing or refreshing lands here.
  useEffect(() => {
    const it = items[active];
    if (it && it.id !== id) navigate(`/explore/reel/${it.id}`, { replace: true });
  }, [active, items, id, navigate]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate("/explore");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const el = track.current;
        el?.scrollBy({ top: (e.key === "ArrowDown" ? 1 : -1) * el.clientHeight, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [navigate]);

  const close = useCallback(() => (window.history.length > 1 ? navigate(-1) : navigate("/explore")), [navigate]);

  if (missing)
    return (
      <div className="reels" role="dialog" aria-label="Reel">
        <div className="reels-top">
          <button className="icon-btn on-media" aria-label="Back" onClick={close}>
            <Icon name="back" />
          </button>
        </div>
        <div className="stack" style={{ margin: "auto", alignItems: "center", textAlign: "center", padding: 20 }}>
          <h2 style={{ color: "#fff" }}>This reel isn't here any more</h2>
          <Link to="/explore" className="btn" style={{ width: "auto" }}>Back to Explore</Link>
        </div>
      </div>
    );

  return (
    <div className="reels" role="dialog" aria-modal="true" aria-label="Watch reels">
      <div className="reels-top">
        <button className="icon-btn on-media" aria-label="Back to Explore" onClick={close} autoFocus>
          <Icon name="back" />
        </button>
        <span className="reels-count">{items.length ? `${Math.min(active + 1, items.length)} / ${items.length}` : ""}</span>
        <button className={`icon-btn on-media${sound ? " on" : ""}`} aria-label={sound ? "Mute" : "Sound on"} aria-pressed={sound} onClick={() => setSound((s) => !s)}>
          <Icon name={sound ? "volume" : "mute"} />
        </button>
      </div>
      <div className="reels-track" ref={track}>
        {items.map((it, i) => (
          <Slide key={it.id} it={it} state={i === active ? "active" : Math.abs(i - active) <= 1 ? "near" : "far"} sound={sound} first={i === 0 && items.length > 1} />
        ))}
      </div>
    </div>
  );
}

function Slide({ it, state, sound, first }: { it: ExploreItem; state: "active" | "near" | "far"; sound: boolean; first: boolean }) {
  const { photos } = usePlaceGallery(it.cover || state === "far" ? null : it.photoQuery);
  const cover = it.cover || it.video.thumbnailUrl || photos[0]?.url || null;
  const src = useMemo(() => (state === "active" ? embedUrl(it.video, { muted: !sound }) : null), [it.video, state, sound]);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(false), [src]);

  const title = it.outcome === "multi" ? it.sub || it.title : it.title;
  const sub = it.outcome === "multi" ? it.title : it.outcome === "vibe" ? it.sub : it.country ?? it.sub;
  const facts = [
    it.costFrom ? `from €${it.costFrom}` : null,
    it.bestMonths.length ? `best ${it.bestMonths.slice(0, 3).map((m) => MONTHS[m - 1]).join(" · ")}` : null,
    it.checks7d > 1 ? `${it.checks7d} checked this week` : it.saves > 0 ? `${it.saves} saved` : null,
  ].filter(Boolean) as string[];

  return (
    <section className="reel-slide" aria-label={title}>
      {state !== "far" && cover && <Img src={cover} className="reel-bg" />}
      <div className="reel-stage">
        {state !== "far" && cover && <Img src={cover} className={`reel-cover${ready ? " hide" : ""}`} />}
        {src ? (
          <iframe
            src={src}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setReady(true)}
          />
        ) : (
          state !== "far" && (
            <span className="play-badge big" aria-hidden="true">
              <Icon name="play" size={28} />
            </span>
          )
        )}
        {state === "active" && !src && <p className="reel-note">This reel can't play here — open it in {platformLabel({ ...it.video, author: null })}.</p>}
      </div>
      <div className="reel-overlay">
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {it.authenticity !== null && <span className={`reel-score static ${it.authenticity >= 7 ? "good" : it.authenticity >= 5 ? "mid" : "low"}`}>{it.authenticity}/10 real</span>}
          {it.outcome === "multi" && <span className="reel-score static">{it.title}</span>}
          {it.vibeMatch >= 0.5 && (
            <span className="reel-score static" style={{ background: "var(--sky)", color: "var(--navy)" }}>
              <Icon name="sparkle" size={10} /> your vibe
            </span>
          )}
        </div>
        <h2 className="reel-h">{title}</h2>
        {sub && <div className="reel-s">{sub}</div>}
        {facts.length > 0 && (
          <div className="tile-facts" style={{ marginTop: 6 }}>
            {facts.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <Link to={`/check/${it.id}`} className="btn" style={{ flex: 1 }}>
            See the Reality Card <Icon name="arrow" size={16} />
          </Link>
          <a href={it.video.url} target="_blank" rel="noopener noreferrer" className="icon-btn on-media" aria-label={`Open in ${platformLabel({ ...it.video, author: null })}`} style={{ width: 48, height: 48 }}>
            <Icon name="external" size={18} />
          </a>
        </div>
        <div className="reel-by">{platformLabel(it.video)}</div>
        {first && (
          <div className="reel-hint" aria-hidden="true">
            <Icon name="chevron-up" size={14} /> swipe up for the next reel
          </div>
        )}
      </div>
    </section>
  );
}
