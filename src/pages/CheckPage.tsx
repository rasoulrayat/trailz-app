import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import type { CheckStatus } from "../../shared/types";
import { api, ApiFailure } from "../api";
import { Analyzing } from "../components/Analyzing";
import { Icon } from "../components/Icon";
import { RealityCardView } from "../components/RealityCardView";
import { MultiView, NotTravelView, PickView, VibeView } from "../components/Results";
import { VideoChip } from "../components/VideoChip";

const POLL_MS = 2000;
const SLOW_MS = 75_000;

export function CheckPage() {
  const { id = "" } = useParams();
  const [check, setCheck] = useState<CheckStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(Date.now());

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let coverTries = 0;
    started.current = Date.now();
    setCheck(null);
    setError(null);

    const tick = async () => {
      try {
        const c = await api.getCheck(id);
        if (stop) return;
        setCheck(c);
        setElapsed(Date.now() - started.current);
        if (c.status === "extracting" || c.status === "analyzing") timer = setTimeout(tick, POLL_MS);
        // The reel's cover is copied in the background: look again a few times until it's there.
        else if (c.video.thumbnailUrl === null && coverTries++ < 4) timer = setTimeout(tick, 4000);
      } catch (err) {
        if (stop) return;
        if (err instanceof ApiFailure && err.code === "not_found") setError("We can't find this check.");
        else timer = setTimeout(tick, POLL_MS * 2); // network blip: keep trying
      }
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id]);

  if (error) return <Problem title={error} />;
  if (!check || check.status === "extracting" || check.status === "analyzing") {
    return <Analyzing check={check} elapsedMs={elapsed} slow={elapsed > SLOW_MS} />;
  }
  if (check.status === "failed" || !check.result) {
    return <Problem title="We couldn't check this reel" detail={check.error} check={check} />;
  }

  const r = check.result;
  switch (r.outcome) {
    case "single":
      return <RealityCardView card={r.card} video={check.video} backTo="/" checkId={check.id} />;
    case "multi":
      return <MultiView check={check} result={r} />;
    case "pick":
      return <PickView check={check} result={r} />;
    case "vibe":
      return <VibeView check={check} result={r} />;
    case "not_travel":
      return <NotTravelView check={check} result={r} />;
  }
}

function Problem({ title, detail, check }: { title: string; detail?: string; check?: CheckStatus }) {
  const [retrying, setRetrying] = useState(false);
  return (
    <main className="page">
      <div className="topbar">
        <Link to="/" className="icon-btn plain" aria-label="Close">
          <Icon name="close" size={22} />
        </Link>
      </div>
      {check && <VideoChip video={check.video} />}
      <h1>{title}</h1>
      {detail && <p className="lead">{detail}</p>}
      <div className="stack" style={{ marginTop: "auto" }}>
        {check && (
          <button
            className="btn"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              try {
                const { id } = await api.startCheck(check.video.url);
                location.assign(`/check/${id}`);
              } catch (e) {
                alert(e instanceof Error ? e.message : "Try again later.");
                setRetrying(false);
              }
            }}
          >
            <Icon name="refresh" size={18} />
            Try again
          </button>
        )}
        <Link to="/" className="btn secondary">
          Try another link
        </Link>
      </div>
    </main>
  );
}
