import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api } from "../api";
import { Icon } from "../components/Icon";

/**
 * Android share target: TikTok / Instagram / YouTube → Share → TrailZ opens
 * /share?text=…&url=… (configured in manifest.webmanifest).
 */
export function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const startedFor = useRef<string | null>(null);
  const shared = [params.get("url"), params.get("text"), params.get("title")].filter(Boolean).join(" ");

  useEffect(() => {
    if (!shared) {
      navigate("/", { replace: true });
      return;
    }
    if (startedFor.current === shared) return; // React dev mode runs effects twice
    startedFor.current = shared;
    api
      .startCheck(shared)
      .then(({ id }) => navigate(`/check/${id}`, { replace: true }))
      .catch((e: Error) => setError(e.message));
  }, [shared, navigate]);

  return (
    <main className="page">
      <div className="topbar">
        <Link to="/" className="icon-btn plain" aria-label="Close">
          <Icon name="close" size={22} />
        </Link>
      </div>
      {error ? (
        <>
          <h1>We couldn't use that share</h1>
          <p className="lead">{error}</p>
          <Link to="/" className="btn">
            Paste a link instead
          </Link>
        </>
      ) : (
        <h1 aria-live="polite">Opening your reel…</h1>
      )}
    </main>
  );
}
