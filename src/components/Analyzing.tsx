import type { ReactNode } from "react";
import { Link } from "react-router";
import type { CheckStatus } from "../../shared/types";
import { Icon } from "./Icon";
import { VideoChip } from "./VideoChip";

type StepState = "done" | "now" | "todo";

function Step({ state, children }: { state: StepState; children: ReactNode }) {
  return (
    <li className={state === "todo" ? "pending" : undefined} aria-current={state === "now" ? "step" : undefined}>
      <span className={`dot ${state}`}>{state === "done" && <Icon name="check" size={14} strokeWidth={3} />}</span>
      <span style={{ fontWeight: state === "now" ? 600 : 400 }}>{children}</span>
    </li>
  );
}

export function Analyzing({ check, elapsedMs, slow }: { check: CheckStatus | null; elapsedMs: number; slow: boolean }) {
  const analyzing = check?.status === "analyzing";
  const watched: StepState = analyzing || elapsedMs > 4000 ? "done" : "now";
  const read: StepState = analyzing ? "done" : watched === "done" ? "now" : "todo";
  const match: StepState = analyzing ? (elapsedMs % 8000 < 5000 ? "now" : "done") : "todo";
  const compare: StepState = analyzing && match === "done" ? "now" : "todo";

  return (
    <main className="page">
      <div className="topbar">
        <Link to="/" className="icon-btn plain" aria-label="Close">
          <Icon name="close" size={22} />
        </Link>
        <span style={{ fontSize: 14, fontWeight: 500 }}>Checking your reel</span>
        <span style={{ width: 44 }} />
      </div>

      {check ? <VideoChip video={check.video} /> : <div className="skeleton" style={{ height: 108 }} />}

      <div className="stack" style={{ alignItems: "center", gap: 14, padding: "8px 0" }}>
        <div className="spinner-wrap">
          <div className="spinner-ring" />
          <Icon name="pin" size={40} strokeWidth={1.8} />
        </div>
        <h1 style={{ textAlign: "center", fontSize: 28 }} aria-live="polite">
          {analyzing ? "Finding the real place…" : "Watching the video…"}
        </h1>
        <p className="lead" style={{ textAlign: "center" }}>
          {slow ? "This one is taking longer. It will also appear in your recent checks." : "Usually takes under a minute"}
        </p>
      </div>

      <ol className="steps">
        <Step state={watched}>Watching the video</Step>
        <Step state={read}>Reading caption, audio &amp; on-screen text</Step>
        <Step state={match}>Matching landmarks to real places</Step>
        <Step state={compare}>Comparing reel vs. reality</Step>
      </ol>
    </main>
  );
}
