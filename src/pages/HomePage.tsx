import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import type { CheckSummary, ExploreItem, LinkErrorCode } from "../../shared/types";
import { api, ApiFailure, exploreApi } from "../api";
import { setExploreFeed } from "../explore-feed";
import { Icon } from "../components/Icon";
import { Img } from "../components/Img";
import { thumb, usePlaceGallery } from "../components/PlacePhoto";
import { TabBar } from "../components/TabBar";
import { Wordmark } from "../components/Wordmark";
import { AccountButton } from "../components/Account";
import { hasOnboarded } from "../auth";

const LINK_ERRORS: string[] = ["no_link", "unsupported_site", "profile_link", "unavailable", "daily_limit"] satisfies LinkErrorCode[];

export function HomePage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<CheckSummary[] | null>(null);
  const [trending, setTrending] = useState<ExploreItem[] | null>(null);
  const canPaste = typeof navigator !== "undefined" && !!navigator.clipboard?.readText;

  // First visit: the intro, once. Deep links (a shared check, a trip) never go through it.
  useEffect(() => {
    if (!hasOnboarded()) navigate("/welcome", { replace: true });
  }, [navigate]);

  useEffect(() => {
    api
      .listChecks()
      .then((r) => setRecent(r.items))
      .catch(() => setRecent([]));
    // What everyone is checking this week, from stored results only.
    exploreApi
      .list({ sort: "trending" })
      .then((r) => {
        const items = r.items.slice(0, 10);
        setTrending(items);
        setExploreFeed(items);
      })
      .catch(() => setTrending([]));
  }, []);

  async function submit(e?: FormEvent, value = input) {
    e?.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.startCheck(value);
      navigate(`/check/${id}`);
    } catch (err) {
      const f = err instanceof ApiFailure ? err : new ApiFailure("server_error", "Something went wrong. Try again.");
      setError({ code: f.code, message: f.message });
    } finally {
      setBusy(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInput(text);
        submit(undefined, text);
      }
    } catch {
      /* permission denied: the user can still paste manually */
    }
  }

  const showWorksWith = error && LINK_ERRORS.includes(error.code) && error.code !== "daily_limit";

  return (
    <>
    <main className="page home">
      <div className="topbar">
        <Wordmark />
        <AccountButton />
      </div>

      <section className="hero">
        <h1 className="hero-h">
          Saw it on a reel?
          <br />
          <em>See it for real.</em>
        </h1>
        <p className="lead">Paste a TikTok, Reel or Short. Get the truth: crowds, cost, best month.</p>
      </section>

      <form className="stack" onSubmit={submit} noValidate>
        <div className={`paste${error ? " error" : ""}`}>
          <span style={{ color: error ? "var(--warn)" : "var(--muted)", display: "flex" }}>
            <Icon name="link" />
          </span>
          <label htmlFor="reel" className="sr-only">
            Video link
          </label>
          <input
            id="reel"
            inputMode="url"
            autoComplete="off"
            placeholder="Paste a TikTok, Reel or Short link"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={!!error}
            aria-describedby={error ? "reel-error" : undefined}
          />
          {input ? (
            <button className="go" type="submit" disabled={busy}>
              {busy ? "Checking…" : "Check it"}
            </button>
          ) : canPaste ? (
            <button className="go" type="button" onClick={pasteFromClipboard}>
              Paste
            </button>
          ) : (
            <button className="go" type="submit" disabled>
              Check it
            </button>
          )}
        </div>
        {error ? (
          <div id="reel-error" role="alert" className="field-error">
            <span style={{ flex: "none", marginTop: 2 }}>
              <Icon name="alert" size={16} />
            </span>
            <span>{error.message}</span>
          </div>
        ) : (
          <p className="small row" style={{ margin: 0 }}>
            <Icon name="share" size={16} />
            On Android, tap Share → TrailZ inside TikTok, Instagram or YouTube.
          </p>
        )}
      </form>

      {showWorksWith && (
        <section className="stack" aria-label="Supported links">
          <div className="small" style={{ fontWeight: 600, letterSpacing: 1 }}>
            WORKS WITH
          </div>
          <div className="works-with">
            <div>
              TikTok<small>tiktok.com/@…</small>
            </div>
            <div>
              Reels<small>instagram.com/reel/…</small>
            </div>
            <div>
              Shorts<small>youtube.com/shorts/…</small>
            </div>
          </div>
        </section>
      )}

      <section className="stack" style={{ gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Trending this week</h2>
          <Link to="/explore" className="small" style={{ color: "var(--blue)", fontWeight: 500 }}>
            See all
          </Link>
        </div>
        <div className="reel-row">
          {trending === null
            ? Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton tile trend" />)
            : trending.length === 0
              ? <div className="empty" style={{ flex: 1 }}>Be the first: every reel you check shows up here for everyone.</div>
              : trending.map((it) => <TrendCard key={it.id} it={it} />)}
        </div>
      </section>

      {recent !== null && recent.length === 0 ? (
        <section className="stack" style={{ gap: 10 }}>
          <h2 style={{ margin: 0 }}>How it works</h2>
          <ol className="how">
            <li><div><b>Paste a link</b><span>any TikTok, Reel or Short</span></div></li>
            <li><div><b>Get the Reality Card</b><span>how real it is, when to go, what it costs</span></div></li>
            <li><div><b>Save → trip → book</b><span>your saves become a plan with real prices</span></div></li>
          </ol>
        </section>
      ) : (
      <section className="stack">
        <h2>Your recent checks</h2>
        {recent === null ? (
          <div className="skeleton" style={{ height: 76 }} />
        ) : (
          recent.map((r) => (
            <Link key={r.id} to={`/check/${r.id}`} className="list-row">
              {r.video.thumbnailUrl || !r.photoQuery ? (
                <Img src={r.video.thumbnailUrl} className="thumb" />
              ) : (
                <RecentPhoto q={r.photoQuery} />
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="row-title">{r.label}</span>
                <span className="row-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[r.kind, r.video.author].filter(Boolean).join(" · ")}
                </span>
              </span>
              <Icon name="chevron" size={18} />
            </Link>
          ))
        )}
      </section>
      )}
    </main>
      <TabBar />
    </>
  );
}

/** The reel has no cover: show a photo of its main place instead (not clickable here, the row is the link). */
function RecentPhoto({ q }: { q: string }) {
  const { photos } = usePlaceGallery(q);
  return <Img src={photos[0] ? thumb(photos[0].url, 200) : undefined} className="thumb" />;
}

/** One trending reel: cover, score, place. Tap plays it. */
function TrendCard({ it }: { it: ExploreItem }) {
  const { photos } = usePlaceGallery(it.cover ? null : it.photoQuery);
  const src = it.cover ?? (photos[0] ? thumb(photos[0].url, 400) : null);
  const title = it.outcome === "multi" ? it.sub || it.title : it.title;
  const sub = it.outcome === "multi" ? it.title : it.outcome === "vibe" ? it.sub : it.country ?? it.sub;
  return (
    <Link to={`/explore/reel/${it.id}`} className="tile trend" aria-label={`Watch: ${title}`}>
      <Img src={src} style={{ position: "absolute", inset: 0 }} />
      <span className="tile-shade" />
      {it.authenticity !== null && <span className={`reel-score ${it.authenticity >= 7 ? "good" : it.authenticity >= 5 ? "mid" : "low"}`}>{it.authenticity}/10</span>}
      {it.outcome === "multi" && <span className="reel-score">{it.title}</span>}
      <span className="tile-play" aria-hidden="true">
        <Icon name="play" size={14} />
      </span>
      <span className="tile-text">
        <b>{title}</b>
        <span>{sub}</span>
        {it.checks7d > 1 && (
          <span className="tile-facts">
            <span>{it.checks7d} this week</span>
          </span>
        )}
      </span>
    </Link>
  );
}
