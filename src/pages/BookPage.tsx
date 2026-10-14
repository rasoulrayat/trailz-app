import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { Handoff, Trip, TripPrices } from "../../shared/types";
import { tripsApi } from "../api";
import { Icon, type IconName } from "../components/Icon";
import { dayLabel } from "./TripPage";

const DEPARTURES = ["Amsterdam", "Rotterdam", "Eindhoven", "Brussels", "Düsseldorf", "Berlin", "London", "Paris"];

/** Book: dates, departure and travelers, then Compare & Go with each partner. */
export function BookPage() {
  const { id = "" } = useParams();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [prices, setPrices] = useState<TripPrices | null | "loading" | "none">("none");
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
      if (r.trip.startDate) {
        tripsApi.handoff(id).then((h) => setHandoff(h.handoff)).catch(() => {});
        loadPrices();
      }
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
      loadPrices();
    }
    setBusy(false);
  }
  function loadPrices() {
    setPrices("loading");
    tripsApi
      .prices(id)
      .then((r) => setPrices(r.prices ?? "none"))
      .catch(() => setPrices("none"));
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

            <section className="stack">
              <h2 className="guide-h">How to get there</h2>
              <FlightPrices prices={prices} opened={opened} mark={mark} />
              {handoff.flights.map((f) => (
                <PartnerCard key={f.url} icon="plane" title={`Flights with ${f.partner}`} sub={f.note} url={f.url} cta={prices !== "none" && prices !== "loading" && prices?.flights?.quotes.length ? `Also check ${f.partner}` : `Go to ${f.partner}`} opened={opened} mark={mark} secondary={!!(prices !== "none" && prices !== "loading" && prices?.flights?.quotes.length)} />
              ))}
            </section>
            {handoff.transport.length > 0 && (
              <Group title="Trains & buses" icon="trips" items={handoff.transport.map((t) => ({ title: t.partner, sub: t.note, url: t.url, cta: `Go to ${t.partner}` }))} opened={opened} mark={mark} />
            )}
            <section className="stack">
              <h2 className="guide-h">Where to stay</h2>
              {handoff.stay.map((s) => {
                const stay = prices !== "none" && prices !== "loading" ? prices?.stays.find((x) => x.city === s.city) : undefined;
                return (
                  <div key={s.url} className="stack" style={{ gap: 8 }}>
                    <StayPrices stay={stay} loading={prices === "loading"} city={s.city} nights={s.nights} opened={opened} mark={mark} />
                    <PartnerCard icon="bed" title={s.city} sub={s.note} url={s.url} cta={stay?.hotels.length ? `Also check ${s.partner}` : `Go to ${s.partner}`} opened={opened} mark={mark} secondary={!!stay?.hotels.length} />
                  </div>
                );
              })}
            </section>
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
              <div style={{ fontSize: 12, color: "var(--muted-on-dark)", lineHeight: 1.5 }}>
                {prices !== "none" && prices !== "loading" && prices?.note ? `${prices.note} ` : ""}
                {handoff.disclaimer}
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}


const euro = (n: number) => `€${n.toLocaleString("en-US")}`;
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
};

function PartnerCard({ icon, title, sub, url, cta, opened, mark, secondary }: { icon: IconName; title: string; sub: string; url: string; cta: string; opened: Set<string>; mark: (u: string) => void; secondary?: boolean }) {
  const done = opened.has(url);
  return (
    <div className={`card stack${done ? " opened" : ""}`} style={{ gap: 10 }}>
      <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <span className="tl-icon" style={{ background: done ? "var(--real)" : "var(--blue-tint)", color: done ? "#fff" : "var(--blue)" }}>
          <Icon name={done ? "check" : icon} size={18} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="row-title" style={{ fontSize: 14 }}>{title}</span>
          <span className="row-sub">{sub}</span>
        </span>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className={`btn${done || secondary ? " secondary" : ""}`} style={{ height: 46 }} onClick={() => mark(url)}>
        {done ? "Open again" : cta}
        <Icon name="external" size={16} />
      </a>
    </div>
  );
}

function Group({ title, icon, items, opened, mark }: { title: string; icon: IconName; items: { title: string; sub: string; url: string; cta: string }[]; opened: Set<string>; mark: (url: string) => void }) {
  return (
    <section className="stack">
      <h2 className="guide-h">{title}</h2>
      {items.map((it) => (
        <PartnerCard key={it.url} icon={icon} {...it} opened={opened} mark={mark} />
      ))}
    </section>
  );
}

/** Cheapest fares seen on Aviasales for these dates, each bookable with a tracked link. */
function FlightPrices({ prices, opened, mark }: { prices: TripPrices | null | "loading" | "none"; opened: Set<string>; mark: (u: string) => void }) {
  if (prices === "none" || prices === null) return null;
  if (prices === "loading") return <div className="skeleton" style={{ height: 96 }} aria-label="Looking up fares" />;
  const f = prices.flights;
  if (!f) return null;
  const route = f.origin && f.destination ? `${f.origin.code} → ${f.destination.code}` : "";
  if (!f.origin || !f.destination)
    return (
      <div className="card small" style={{ padding: 12 }}>
        We couldn't match {!f.origin ? "your departure city" : "the arrival city"} to an airport, so no fares to show. The partner search still works.
      </div>
    );
  if (!f.quotes.length)
    return (
      <div className="card small" style={{ padding: 12 }}>
        No fares cached yet for {route} on these dates (common for trips starting within days or many months out). The partner shows live prices.
      </div>
    );
  const best = f.quotes[0];
  return (
    <div className="card stack price" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <span>
          <span className="small">Return flights {route}</span>
          <span style={{ display: "block", fontFamily: "var(--display)", fontWeight: 800, fontSize: 26 }}>from {euro(best.price)}</span>
        </span>
        <span className="badge soft-real">seen in the last 48 h</span>
      </div>
      <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 6 }}>
        {f.quotes.map((q, i) => (
          <li key={q.url} className="row" style={{ justifyContent: "space-between", padding: "8px 10px", borderRadius: 12, background: i === 0 ? "var(--bg)" : "transparent", fontSize: 14 }}>
            <span>
              <b>{q.airline}</b> · {q.transfers === 0 ? "direct" : `${q.transfers} stop${q.transfers > 1 ? "s" : ""}`} · {fmtDate(q.departureAt)}
              {q.returnAt ? ` → ${fmtDate(q.returnAt)}` : ""}
            </span>
            <b>{euro(q.price)}</b>
          </li>
        ))}
      </ul>
      <a href={best.url} target="_blank" rel="noopener noreferrer" className={`btn${opened.has(best.url) ? " secondary" : ""}`} style={{ height: 46 }} onClick={() => mark(best.url)}>
        {opened.has(best.url) ? "Open again" : `Book on Aviasales · ${euro(best.price)}`}
        <Icon name="external" size={16} />
      </a>
    </div>
  );
}

/** Hotel rates per base town from Hotellook. */
function StayPrices({ stay, loading, city, nights, opened, mark }: { stay?: TripPrices["stays"][number]; loading: boolean; city: string; nights: number; opened: Set<string>; mark: (u: string) => void }) {
  if (loading) return <div className="skeleton" style={{ height: 80 }} aria-label="Looking up hotel rates" />;
  if (!stay) return null;
  if (!stay.hotels.length)
    return (
      <div className="card small" style={{ padding: 12 }}>
        No cached rates for {city} on these nights. The partner shows live prices.
      </div>
    );
  const best = stay.hotels[0];
  return (
    <div className="card stack price" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <span>
          <span className="small">
            {city} · {nights} {nights === 1 ? "night" : "nights"}
          </span>
          <span style={{ display: "block", fontFamily: "var(--display)", fontWeight: 800, fontSize: 26 }}>
            from {euro(best.priceFrom)} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>total</span>
          </span>
        </span>
        <span className="badge soft-real">{stay.hotels.length} found</span>
      </div>
      <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 6 }}>
        {stay.hotels.map((h, i) => (
          <li key={h.name} className="row" style={{ justifyContent: "space-between", padding: "8px 10px", borderRadius: 12, background: i === 0 ? "var(--bg)" : "transparent", fontSize: 14 }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {h.name}
              {h.stars ? <span className="small"> · {"★".repeat(Math.min(5, Math.round(h.stars)))}</span> : null}
            </span>
            <b style={{ flex: "none" }}>{euro(h.priceFrom)}</b>
          </li>
        ))}
      </ul>
      <a href={stay.searchUrl} target="_blank" rel="noopener noreferrer" className={`btn${opened.has(stay.searchUrl) ? " secondary" : ""}`} style={{ height: 46 }} onClick={() => mark(stay.searchUrl)}>
        {opened.has(stay.searchUrl) ? "Open again" : "Compare rooms on Hotellook"}
        <Icon name="external" size={16} />
      </a>
    </div>
  );
}
