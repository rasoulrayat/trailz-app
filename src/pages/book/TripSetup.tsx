import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { Trip } from "../../../shared/types";
import { Icon } from "../../components/Icon";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEPARTURES = ["Amsterdam", "Rotterdam", "Eindhoven", "Brussels", "Düsseldorf", "Berlin", "London", "Paris"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);

/** The next 9 months as chips; the Reality Cards' best months are marked. */
function monthOptions(best: number[]) {
  const now = new Date();
  const out: { y: number; m: number; best: boolean; label: string }[] = [];
  for (let i = 0; i < 9; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const m = d.getUTCMonth() + 1;
    out.push({ y: d.getUTCFullYear(), m, best: best.includes(m), label: `${MONTHS[m - 1]}${i === 0 ? " (now)" : ""}` });
  }
  return out;
}

/** Three sensible start dates in a month: the first three Fridays at least 3 days from today. */
function startOptions(y: number, m: number, days: number) {
  const out: { date: string; label: string; back: string }[] = [];
  const min = addDays(new Date(), 3);
  for (let day = 1; day <= 31 && out.length < 3; day++) {
    const d = new Date(Date.UTC(y, m - 1, day));
    if (d.getUTCMonth() !== m - 1) break;
    if (d.getUTCDay() !== 5 || d < min) continue;
    const back = addDays(d, days - 1);
    out.push({ date: iso(d), label: `Fri ${d.getUTCDate()} ${MONTHS[m - 1]}`, back: `${WEEKDAY[back.getUTCDay()]} ${back.getUTCDate()} ${MONTHS[back.getUTCMonth()]}` });
  }
  return out;
}

export function TripSetup({
  trip,
  onDone,
  busy,
}: {
  trip: Trip;
  onDone: (v: { startDate: string | null; origin: string; travelers: number }) => void;
  busy: boolean;
}) {
  const days = trip.plan.days.length;
  const months = useMemo(() => monthOptions(trip.bestMonths), [trip.bestMonths]);
  const firstBest = months.find((x) => x.best) ?? months[1] ?? months[0];
  const [month, setMonth] = useState<{ y: number; m: number }>({ y: firstBest.y, m: firstBest.m });
  const [startDate, setStartDate] = useState(trip.startDate ?? "");
  const [custom, setCustom] = useState(false);
  const [flexible, setFlexible] = useState(false);
  const [origin, setOrigin] = useState(trip.origin);
  const [travelers, setTravelers] = useState(trip.travelers);
  const starts = useMemo(() => startOptions(month.y, month.m, days), [month, days]);
  const today = iso(new Date());
  const ready = (flexible || /^\d{4}-\d{2}-\d{2}$/.test(startDate)) && origin.trim().length > 1;

  return (
    <>
      <main className="page" style={{ gap: 18 }}>
        <div className="topbar" style={{ justifyContent: "flex-start" }}>
          <Link to={`/trips/${trip.id}`} className="icon-btn plain" aria-label="Back to plan">
            <Icon name="back" size={22} />
          </Link>
          <h1 style={{ fontSize: 26 }}>When do you go?</h1>
        </div>
        <p className="lead" style={{ marginTop: -8 }}>
          {trip.plan.title} · {days} days.{trip.bestMonths.length ? " Green months are the best time for these places." : ""}
        </p>

        <section className="stack">
          <h2 style={{ fontSize: 14 }}>Month</h2>
          <div className="chips">
            {months.map((x) => (
              <button
                key={`${x.y}-${x.m}`}
                type="button"
                className={`chip${month.m === x.m && month.y === x.y && !flexible ? " on" : ""}${x.best ? " best" : ""}`}
                onClick={() => {
                  setMonth({ y: x.y, m: x.m });
                  setFlexible(false);
                  setStartDate("");
                  setCustom(false);
                }}
              >
                {x.best && <Icon name="sparkle" size={12} />}
                {x.label}
              </button>
            ))}
            <button
              type="button"
              className={`chip${flexible ? " on" : ""}`}
              onClick={() => {
                setFlexible(true);
                setStartDate("");
              }}
            >
              Not sure yet
            </button>
          </div>
        </section>

        {!flexible && (
          <section className="stack">
            <h2 style={{ fontSize: 14 }}>Start on</h2>
            <div className="stack" style={{ gap: 8 }}>
              {starts.map((s) => (
                <button
                  key={s.date}
                  type="button"
                  className={`list-row${startDate === s.date && !custom ? " selected" : ""}`}
                  style={{ padding: "12px 14px" }}
                  onClick={() => {
                    setStartDate(s.date);
                    setCustom(false);
                  }}
                >
                  <span className="tl-icon" style={{ background: "var(--blue-tint)", color: "var(--blue)" }}>
                    <Icon name="calendar" size={18} />
                  </span>
                  <span style={{ flex: 1, textAlign: "left" }}>
                    <span className="row-title" style={{ fontSize: 15 }}>{s.label}</span>
                    <span className="row-sub">
                      back {s.back} · {days} days
                    </span>
                  </span>
                  {startDate === s.date && !custom && <Icon name="check" size={20} />}
                </button>
              ))}
              <label className={`list-row${custom ? " selected" : ""}`} style={{ padding: "12px 14px", cursor: "pointer" }}>
                <span className="tl-icon" style={{ background: "var(--line-soft)", color: "var(--navy)" }}>
                  <Icon name="calendar" size={18} />
                </span>
                <span style={{ flex: 1 }}>
                  <span className="row-title" style={{ fontSize: 15 }}>Another date</span>
                  <input
                    type="date"
                    min={today}
                    value={custom ? startDate : ""}
                    onFocus={() => setCustom(true)}
                    onChange={(e) => {
                      setCustom(true);
                      setStartDate(e.target.value);
                    }}
                    className="plain-input"
                    aria-label="Pick a start date"
                  />
                </span>
              </label>
            </div>
          </section>
        )}
        {flexible && (
          <div className="card small" style={{ padding: 12 }}>
            We'll keep the partner searches open-dated. Exact prices need exact dates, which you can set any time.
          </div>
        )}

        <section className="card stack" style={{ padding: 0, overflow: "hidden" }}>
          <div className="row" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)", gap: 12 }}>
            <Icon name="plane" size={18} />
            <label style={{ flex: 1, minWidth: 0 }}>
              <span className="small" style={{ display: "block" }}>Flying from</span>
              <input list="departures" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Your city" className="plain-input" />
              <datalist id="departures">
                {DEPARTURES.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="row" style={{ padding: "12px 14px", justifyContent: "space-between" }}>
            <span className="row" style={{ gap: 12 }}>
              <Icon name="users" size={18} />
              <span>
                <span className="small" style={{ display: "block" }}>Travelers</span>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{travelers}</span>
              </span>
            </span>
            <span className="row" style={{ gap: 10 }}>
              <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Fewer travelers" onClick={() => setTravelers((t) => Math.max(1, t - 1))}>
                <Icon name="minus" size={16} />
              </button>
              <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="More travelers" onClick={() => setTravelers((t) => Math.min(9, t + 1))}>
                <Icon name="plus" size={16} />
              </button>
            </span>
          </div>
        </section>
      </main>
      <div className="actionbar col">
        <button className="btn" disabled={!ready || busy} onClick={() => onDone({ startDate: flexible ? null : startDate, origin: origin.trim(), travelers })}>
          {busy ? "Checking prices…" : "See prices"}
          <Icon name="arrow" size={18} />
        </button>
        <span className="small" style={{ textAlign: "center" }}>Nothing is charged in TrailZ. You pay the airline or hotel directly.</span>
      </div>
    </>
  );
}
