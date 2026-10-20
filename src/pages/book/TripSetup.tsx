import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import type { Trip } from "../../../shared/types";
import { useMe } from "../../auth";
import { findCity, homeCity, loadCountries, type Country } from "../../cities";
import { CityPicker } from "../../components/CityPicker";
import { Icon } from "../../components/Icon";
import { PRICE_STAGES, Working } from "../../components/Working";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Today where the person is (not UTC): after midnight in Tehran, "today" must already be the new day. */
const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  // A trip that already has a date opens on that date (its month, and the row or the custom field that holds it).
  const saved = trip.startDate && /^\d{4}-\d{2}-\d{2}$/.test(trip.startDate) ? trip.startDate : null;
  const [month, setMonth] = useState<{ y: number; m: number }>(saved ? { y: Number(saved.slice(0, 4)), m: Number(saved.slice(5, 7)) } : { y: firstBest.y, m: firstBest.m });
  const [startDate, setStartDate] = useState(saved ?? "");
  const [custom, setCustom] = useState(() => !!saved && !startOptions(Number(saved.slice(0, 4)), Number(saved.slice(5, 7)), trip.plan.days.length).some((s) => s.date === saved));
  const [flexible, setFlexible] = useState(false);
  const [origin, setOrigin] = useState(trip.origin);
  const [travelers, setTravelers] = useState(trip.travelers);
  const [picking, setPicking] = useState(false);
  const me = useMe();
  const home = me.profile?.home ?? null;
  // The city list (cached after onboarding) gives the field its flag and country.
  const [countries, setCountries] = useState<Country[] | null>(null);
  useEffect(() => {
    let live = true;
    loadCountries()
      .then((c) => live && setCountries(c))
      .catch(() => null);
    return () => {
      live = false;
    };
  }, []);
  const from = useMemo(() => (countries ? findCity(countries, origin) : null), [countries, origin]);
  const homeHit = useMemo(() => (countries && home ? findCity(countries, home) : null), [countries, home]);
  const isHome = !!home && (from ? from === homeHit : origin.trim().toLowerCase() === home.trim().toLowerCase());
  const fromNote = [from?.country.name ?? origin.split(",")[1]?.trim(), isHome ? "your city" : null].filter(Boolean).join(" · ");
  // While the sheet is open the page behind it doesn't scroll, and Escape closes it.
  useEffect(() => {
    if (!picking) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPicking(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [picking]);
  const starts = useMemo(() => startOptions(month.y, month.m, days), [month, days]);
  const today = localIso(new Date());
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && startDate >= today;
  const ready = (flexible || dateOk) && origin.trim().length > 1;

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

        <section className="stack">
          <h2 style={{ fontSize: 14 }}>Flying from</h2>
          <button type="button" className="from-field" aria-haspopup="dialog" aria-label={origin.trim() ? `Flying from ${origin.trim()}. Change` : "Choose where you fly from"} onClick={() => setPicking(true)}>
            <span className="from-flag" aria-hidden="true">
              {from ? from.country.flag : <Icon name="plane" size={18} />}
            </span>
            <span className="from-text">
              <b>{origin.trim() ? (from?.name ?? homeCity(origin)) : "Choose your city"}</b>
              {origin.trim() && fromNote && <span>{fromNote}</span>}
            </span>
            <span className="from-change">
              {origin.trim() ? "Change" : "Choose"} <Icon name="chevron" size={16} />
            </span>
          </button>
        </section>

        <section className="card stack" style={{ padding: 0, overflow: "hidden" }}>
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
        {busy ? (
          <Working label="Checking live prices" expected={12} stages={PRICE_STAGES} />
        ) : (
          <button className="btn" disabled={!ready} onClick={() => onDone({ startDate: flexible ? null : startDate, origin: origin.trim(), travelers })}>
            See prices
            <Icon name="arrow" size={18} />
          </button>
        )}
        <span className="small" style={{ textAlign: "center" }}>Nothing is charged in TrailZ. You pay the airline or hotel directly.</span>
      </div>

      {picking && (
        <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && setPicking(false)}>
          <div className="sheet city-sheet" role="dialog" aria-modal="true" aria-labelledby="from-h">
            <div className="sheet-handle" aria-hidden="true" />
            <div className="city-sheet-top">
              <div style={{ minWidth: 0 }}>
                <h2 id="from-h">Flying from</h2>
                <p>Prices for this trip start at this airport.</p>
              </div>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setPicking(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="sheet-scroll">
              <CityPicker
                light
                value={origin}
                home={home}
                onPick={(v) => {
                  setOrigin(v);
                  setPicking(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
