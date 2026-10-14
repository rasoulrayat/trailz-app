import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { Handoff, Trip } from "../../shared/types";
import { tripsApi } from "../api";
import { Icon, type IconName } from "../components/Icon";
import { dayLabel } from "./TripPage";

const DEPARTURES = ["Amsterdam", "Rotterdam", "Eindhoven", "Brussels", "Düsseldorf", "Berlin", "London", "Paris"];

/** Book: dates, departure and travelers, then Compare & Go with each partner. */
export function BookPage() {
  const { id = "" } = useParams();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [startDate, setStartDate] = useState("");
  const [origin, setOrigin] = useState("");
  const [travelers, setTravelers] = useState(1);
  const [flexible, setFlexible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<Set<string>>(new Set());

  useEffect(() => {
    tripsApi.getTrip(id).then((r) => {
      setTrip(r.trip);
      setStartDate(r.trip.startDate ?? "");
      setOrigin(r.trip.origin);
      setTravelers(r.trip.travelers);
      // Dates already chosen: straight to the partner links.
      if (r.trip.startDate) tripsApi.handoff(id).then((h) => setHandoff(h.handoff)).catch(() => {});
    });
  }, [id]);

  const ready = !!trip && (flexible || /^\d{4}-\d{2}-\d{2}$/.test(startDate)) && origin.trim().length > 1;

  async function confirm() {
    if (!trip || !ready || busy) return;
    setBusy(true);
    const r = await tripsApi.updateTrip(trip.id, { status: "saved", startDate: flexible ? null : startDate, origin: origin.trim(), travelers }).catch(() => null);
    if (r) {
      setTrip(r.trip);
      const h = await tripsApi.handoff(trip.id).catch(() => null);
      setHandoff(h?.handoff ?? null);
    }
    setBusy(false);
  }
  const mark = (url: string) => setOpened((s) => new Set(s).add(url));

  if (!trip)
    return (
      <main className="page">
        <div className="skeleton" style={{ height: 200 }} />
      </main>
    );
  const nights = Math.max(1, trip.plan.days.length - 1);
  const today = new Date().toISOString().slice(0, 10);
  const endLabel = startDate && !flexible ? dayLabel({ ...trip, startDate }, trip.plan.days.length) : null;
  const parts = handoff ? [...handoff.flights, ...handoff.stay, ...handoff.activities, ...handoff.transport] : [];
  const done = parts.filter((p) => opened.has(p.url)).length;

  return (
    <>
      <main className="page" style={{ gap: 18 }}>
        <div className="topbar" style={{ justifyContent: "flex-start" }}>
          <Link to={`/trips/${trip.id}`} className="icon-btn plain" aria-label="Back to plan">
            <Icon name="back" size={22} />
          </Link>
          <h1 style={{ fontSize: 26 }}>{handoff ? "Compare & go" : "Book this plan"}</h1>
        </div>

        <section className="card stack" style={{ padding: 0, overflow: "hidden" }}>
          <div className="row" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)", gap: 12 }}>
            <Icon name="plane" size={18} />
            <label style={{ flex: 1, minWidth: 0 }}>
              <span className="small" style={{ display: "block" }}>From</span>
              <input list="departures" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Your city" className="plain-input" />
              <datalist id="departures">
                {DEPARTURES.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="row" style={{ padding: "12px 14px", gap: 12 }}>
            <span style={{ color: "var(--blue)" }}>
              <Icon name="pin" size={18} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="small" style={{ display: "block" }}>To · from your plan</span>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{trip.plan.title}</span>
            </div>
          </div>
        </section>

        <section className="stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 14 }}>When</h2>
            <div role="tablist" className="seg">
              <button role="tab" aria-selected={!flexible} className={`seg-btn${!flexible ? " on" : ""}`} onClick={() => setFlexible(false)}>
                Dates
              </button>
              <button role="tab" aria-selected={flexible} className={`seg-btn${flexible ? " on" : ""}`} onClick={() => setFlexible(true)}>
                Flexible
              </button>
            </div>
          </div>
          {flexible ? (
            <div className="card small" style={{ padding: 12 }}>
              Partners open with open dates. Pick dates later for exact prices. The plan's best months are in each Reality Card.
            </div>
          ) : (
            <div className="card stack" style={{ padding: 12, gap: 8 }}>
              <label className="row" style={{ gap: 12 }}>
                <Icon name="calendar" size={18} />
                <span style={{ flex: 1 }}>
                  <span className="small" style={{ display: "block" }}>First day</span>
                  <input type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="plain-input" />
                </span>
              </label>
              <div className="small">
                {trip.plan.days.length} days · {nights} {nights === 1 ? "night" : "nights"}
                {endLabel ? ` · back ${endLabel.top} ${endLabel.big}` : ""}
              </div>
            </div>
          )}
        </section>

        <section className="card row" style={{ justifyContent: "space-between" }}>
          <span className="row" style={{ gap: 10 }}>
            <Icon name="users" size={18} />
            <span>
              <span className="row-title" style={{ fontSize: 14 }}>Travelers</span>
              <span className="row-sub">Flights and rooms for everyone</span>
            </span>
          </span>
          <span className="row" style={{ gap: 10 }}>
            <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Fewer travelers" onClick={() => setTravelers((t) => Math.max(1, t - 1))}>
              <Icon name="minus" size={16} />
            </button>
            <b style={{ fontSize: 18, minWidth: 16, textAlign: "center" }}>{travelers}</b>
            <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="More travelers" onClick={() => setTravelers((t) => Math.min(9, t + 1))}>
              <Icon name="plus" size={16} />
            </button>
          </span>
        </section>

        {!handoff && (
          <button className="btn" disabled={!ready || busy} onClick={confirm}>
            {busy ? "Preparing…" : "Confirm & compare prices"}
            <Icon name="arrow" size={18} />
          </button>
        )}

        {handoff && (
          <>
            <div className="stack" style={{ gap: 8 }}>
              <div className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
                <b>
                  {done} of {parts.length} opened
                </b>
                <button className="btn link" style={{ height: "auto", padding: 0, fontSize: 13 }} onClick={() => { setHandoff(null); }}>
                  Change dates
                </button>
              </div>
              <div className="progress" role="img" aria-label={`${done} of ${parts.length} parts opened`}>
                {parts.map((p) => (
                  <span key={p.url} className={opened.has(p.url) ? "on" : undefined} />
                ))}
              </div>
            </div>

            <Group title="How to get there" icon="plane" items={handoff.flights.map((f) => ({ title: `Flights with ${f.partner}`, sub: f.note, url: f.url, cta: `Go to ${f.partner}` }))} opened={opened} mark={mark} />
            {handoff.transport.length > 0 && (
              <Group title="Trains & buses" icon="trips" items={handoff.transport.map((t) => ({ title: t.partner, sub: t.note, url: t.url, cta: `Go to ${t.partner}` }))} opened={opened} mark={mark} />
            )}
            <Group title="Where to stay" icon="bed" items={handoff.stay.map((s) => ({ title: s.city, sub: s.note, url: s.url, cta: `Go to ${s.partner}` }))} opened={opened} mark={mark} />
            {handoff.activities.length > 0 && (
              <Group title="Things to do" icon="sun" items={handoff.activities.map((a) => ({ title: a.place, sub: a.note, url: a.url, cta: `Go to ${a.partner}` }))} opened={opened} mark={mark} />
            )}

            <div className="cost" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 14 }}>Estimated per person</span>
                <span className="big-number" style={{ fontSize: 26 }}>
                  €{(trip.plan.estimate.travel + trip.plan.estimate.stay + trip.plan.estimate.activities + trip.plan.estimate.food).toLocaleString("en-US")}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-on-dark)", lineHeight: 1.5 }}>{handoff.disclaimer}</div>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function Group({
  title,
  icon,
  items,
  opened,
  mark,
}: {
  title: string;
  icon: IconName;
  items: { title: string; sub: string; url: string; cta: string }[];
  opened: Set<string>;
  mark: (url: string) => void;
}) {
  return (
    <section className="stack">
      <h2 className="guide-h">{title}</h2>
      {items.map((it) => (
        <div key={it.url} className={`card stack${opened.has(it.url) ? " opened" : ""}`} style={{ gap: 10 }}>
          <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <span className="tl-icon" style={{ background: opened.has(it.url) ? "var(--real)" : "var(--blue-tint)", color: opened.has(it.url) ? "#fff" : "var(--blue)" }}>
              <Icon name={opened.has(it.url) ? "check" : icon} size={18} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="row-title" style={{ fontSize: 14 }}>{it.title}</span>
              <span className="row-sub">{it.sub}</span>
            </span>
          </div>
          <a href={it.url} target="_blank" rel="noopener noreferrer" className={`btn${opened.has(it.url) ? " secondary" : ""}`} style={{ height: 46 }} onClick={() => mark(it.url)}>
            {opened.has(it.url) ? "Open again" : it.cta}
            <Icon name="external" size={16} />
          </a>
        </div>
      ))}
    </section>
  );
}
