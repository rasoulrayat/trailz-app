import { Link } from "react-router";
import type { MonthRating, RealityCard, VideoMeta } from "../../shared/types";
import { Icon } from "./Icon";
import { PlaceThumb, usePlacePhoto } from "./PlacePhoto";
import { platformLabel } from "./VideoChip";

const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_STYLE: Record<MonthRating, { h: number; c: string }> = {
  best: { h: 66, c: "var(--real)" },
  good: { h: 46, c: "var(--real-soft)" },
  crowded: { h: 30, c: "var(--crowded)" },
  quiet: { h: 18, c: "var(--line)" },
};

const euro = (n: number) => `€${n.toLocaleString("en-US")}`;

export function scoreClass(n: number) {
  return n >= 7 ? "score-good" : n >= 5 ? "score-mid" : "score-low";
}

export function Meter({ value }: { value: number }) {
  return (
    <div className="meter" role="img" aria-label={`Authenticity ${value} of 10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < value ? "on" : undefined} />
      ))}
    </div>
  );
}

interface Props {
  card: RealityCard;
  video?: VideoMeta;
  backTo: string;
  /** Shown above the place name, e.g. "From a reel with 8 places". */
  context?: string;
}

export function RealityCardView({ card, video, backTo, context }: Props) {
  const { place } = card;
  const best = card.months.map((m, i) => (m === "best" ? MONTH_NAMES[i] : null)).filter(Boolean);
  const crowded = card.months.map((m, i) => (m === "crowded" ? MONTH_NAMES[i] : null)).filter(Boolean);
  // The place itself on top; the reel's cover while there's no photo.
  const photo = usePlacePhoto([place.name, place.country].filter(Boolean).join(", "));
  const hero = photo?.url ?? video?.thumbnailUrl ?? null;

  return (
    <>
      <header
        className="media"
        style={hero ? { backgroundImage: `url("${hero}")` } : undefined}
      >
        <div className="shade" />
        <div className="top">
          <Link to={backTo} className="icon-btn on-media" aria-label="Back">
            <Icon name="back" />
          </Link>
          <button
            className="icon-btn on-media"
            aria-label="Share"
            onClick={() => navigator.share?.({ title: `${place.name} · TrailZ`, url: location.href }).catch(() => {})}
          >
            <Icon name="share" size={18} />
          </button>
        </div>
        {(video || photo) && (
          <div className="credit">
            {video ? (
              <a href={video.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", gap: 4, alignItems: "center", minWidth: 0 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Reel · {platformLabel(video)}</span>
                <Icon name="external" size={12} />
              </a>
            ) : (
              <span />
            )}
            {photo?.pageUrl && (
              <a href={photo.pageUrl} target="_blank" rel="noopener noreferrer" style={{ flex: "none" }}>
                Photo: Wikipedia
              </a>
            )}
          </div>
        )}
      </header>

      <main className="page" style={{ gap: 18 }}>
        <div className="stack" style={{ gap: 8 }}>
          {context && <span className="small">{context}</span>}
          <span className={card.confidence === "high" ? "pill-confidence" : "pill-confidence"} style={card.confidence === "high" ? undefined : { background: "var(--seg)", color: "var(--muted)" }}>
            {card.confidence === "high" ? "Confirmed on the map" : "Not confirmed on the map"}
          </span>
          <h1 style={{ fontSize: 34, lineHeight: 1 }}>{place.name}</h1>
          <div className="lead">{[place.region, place.country].filter(Boolean).join(" · ")}</div>
          {card.summary && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{card.summary}</p>}
        </div>

        <section className="card stack" style={{ padding: 16, gap: 12 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ fontSize: 15 }}>How real is this reel?</h2>
            <div className="big-number" style={{ fontSize: 28 }}>
              {card.authenticity}
              <span style={{ fontSize: 16, color: "var(--muted)" }}>/10</span>
            </div>
          </div>
          <Meter value={card.authenticity} />
          {card.comparisons.length > 0 && (
            <div className="compare" style={{ marginTop: 4 }}>
              {card.comparisons.map((c, i) => (
                <ComparisonRows key={i} reel={c.reel} reality={c.reality} last={i === card.comparisons.length - 1} />
              ))}
            </div>
          )}
        </section>

        <section className="card stack" style={{ padding: 16, gap: 12 }}>
          <h2 style={{ fontSize: 15 }}>Best time to go</h2>
          <div
            className="months"
            role="img"
            aria-label={`Best months: ${best.join(", ") || "none"}. Crowded: ${crowded.join(", ") || "none"}.`}
          >
            {card.months.map((m, i) => (
              <span key={i} style={{ height: MONTH_STYLE[m].h, background: MONTH_STYLE[m].c }} />
            ))}
          </div>
          <div className="months-labels" aria-hidden="true">
            {MONTH_LETTERS.map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
          <div className="legend">
            <span><i style={{ background: "var(--real)" }} />Best</span>
            <span><i style={{ background: "var(--crowded)" }} />Overcrowded</span>
            <span><i style={{ background: "var(--line)" }} />Quiet, many places closed</span>
          </div>
        </section>

        <section className="card dark stack" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ fontSize: 15 }}>Real cost from {card.cost.from}</h2>
            <span style={{ fontSize: 12, color: "var(--muted-on-dark)" }}>{card.cost.days} days · 1 person</span>
          </div>
          <div className="big-number">
            {euro(card.cost.low)}–{euro(card.cost.high).slice(1)}
          </div>
          <div className="cost-grid">
            <div>
              <span style={{ color: "var(--muted-on-dark)" }}>Travel</span>
              <b>{euro(card.cost.flights)}</b>
            </div>
            <div>
              <span style={{ color: "var(--muted-on-dark)" }}>Stay</span>
              <b>{euro(card.cost.stay)}+</b>
            </div>
            <div>
              <span style={{ color: "var(--muted-on-dark)" }}>Food &amp; fun</span>
              <b>{euro(card.cost.food)}+</b>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-on-dark)" }}>
            AI estimate from typical prices. Live prices come when you plan.
          </div>
        </section>

        {card.gems.length > 0 && (
          <section className="stack">
            <h2 style={{ fontSize: 15 }}>Same vibe, fewer people</h2>
            {card.gems.map((g) => (
              <div key={g.name} className="list-row" style={{ cursor: "default" }}>
                <PlaceThumb q={[g.name, place.country].filter(Boolean).join(", ")} style={{ backgroundColor: "var(--real)" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="row-title">{g.name}</span>
                  <span className="row-sub">{g.why}</span>
                </span>
                <span className={scoreClass(g.authenticity)} style={{ fontSize: 12 }}>
                  {g.authenticity}/10
                </span>
              </div>
            ))}
          </section>
        )}
      </main>

      <div className="actionbar">
        <button className="btn secondary" style={{ width: "auto" }} disabled title="Saving comes with accounts">
          <Icon name="heart" size={18} />
          Save
        </button>
        <button className="btn" style={{ flex: 1 }} disabled title="Trip planning is the next phase">
          Plan this trip · soon
        </button>
      </div>
    </>
  );
}

function ComparisonRows({ reel, reality, last }: { reel: string; reality: string; last: boolean }) {
  return (
    <>
      <span className="badge reel tag">REEL</span>
      <span>“{reel}”</span>
      <span className="badge realword tag">REAL</span>
      <span>{reality}</span>
      {!last && <hr />}
    </>
  );
}
