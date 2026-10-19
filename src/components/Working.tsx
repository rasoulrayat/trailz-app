import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/**
 * Progress for a long wait (writing a plan takes 20–40 s). A bar that keeps moving, a message that changes with
 * the elapsed time, and the seconds once it runs long — so the person sees work happening, not a greyed-out button.
 */
export type Stages = [seconds: number, message: string][];

export const PLAN_STAGES: Stages = [
  [0, "Reading your places…"],
  [5, "Finding real spots, routes and times…"],
  [14, "Writing the plan, day by day…"],
  [28, "Almost there, checking it over…"],
];

/** Live prices: providers answer within ~10 s (each has an 8–10 s timeout). */
export const PRICE_STAGES: Stages = [
  [0, "Finding your airports…"],
  [2, "Asking airlines, Kiwi and Google Flights…"],
  [6, "Checking stays for your dates…"],
  [11, "Ranking the best price for each part…"],
];

export function Working({ label = "Writing your plan", expected = 35, stages = PLAN_STAGES }: { label?: string; expected?: number; stages?: Stages }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setS((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  // Eases towards 92% around the expected time and never reaches the end on its own.
  const pct = Math.max(6, Math.min(92, Math.round(100 * (1 - Math.exp(-s / (expected * 0.55))))));
  const stage = [...stages].reverse().find(([at]) => s >= at)?.[1] ?? stages[0][1];
  return (
    <div className="working" role="status" aria-live="polite" aria-label={`${label}: ${stage}`}>
      <div className="working-fill" style={{ width: `${pct}%` }} />
      <div className="working-row">
        <span className="working-icon">
          <Icon name="sparkle" size={18} />
        </span>
        <span className="working-text">
          <b>{label}…</b>
          <span>{stage}</span>
        </span>
        <span className="working-secs">{s >= 10 ? `${s}s` : ""}</span>
      </div>
    </div>
  );
}
