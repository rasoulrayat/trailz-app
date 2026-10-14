import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { MOODS, type ItemKind, type Trip } from "../../shared/types";
import { ApiFailure, tripsApi } from "../api";
import { Icon, type IconName } from "../components/Icon";
import { MapView, toPoints } from "../components/MapView";
import { PhotoStrip } from "../components/PlacePhoto";

const KIND: Record<ItemKind, { icon: IconName; bg: string; fg: string }> = {
  travel: { icon: "plane", bg: "var(--blue-tint)", fg: "var(--blue)" },
  stay: { icon: "bed", bg: "#FBF1C7", fg: "#6B5300" },
  see: { icon: "pin", bg: "var(--real-tint)", fg: "var(--real)" },
  do: { icon: "sun", bg: "var(--real-tint)", fg: "var(--real)" },
  eat: { icon: "fork", bg: "var(--line-soft)", fg: "var(--navy)" },
  free: { icon: "coffee", bg: "var(--line-soft)", fg: "var(--muted)" },
};
const DOT: Record<ItemKind, string> = { travel: "var(--sky)", stay: "var(--reel)", see: "var(--real)", do: "var(--real-soft)", eat: "var(--line-strong)", free: "var(--line-strong)" };
const euro = (n: number) => `€${n.toLocaleString("en-US")}`;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayLabel(trip: Trip, day: number): { top: string; big: string } {
  if (!trip.startDate) return { top: "Day", big: String(day) };
  const d = new Date(`${trip.startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day - 1);
  return { top: WEEKDAY[d.getUTCDay()], big: String(d.getUTCDate()) };
}

export function tripMeta(trip: Trip): string {
  const mood = MOODS.find((m) => m.id === trip.mood)?.title ?? trip.mood;
  const n = trip.plan.days.length;
  const when = trip.startDate ? `${trip.startDate.slice(8, 10)}/${trip.startDate.slice(5, 7)}` : "dates open";
  return [when, `${n} ${n === 1 ? "day" : "days"}`, `${trip.travelers} ${trip.travelers === 1 ? "traveler" : "travelers"}`, mood.toLowerCase(), trip.budgetMode ? "budget" : null]
    .filter(Boolean)
    .join(" · ");
}

export function TripPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    tripsApi
      .getTrip(id)
      .then((r) => setTrip(r.trip))
      .catch((e: Error) => setError(e instanceof ApiFailure && e.code === "not_found" ? "We can't find this trip." : e.message));
  }, [id]);

  if (error)
    return (
      <main className="page">
        <h1>{error}</h1>
        <Link to="/trips" className="btn">
          My trips
        </Link>
      </main>
    );
  if (!trip)
    return (
      <main className="page">
        <div className="skeleton" style={{ height: 60 }} />
        <div className="skeleton" style={{ height: 120 }} />
        <div className="skeleton" style={{ height: 300 }} />
      </main>
    );

  const { plan } = trip;
  const est = plan.estimate;
  const total = est.travel + est.stay + est.activities + est.food;
  const current = plan.days.find((d) => d.day === day) ?? plan.days[0];
  const pct = (n: number) => `${total ? Math.round((n / total) * 100) : 0}%`;

  async function save() {
    if (!trip || saving) return;
    setSaving(true);
    const r = await tripsApi.updateTrip(trip.id, { status: "saved" }).catch(() => null);
    if (r) setTrip(r.trip);
    setSaving(false);
  }
  async function remove() {
    if (!trip) return;
    await tripsApi.deleteTrip(trip.id).catch(() => null);
    navigate("/trips", { replace: true });
  }

  return (
    <>
      <main className="page" style={{ gap: 16 }}>
        <div className="topbar">
          <Link to={trip.status === "saved" ? "/trips" : "/saved"} className="icon-btn plain" aria-label="Back">
            <Icon name="back" size={22} />
          </Link>
          <span className={`badge ${trip.status === "saved" ? "soft-real" : "soft"}`} style={{ borderRadius: 999, padding: "5px 10px" }}>
            {trip.status === "saved" ? "Saved trip" : "Draft"}
          </span>
          <button className="icon-btn" aria-label="Delete this plan" onClick={remove}>
            <Icon name="trash" size={18} />
          </button>
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: 30 }}>{plan.title}</h1>
          <div className="lead">{tripMeta(trip)}</div>
          {plan.summary && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{plan.summary}</p>}
        </div>

        <section className="cost">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <span className="big-number" style={{ fontSize: 28 }}>{euro(total)}</span>
              <span style={{ fontSize: 13, color: "var(--muted-on-dark)" }}> est. per person</span>
            </div>
            <span style={{ fontSize: 12, color: "var(--muted-on-dark)" }}>from {trip.origin}</span>
          </div>
          <div className="cost-bar" role="img" aria-label={`Travel ${est.travel}, stay ${est.stay}, activities ${est.activities}, food ${est.food} euros`}>
            <span style={{ width: pct(est.travel), background: "var(--sky)" }} />
            <span style={{ width: pct(est.stay), background: "var(--reel)" }} />
            <span style={{ width: pct(est.activities), background: "var(--real-soft)" }} />
            <span style={{ width: pct(est.food), background: "#fff" }} />
          </div>
          <div className="cost-legend">
            <span><i style={{ background: "var(--sky)" }} />Travel {euro(est.travel)}</span>
            <span><i style={{ background: "var(--reel)" }} />Stay {euro(est.stay)}</span>
            <span><i style={{ background: "var(--real-soft)" }} />Activities {euro(est.activities)}</span>
            <span><i style={{ background: "#fff" }} />Food {euro(est.food)}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-on-dark)" }}>AI estimate from typical prices. Live prices when you book.</div>
        </section>

        <MapView points={toPoints(trip.places)} height={150} />

        <div role="tablist" aria-label="Days" className="daytabs">
          {plan.days.map((d) => {
            const l = dayLabel(trip, d.day);
            return (
              <button key={d.day} role="tab" aria-selected={day === d.day} className={`daytab${day === d.day ? " on" : ""}`} onClick={() => setDay(d.day)}>
                <span>{l.top}</span>
                <b>{l.big}</b>
              </button>
            );
          })}
        </div>

        <section className="stack" style={{ gap: 4 }}>
          <h2 style={{ fontSize: 17 }}>{current.title}</h2>
          {current.base && <span className="small">Night in {current.base}</span>}
          <PhotoStrip q={[current.base || trip.places[0]?.name, trip.places[0]?.country].filter(Boolean).join(", ")} title={current.base || plan.title} height={120} />
        </section>

        <ol className="timeline">
          {current.items.map((it, i) => {
            const k = KIND[it.kind];
            return (
              <li key={i} className="tl-item">
                <span className="tl-time">{it.time}</span>
                <span className="tl-dot" style={{ background: DOT[it.kind] }} />
                <div className={`card tl-card${it.fromReel ? " reel" : ""}`}>
                  <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                    <span className="tl-icon" style={{ background: k.bg, color: k.fg }}>
                      <Icon name={k.icon} size={18} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="row-title" style={{ fontSize: 14 }}>{it.title}</span>
                      <span className="row-sub">{it.detail}</span>
                    </span>
                  </div>
                  <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: it.cost ? "var(--navy)" : "var(--real)" }}>{it.cost ? `~${euro(it.cost)}` : "Free"}</span>
                    {it.fromReel && (
                      <span className="badge soft-real" style={{ gap: 4 }}>
                        <Icon name="play" size={10} /> From your reel
                      </span>
                    )}
                    {it.book && !it.fromReel && <span className="small">Bookable</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {plan.tips.length > 0 && (
          <section className="stack" style={{ gap: 8 }}>
            {plan.tips.map((t) => (
              <div key={t} className="tip">
                <span style={{ color: "var(--blue)", flex: "none" }}>
                  <Icon name="sparkle" size={18} />
                </span>
                <span>{t}</span>
              </div>
            ))}
          </section>
        )}
      </main>

      <div className="actionbar col">
        <div className="row" style={{ gap: 10 }}>
          {trip.status !== "saved" && (
            <button className="btn secondary" style={{ width: "auto" }} onClick={save} disabled={saving}>
              <Icon name="heart" size={18} />
              {saving ? "Saving…" : "Save plan"}
            </button>
          )}
          <Link to={`/trips/${trip.id}/book`} className="btn" style={{ flex: 1 }}>
            Book this plan
            <Icon name="arrow" size={18} />
          </Link>
        </div>
        <span className="small" style={{ textAlign: "center" }}>You'll book each part with our partners. Nothing is charged here.</span>
      </div>
    </>
  );
}
