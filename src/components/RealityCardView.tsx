import { Link } from "react-router";
import type { CityGuide, MonthRating, RealityCard, VideoMeta } from "../../shared/types";
import { Icon } from "./Icon";
import type { NewSave } from "../api";
import { planUrl } from "../plan-url";
import { MapView } from "./MapView";
import { SaveButton } from "./SaveButton";
import { HeroPhotos, PhotoStrip, PlaceThumb, photoCredit } from "./PlacePhoto";
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
  /** The check this card came from (lets a saved place reopen its card). */
  checkId?: string;
  /** Vibe words from the reel, saved with the place. */
  vibe?: string[];
}

export function RealityCardView({ card, video, backTo, context, checkId, vibe }: Props) {
  const { place } = card;
  const savePlace: NewSave = {
    name: place.name,
    region: place.region ?? null,
    country: place.country || null,
    lat: place.lat ?? null,
    lng: place.lng ?? null,
    vibe: vibe ?? [],
    checkId: checkId ?? null,
    authenticity: card.authenticity,
  };
  const best = card.months.map((m, i) => (m === "best" ? MONTH_NAMES[i] : null)).filter(Boolean);
  const crowded = card.months.map((m, i) => (m === "crowded" ? MONTH_NAMES[i] : null)).filter(Boolean);
  const photoQuery = [place.name, place.country].filter(Boolean).join(", ");

  return (
    <>
      {/* The place itself on top (swipe for more photos); the reel's cover when there are none. */}
      <HeroPhotos q={photoQuery} title={place.name} fallback={video?.thumbnailUrl}>
        {(photo) => (
          <>
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
                  <span style={{ background: "none" }} />
                )}
                {photo && (
                  <a
                    href={photo.link ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ minWidth: 0, maxWidth: "50%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    Photo: {photoCredit(photo)}
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </HeroPhotos>

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

        {place.lat != null && place.lng != null && (
          <section className="stack" style={{ gap: 8 }}>
            <MapView points={[{ lat: place.lat, lng: place.lng, label: "", name: place.name, selected: true }]} height={170} />
            <a
              className="small"
              style={{ display: "inline-flex", gap: 4, alignItems: "center", color: "var(--blue)" }}
              href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Google Maps <Icon name="external" size={12} />
            </a>
          </section>
        )}

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

        {card.base && <CityGuideView guide={card.base} placeName={place.name} />}

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
                <PlaceThumb q={[g.name, place.country].filter(Boolean).join(", ")} title={g.name} style={{ backgroundColor: "var(--real)" }} />
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
        <SaveButton place={savePlace} />
        <Link className="btn" style={{ flex: 1 }} to={planUrl([savePlace])}>
          <Icon name="sparkle" size={18} />
          Plan this trip
        </Link>
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

/** "Know the city": where to base yourself, and how to enjoy it like a local. */
function CityGuideView({ guide, placeName }: { guide: CityGuide; placeName: string }) {
  const q = [guide.city, guide.country].filter(Boolean).join(", ");
  const sameAsPlace = guide.city.toLowerCase() === placeName.toLowerCase();
  return (
    <section className="card stack" style={{ padding: 16, gap: 12 }}>
      <PhotoStrip q={q} title={guide.city} height={140} />
      <div className="stack" style={{ gap: 4 }}>
        <span className="small">{sameAsPlace ? "Know the city" : "Your base city"}</span>
        <h2 style={{ fontSize: 22, fontFamily: "var(--display)" }}>{guide.city}</h2>
        {guide.fromPlace && !sameAsPlace && <div className="small">{guide.fromPlace}</div>}
        {guide.vibe && <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: 1.5 }}>{guide.vibe}</p>}
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <h3 className="guide-h">Do it like a local</h3>
        {guide.do.map((d, i) => (
          <div key={d.title} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <span className="num" style={{ background: "var(--real)" }}>{i + 1}</span>
            <span style={{ minWidth: 0 }}>
              <span className="row-title" style={{ fontSize: 14 }}>{d.title}</span>
              <span className="row-sub" style={{ whiteSpace: "normal" }}>{d.detail}</span>
            </span>
          </div>
        ))}
      </div>

      {guide.eat.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <h3 className="guide-h">Eat</h3>
          {guide.eat.map((e) => (
            <div key={e} className="guide-line">{e}</div>
          ))}
        </div>
      )}
      {guide.skip.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <h3 className="guide-h" style={{ color: "var(--warn)" }}>Skip</h3>
          {guide.skip.map((e) => (
            <div key={e} className="guide-line skip">{e}</div>
          ))}
        </div>
      )}
      {guide.localTip && (
        <div className="tip">
          <span style={{ color: "var(--blue)", flex: "none", marginTop: 1 }}>
            <Icon name="sparkle" size={18} />
          </span>
          <span>
            <b>Local tip:</b> {guide.localTip}
          </span>
        </div>
      )}
    </section>
  );
}
