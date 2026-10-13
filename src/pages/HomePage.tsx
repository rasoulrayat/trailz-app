import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import type { CheckSummary, LinkErrorCode } from "../../shared/types";
import { api, ApiFailure } from "../api";
import { Icon } from "../components/Icon";
import { Wordmark } from "../components/Wordmark";

const LINK_ERRORS: string[] = ["no_link", "unsupported_site", "profile_link", "unavailable", "daily_limit"] satisfies LinkErrorCode[];

export function HomePage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<CheckSummary[] | null>(null);
  const canPaste = typeof navigator !== "undefined" && !!navigator.clipboard?.readText;

  useEffect(() => {
    api
      .listChecks()
      .then((r) => setRecent(r.items))
      .catch(() => setRecent([]));
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
    <main className="page">
      <div className="topbar">
        <Wordmark />
      </div>

      <h1>Saw it on a reel? See it for real.</h1>

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

      <section className="stack">
        <h2>Your recent checks</h2>
        {recent === null ? (
          <div className="skeleton" style={{ height: 76 }} />
        ) : recent.length === 0 ? (
          <div className="empty">Your checked reels will show up here.</div>
        ) : (
          recent.map((r) => (
            <Link key={r.id} to={`/check/${r.id}`} className="list-row">
              <span
                className="thumb"
                style={r.video.thumbnailUrl ? { backgroundImage: `url("${r.video.thumbnailUrl}")` } : undefined}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="row-title">{r.label}</span>
                <span className="row-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.video.author ?? r.video.platform} · {r.video.title ?? r.video.url}
                </span>
              </span>
              <Icon name="chevron" size={18} />
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
