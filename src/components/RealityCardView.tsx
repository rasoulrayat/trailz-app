import { Link } from "react-router";
import type { CityGuide, MonthRating, RealityCard, VideoMeta } from "../../shared/types";
import { Icon } from "./Icon";
import type { NewSave } from "../api";
import { planUrl } from "../plan-url";
import { MapView } from "./MapView";
import { SaveButton } from "./SaveButton";
import { ShareButton } from "./ShareButton";
import type { ReactNode } from "react";
import { HeroPhotos, PhotoStrip, PlaceThumb, photoCredit } from "./PlacePhoto";
import { platformLabel } from "./VideoChip";
import { TabBar } from "./TabBar";

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
  /** A shared link: no Save / Plan, and `footer` (the vote box) is shown instead. */
  readOnly?: boolean;
  /** This card is one place inside a reel (not the reel's own single result): share links must carry the place name. */
  placeCard?: boolean;
  /** The verdict on the reel (score, summary, comparisons) is still being written: show the facts, shimmer the rest. */
  verdictPending?: boolean;
  footer?: ReactNode;
}

export function RealityCardView({ card, video, backTo, context, checkId, vibe, readOnly, placeCard, verdictPending, footer }: Props) {
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
              {!readOnly && checkId && <ShareButton kind="check" id={checkId} placeName={placeCard || context ? place.name : undefined} title={place.name} onMedia />}
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

        <Decision card={card} pending={verdictPending} />

        <section className="card stack" style={{ padding: 16, gap: 12 }} aria-busy={verdictPending}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ fontSize: 15 }}>1 · How real is this reel?</h2>
            {verdictPending ? (
              <span className="skeleton" style={{ width: 56, height: 30 }} aria-label="Score coming" />
            ) : (
              <div className="big-number" style={{ fontSize: 28 }}>
                {card.authenticity}
                <span style={{ fontSize: 16, color: "var(--muted)" }}>/10</span>
              </div>
            )}
          </div>
          {verdictPending ? (
            <div className="stack" style={{ gap: 8 }}>
              <span className="skeleton" style={{ height: 10, borderRadius: 5 }} />
              <span className="skeleton" style={{ height: 14, width: "85%" }} />
              <span className="skeleton" style={{ height: 14, width: "70%" }} />
              <span className="small">Comparing the reel with reality…</span>
            </div>
          ) : (
            <Meter value={card.authenticity} />
          )}
          {!verdictPending && card.comparisons.length > 0 && (
            <div className="compare" style={{ marginTop: 4 }}>
              {card.comparisons.map((c, i) => (
                <ComparisonRows key={i} reel={c.reel} reality={c.reality} last={i === card.comparisons.length - 1} />
              ))}
            </div>
          )}
        </section>

        <section className="card stack" style={{ padding: 16, gap: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 15 }}>2 · When to go</h2>
            <RightNow months={card.months} />
          </div>
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
          {card.timing && (
            <div className="stack" style={{ gap: 6, paddingTop: 6, borderTop: "1px solid var(--line-soft)" }}>
              <h3 className="guide-h">When to go on the day</h3>
              <div className="when">
                <span><i className="dot live" />Quiet {card.timing.quiet}</span>
                <span><i className="dot" style={{ background: "var(--crowded)" }} />Busy {card.timing.busy}</span>
                {card.timing.closed && <span><i className="dot" />{card.timing.closed[0].toUpperCase() + card.timing.closed.slice(1)}</span>}
              </div>
              {card.timing.tip && <div className="small">{card.timing.tip}</div>}
            </div>
          )}
        </section>

        {card.practical && (
          <section className="practical" aria-label="Practical facts">
            <div>
              <Icon name="plane" size={18} />
              <b>{card.practical.flightHours} h</b>
              <span>flight from {card.cost.from}</span>
            </div>
            <div>
              <Icon name="clock" size={18} />
              <b>{card.practical.timeDiff}</b>
              <span>time difference</span>
            </div>
            <div>
              <Icon name="euro" size={18} />
              <b>~€{card.practical.dailyBudget}</b>
              <span>a day on the ground</span>
            </div>
            <div>
              <Icon name="passport" size={18} />
              <b>{card.practical.visa}</b>
              <span>EU passport</span>
            </div>
            {card.practical.safety && (
              <div className="wide">
                <Icon name="shield" size={18} />
                <span>{card.practical.safety}</span>
              </div>
            )}
          </section>
        )}

        <section className="card dark stack" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ fontSize: 15 }}>3 · Real cost from {card.cost.from}</h2>
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

        {card.base && <CityGuideView guide={card.base} placeName={place.name} />}

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

      {footer && <div className="page" style={{ paddingTop: 0 }}>{footer}</div>}
      {readOnly ? (
        <div className="actionbar above-tabs">
          <Link className="btn" style={{ flex: 1 }} to="/">
            <Icon name="sparkle" size={18} />
            Check your own reel on TrailZ
          </Link>
        </div>
      ) : (
      <div className="actionbar above-tabs">
        <SaveButton place={savePlace} />
        <Link className="btn" style={{ flex: 1 }} to={planUrl([savePlace])}>
          <Icon name="sparkle" size={18} />
          Plan this trip
        </Link>
      </div>
      )}
      <TabBar />
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

/** "Right now: crowded" from this month's rating, with the next best month when now isn't it. */
function RightNow({ months }: { months: MonthRating[] }) {
  const m = new Date().getMonth();
  const now = months[m];
  const label = now === "best" ? "Best time now" : now === "good" ? "Good now" : now === "crowded" ? "Crowded now" : "Quiet now";
  const nextBest = months.map((x, i) => (x === "best" ? i : -1)).filter((i) => i > m)[0] ?? months.indexOf("best");
  return (
    <span className={`badge ${now === "best" || now === "good" ? "soft-real" : now === "crowded" ? "reel" : "soft"}`} style={{ borderRadius: 999, padding: "4px 9px" }}>
      {label}
      {now !== "best" && nextBest >= 0 ? ` · best ${MONTH_NAMES[nextBest]}` : ""}
    </span>
  );
}

/** The five-second read: the three facts that decide a trip. */
function Decision({ card, pending }: { card: RealityCard; pending?: boolean }) {
  const m = new Date().getMonth();
  const best = card.months.map((x, i) => (x === "best" ? MONTH_NAMES[i] : null)).filter(Boolean) as string[];
  const nowWord = card.months[m] === "best" ? "best time now" : card.months[m] === "good" ? "good now" : card.months[m] === "crowded" ? "crowded now" : "quiet now";
  const verdict = card.authenticity >= 7 ? "Worth it, as shown" : card.authenticity >= 5 ? "Worth it, with caveats" : "Not what the reel shows";
  return (
    <section className="decision-box" aria-label="In short">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="guide-h" style={{ color: "var(--muted-on-dark)" }}>In short</span>
        <span className="small" style={{ color: "var(--muted-on-dark)" }}>{nowWord}</span>
      </div>
      <div className="decision-row">
        {pending ? (
          <>
            <span className="decision-score skeleton" style={{ background: "rgba(255,255,255,0.18)" }} aria-label="Score coming" />
            <span>
              <b>Checking the reel…</b>
              <span>The facts below are ready; the verdict on this reel lands in a few seconds.</span>
            </span>
          </>
        ) : (
          <>
            <span className={`decision-score ${scoreClass(card.authenticity)}`}>{card.authenticity}</span>
            <span>
              <b>{verdict}</b>
              <span>{card.comparisons[0] ? card.comparisons[0].reality : card.summary}</span>
            </span>
          </>
        )}
      </div>
      <div className="decision-facts">
        <span>
          <Icon name="calendar" size={14} />
          {best.length ? `Best ${best.slice(0, 3).join(", ")}` : "Any month"}
        </span>
        <span>
          <Icon name="euro" size={14} />
          €{card.cost.low.toLocaleString("en-US")}–{card.cost.high.toLocaleString("en-US")} · {card.cost.days} days
        </span>
        {card.practical && (
          <span>
            <Icon name="plane" size={14} />
            {card.practical.flightHours} h · {card.practical.visa}
          </span>
        )}
      </div>
    </section>
  );
}
