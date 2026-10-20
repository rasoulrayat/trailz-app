import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router";
import type { Handoff, Offer, Trip, TripPrices } from "../../../shared/types";
import { Icon, type IconName } from "../../components/Icon";

const euro = (n: number) => `€${Math.round(n).toLocaleString("en-US")}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

type Step = { id: string; kind: "flights" | "stay" | "activities"; label: string; done: boolean };
const STEP_ICON: Record<Step["kind"], IconName> = { flights: "plane", stay: "bed", activities: "sun" };
const TAB_ORDER: Step["kind"][] = ["flights", "stay", "activities"];
const TAB_LABEL: Record<Step["kind"], string> = { flights: "Flight", stay: "Stay", activities: "Activities" };
type Tab = { id: Step["kind"]; label: string; steps: Step[]; done: boolean };

/** The person taps "book", leaves, and comes back: we ask once whether it worked. */
const PENDING_KEY = "tz_pending_booking";
type Pending = { tripId: string; step: string; label: string; at: number };

export function PricedTrip({
  trip,
  handoff,
  prices,
  onBooked,
  onChangeDates,
}: {
  trip: Trip;
  handoff: Handoff | null;
  prices: TripPrices | null | "loading";
  onBooked: (patch: Trip["booked"]) => Promise<void>;
  onChangeDates: () => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // Steps: one flight, one stay per base town, activities (only if the plan has bookable ones).
  // Without dates the worker has no priced stays; the hand-off's open-dated search links stand in so the step still exists.
  const pricedStays = prices !== "loading" && prices ? prices.stays : [];
  const stays = pricedStays.length ? pricedStays : (handoff?.stay ?? []).map((s) => ({ city: s.city, nights: s.nights, offers: [] as Offer[], checkIn: "", checkOut: "", searchUrl: s.url }));
  const activities = handoff?.activities ?? [];
  const steps: Step[] = [
    { id: "flights", kind: "flights", label: "Flight", done: !!trip.booked.flights },
    ...stays.map((s) => ({ id: `stay:${s.city}`, kind: "stay" as const, label: stays.length > 1 ? `Stay · ${s.city}` : "Stay", done: !!trip.booked.stay?.[s.city] })),
    ...(activities.length ? [{ id: "activities", kind: "activities" as const, label: "Activities", done: !!trip.booked.activities }] : []),
  ];
  const next = steps.find((s) => !s.done);
  // Three tabs: Flight, Stay (every base town, one section per town), Activities. Booking is still tracked per step,
  // so each town can be ticked off on its own. It opens on the first tab with something left to book.
  const tabs: Tab[] = TAB_ORDER.map((kind) => ({ id: kind, label: TAB_LABEL[kind], steps: steps.filter((s) => s.kind === kind) }))
    .filter((t) => t.steps.length)
    .map((t) => ({ ...t, done: t.steps.every((s) => s.done) }));
  const [selectedTab, setSelectedTab] = useState<Step["kind"] | null>(null);
  const current = tabs.find((t) => t.id === selectedTab) ?? tabs.find((t) => !t.done) ?? tabs[0];
  const select = (id: Step["kind"], focus = false) => {
    setSelectedTab(id);
    if (focus) document.getElementById(`tab-${id}`)?.focus();
  };
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    select(tabs[(to + tabs.length) % tabs.length].id, true);
  };

  // Coming back from a partner: ask once.
  useEffect(() => {
    const check = () => {
      try {
        const raw = sessionStorage.getItem(PENDING_KEY);
        if (!raw) return;
        const p = JSON.parse(raw) as Pending;
        if (p.tripId === trip.id && Date.now() - p.at < 6 * 3600_000) setPending(p);
        else sessionStorage.removeItem(PENDING_KEY);
      } catch {
        /* storage unavailable */
      }
    };
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [trip.id]);
  const leaveFor = (step: Step) => {
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ tripId: trip.id, step: step.id, label: step.label, at: Date.now() } satisfies Pending));
    } catch {
      /* ignore */
    }
  };
  const answer = async (yes: boolean) => {
    const p = pending;
    setPending(null);
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
    if (!p || !yes) return;
    const step = steps.find((s) => s.id === p.step);
    if (!step) return;
    await markAndMoveOn(step);
  };
  const mark = (step: Step, done = true) =>
    onBooked(step.kind === "flights" ? { flights: done } : step.kind === "activities" ? { activities: done } : { stay: { [step.id.slice(5)]: done } });
  /** After "Yes, booked": another town in the same tab still to book → stay and scroll to it; otherwise the next tab. */
  const markAndMoveOn = async (step: Step) => {
    await mark(step);
    const left = (kind: Step["kind"]) => steps.filter((s) => s.kind === kind && s.id !== step.id && !s.done);
    const sameTab = left(step.kind);
    if (sameTab.length) {
      setSelectedTab(step.kind);
      requestAnimationFrame(() => document.getElementById(`sec-${sameTab[0].id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    const order = tabs.map((t) => t.id);
    const after = [...order.slice(order.indexOf(step.kind) + 1), ...order].find((k) => k !== step.kind && left(k).length);
    if (after) setSelectedTab(after);
  };

  // The one number: best flight + best stays (per person) + the plan's activity estimate.
  const total = useMemo(() => {
    if (prices === "loading" || !prices) return null;
    const flight = prices.flights?.offers.find((o) => o.kind !== "search")?.price ?? null;
    // Per base town: the best priced offer, or that town's share of the plan's stay estimate (by nights), so a town
    // without a price never silently drops out of the number.
    const totalNights = prices.stays.reduce((n, s) => n + s.nights, 0) || 1;
    let pricedAny = false;
    const stayTotal = prices.stays.reduce((sum, s) => {
      const best = s.offers.find((o) => o.kind !== "search");
      if (best) pricedAny = true;
      return sum + (best ? best.price / Math.max(1, trip.travelers) : (trip.plan.estimate.stay * s.nights) / totalNights);
    }, 0);
    if (flight === null && !pricedAny) return null;
    const live = [...(prices.flights?.offers ?? []), ...prices.stays.flatMap((s) => s.offers)].some((o) => o.freshness === "live" && o.kind !== "search");
    return { value: (flight ?? trip.plan.estimate.travel) + (pricedAny ? stayTotal : trip.plan.estimate.stay) + trip.plan.estimate.activities, live, flight, stayTotal };
  }, [prices, trip]);

  const flightsSection = (() => {
    if (prices === "loading") return <Skeleton h={190} />;
    const f = prices?.flights;
    const step = steps[0];
    const offers = f?.offers ?? (handoff?.flights ?? []).map((x) => searchRow(x.partner, x.url));
    const route = f?.origin && f?.destination ? `${f.origin.code} → ${f.destination.code}` : `${trip.origin} → ${trip.plan.gateway?.arrive ?? trip.places[0]?.name ?? ""}`;
    const sub = trip.startDate ? `${fmt(trip.startDate)} · ${trip.travelers} ${trip.travelers === 1 ? "traveler" : "travelers"}` : "dates open";
    return <Section step={step} icon="plane" title={`Flights ${route}`} sub={sub} offers={offers} unit="per person" open={!!open[step.id]} toggle={() => setOpen((o) => ({ ...o, [step.id]: !o[step.id] }))} onLeave={() => leaveFor(step)} onUndo={() => mark(step, false)} />;
  })();

  return (
    <>
      <main className="page" style={{ gap: 16 }}>
        <div className="topbar">
          <Link to={`/trips/${trip.id}`} className="icon-btn plain" aria-label="Back to plan">
            <Icon name="back" size={22} />
          </Link>
          <span className="small" style={{ flex: 1, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{trip.plan.title}</span>
          <button className="btn link" style={{ height: 36, padding: "0 6px", fontSize: 13, width: "auto", flex: "none" }} onClick={onChangeDates}>
            Change
          </button>
        </div>

        <section className="cost" style={{ gap: 6 }}>
          {prices === "loading" ? (
            <>
              <span className="small" style={{ color: "var(--muted-on-dark)" }}>Checking live prices…</span>
              <span className="skeleton" style={{ height: 34, width: 160, background: "var(--navy-2)" }} />
            </>
          ) : total ? (
            <>
              <span style={{ fontSize: 13, color: "var(--muted-on-dark)" }}>This trip, per person</span>
              <span className="big-number" style={{ fontSize: 34, lineHeight: 1 }}>
                {euro(total.value)}
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted-on-dark)", marginLeft: 8 }}>{total.live ? "live" : "recent prices"}</span>
              </span>
              <span style={{ fontSize: 12, color: "var(--muted-on-dark)" }}>
                {total.flight !== null ? `flight ${euro(total.flight)}` : "flight est."} · {total.stayTotal ? `stay ${euro(total.stayTotal)}` : "stay est."} · activities ~{euro(trip.plan.estimate.activities)}
                {trip.startDate ? ` · ${fmt(trip.startDate)}` : ""}
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 13, color: "var(--muted-on-dark)" }}>Estimated per person</span>
              <span className="big-number" style={{ fontSize: 34, lineHeight: 1 }}>{euro(trip.plan.estimate.travel + trip.plan.estimate.stay + trip.plan.estimate.activities)}</span>
              <span style={{ fontSize: 12, color: "var(--muted-on-dark)" }}>Live prices need exact dates. The searches below are open-dated.</span>
            </>
          )}
        </section>

        {!next && (
          <Link to={`/trips/${trip.id}`} className="btn accent">
            <Icon name="check" size={18} />
            All booked. See your trip
          </Link>
        )}

        <div className="btabs" role="tablist" aria-label="What to book">
          {tabs.map((t, i) => {
            const on = t.id === current.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={on}
                aria-controls={`panel-${t.id}`}
                tabIndex={on ? 0 : -1}
                className={`btab${on ? " on" : ""}${t.done ? " done" : ""}`}
                onClick={() => select(t.id)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                <Icon name={t.done ? "check" : STEP_ICON[t.id]} size={18} />
                <span className="btab-text">
                  <b>{t.label}</b>
                  <span>{tabLine(t, prices, trip)}</span>
                </span>
              </button>
            );
          })}
        </div>

        <Panel id="flights" current={current.id}>{flightsSection}</Panel>

        {stays.length > 0 && (
          <Panel id="stay" current={current.id}>
            <div className="stack" style={{ gap: 12 }}>
              {stays.length > 1 && (
                <p className="small" style={{ margin: 0 }}>
                  {stays.length} places to stay, {stays.reduce((n, s) => n + s.nights, 0)} nights: book each one.{" "}
                  {stays.map((s) => s.city).join(" → ")}
                </p>
              )}
        {stays.map((s) => {
              const step = steps.find((x) => x.id === `stay:${s.city}`)!;
              if (prices === "loading") return <Skeleton key={s.city} h={170} />;
              const offers = s.offers.length ? s.offers : handoff ? (handoff.stay.filter((h) => h.city === s.city).map((h) => searchRow(h.partner, h.url))) : [];
              return (
                <Section
                  key={s.city}
                  step={step}
                  icon="bed"
                  title={`Stay in ${s.city}`}
                  sub={`${s.nights} ${s.nights === 1 ? "night" : "nights"}${s.checkIn ? ` · ${fmt(s.checkIn)} → ${fmt(s.checkOut)}` : ""} · total for ${trip.travelers === 1 ? "1 person" : `${trip.travelers} people`}`}
                  offers={offers}
                  unit="total"
                  open={!!open[step.id]}
                  toggle={() => setOpen((o) => ({ ...o, [step.id]: !o[step.id] }))}
                  onLeave={() => leaveFor(step)}
                  onUndo={() => mark(step, false)}
                />
              );
            })}
            </div>
          </Panel>
        )}

        {activities.length > 0 && (
          <Panel id="activities" current={current.id}>
            <ActivitiesSection step={steps.find((s) => s.id === "activities")!} items={activities} estimate={trip.plan.estimate.activities} onLeave={() => leaveFor(steps.find((s) => s.id === "activities")!)} onMark={() => markAndMoveOn(steps.find((s) => s.id === "activities")!)} onUndo={() => mark(steps.find((s) => s.id === "activities")!, false)} />
          </Panel>
        )}

        <p className="small" style={{ margin: "4px 0 0", lineHeight: 1.5 }}>
          Nothing is charged in TrailZ: you pay the airline, hotel or tour company directly, and their price, payment and cancellation terms apply.
          {prices !== "loading" && prices?.sources.length ? ` Prices from ${prices.sources.join(", ")}; live ones were checked just now.` : ""}
        </p>
      </main>

      {pending && (
        <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Did you book it?">
          <div className="sheet">
            <h2 style={{ fontSize: 20, fontFamily: "var(--display)" }}>Did you book the {stepWords(pending.label)}?</h2>
            <p className="lead">We'll tick it off and move you to the next part.</p>
            <div className="row" style={{ gap: 10 }}>
              <button className="btn secondary" style={{ flex: 1 }} onClick={() => answer(false)}>
                Not yet
              </button>
              <button className="btn" style={{ flex: 1 }} onClick={() => answer(true)}>
                <Icon name="check" size={18} /> Yes, booked
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** The small line under a tab: its best price, "Booked", or how far the stays are. */
function tabLine(t: Tab, prices: TripPrices | null | "loading", trip: Trip): string {
  if (t.done) return "Booked";
  if (prices === "loading") return "checking…";
  if (t.id !== "stay" || t.steps.length === 1) return bestPrice(t.steps[0], prices, trip) ?? "search";
  const booked = t.steps.filter((s) => s.done).length;
  if (booked) return `${booked} of ${t.steps.length} booked`;
  const each = t.steps.map((s) => (prices ? prices.stays.find((x) => x.city === s.id.slice(5))?.offers.find((o) => o.kind !== "search")?.price : undefined));
  return each.every((p) => p !== undefined) ? `${euro(each.reduce((a: number, p) => a + (p ?? 0), 0))} · ${t.steps.length} places` : `${t.steps.length} places`;
}

function bestPrice(step: Step, prices: TripPrices | null | "loading", trip: Trip): string | null {
  if (prices === "loading" || !prices) return null;
  if (step.kind === "flights") {
    const o = prices.flights?.offers.find((x) => x.kind !== "search");
    return o ? euro(o.price) : null;
  }
  if (step.kind === "stay") {
    const o = prices.stays.find((s) => s.city === step.id.slice(5))?.offers.find((x) => x.kind !== "search");
    return o ? euro(o.price) : null;
  }
  return trip.plan.estimate.activities ? `~${euro(trip.plan.estimate.activities)}` : null;
}

const searchRow = (partner: string, url: string): Offer => ({
  provider: partner.toLowerCase().includes("kiwi") ? "kiwi" : "booking",
  providerLabel: partner,
  kind: "search",
  freshness: "live",
  price: 0,
  currency: "EUR",
  title: `Search all on ${partner}`,
  bookUrl: url,
  unit: "per person",
});

/** One tab's content. Every panel stays in the page (hidden when not selected), so the tabs only switch the view. */
function Panel({ id, current, children }: { id: Step["kind"]; current: Step["kind"]; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={id !== current}>
      {children}
    </div>
  );
}

function Skeleton({ h }: { h: number }) {
  return <div className="skeleton" style={{ height: h }} aria-label="Checking prices" />;
}

/** One decision: the best option big, the rest folded. */
function Section({
  step,
  icon,
  title,
  sub,
  offers,
  unit,
  open,
  toggle,
  onLeave,
  onUndo,
}: {
  step: Step;
  icon: IconName;
  title: string;
  sub: string;
  offers: Offer[];
  unit: "per person" | "total";
  open: boolean;
  toggle: () => void;
  onLeave: () => void;
  onUndo: () => void;
}) {
  const priced = offers.filter((o) => o.kind !== "search");
  const searches = offers.filter((o) => o.kind === "search");
  const best = priced[0] ?? searches[0];
  const rest = best ? offers.filter((o) => o !== best) : [];
  // Honesty line: a cached fare noticeably cheaper than the live one on top.
  const cheaperRecent =
    best && best.kind !== "search" && best.freshness === "live"
      ? priced.filter((o) => o.freshness === "cached" && !o.approx && o.price < best.price * 0.95).sort((a, b) => a.price - b.price)[0]
      : undefined;
  return (
    <section id={`sec-${step.id}`} className={`decision${step.done ? " done" : ""}`} aria-label={title}>
      <header className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <span className="tl-icon" style={{ background: step.done ? "var(--real)" : "var(--blue-tint)", color: step.done ? "#fff" : "var(--blue)" }}>
          <Icon name={step.done ? "check" : icon} size={18} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="row-title" style={{ fontSize: 15 }}>{title}</span>
          <span className="row-sub">{sub}</span>
        </span>
        {step.done && (
          <button className="btn link" style={{ height: 32, padding: 0, fontSize: 12 }} onClick={onUndo}>
            Undo
          </button>
        )}
      </header>

      {step.done ? (
        <div className="tip" style={{ background: "var(--real-tint)", color: "var(--real)" }}>
          <Icon name="check" size={18} />
          <span>Booked. The confirmation comes from the provider by email.</span>
        </div>
      ) : !best ? (
        <div className="small">No prices yet for these dates. Use the search below.</div>
      ) : (
        <>
          <Best offer={best} unit={unit} onLeave={onLeave} />
          {cheaperRecent && (
            <button className="small" style={{ textAlign: "left", background: "none", border: 0, padding: 0, color: "var(--muted)", cursor: "pointer" }} onClick={() => !open && toggle()}>
              A fare seen recently was {euro(cheaperRecent.price)}. It may be gone; it's in the options below.
            </button>
          )}
          {rest.length > 0 && (
            <>
              <button className="more" onClick={toggle} aria-expanded={open}>
                {open ? "Fewer options" : `More options (${rest.length})`}
                <Icon name="chevron" size={16} />
              </button>
              {open && (
                <div className="stack" style={{ gap: 6 }}>
                  {rest.map((o, i) => (
                    <Row key={o.bookUrl + i} o={o} unit={unit} onLeave={onLeave} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function Fresh({ o }: { o: Offer }) {
  if (o.kind === "search") return null;
  return (
    <span className={`fresh ${o.approx ? "approx" : o.freshness}`}>
      <span className="dot" aria-hidden="true" />
      {o.approx ? "different dates" : o.freshness === "live" ? "live price" : "seen recently"}
    </span>
  );
}

function Best({ offer, unit, onLeave }: { offer: Offer; unit: string; onLeave: () => void }) {
  if (offer.kind === "search")
    return (
      <a href={offer.bookUrl} target="_blank" rel="noopener noreferrer" className="btn" style={{ height: 48 }} onClick={onLeave}>
        {offer.title}
        <Icon name="external" size={16} />
      </a>
    );
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <span style={{ minWidth: 0 }}>
          <span className="offer-title" style={{ fontSize: 15, whiteSpace: "normal" }}>{offer.title}</span>
          <Fresh o={offer} />
        </span>
        <span style={{ textAlign: "right", flex: "none" }}>
          <span style={{ display: "block", fontFamily: "var(--display)", fontWeight: 800, fontSize: 24, lineHeight: 1 }}>{euro(offer.price)}</span>
          <span className="small">{unit}</span>
        </span>
      </div>
      <a href={offer.bookUrl} target="_blank" rel="noopener noreferrer" className="btn" style={{ height: 48 }} onClick={onLeave}>
        Book on {offer.providerLabel} · {euro(offer.price)}
        <Icon name="external" size={16} />
      </a>
    </div>
  );
}

function Row({ o, unit, onLeave }: { o: Offer; unit: string; onLeave: () => void }) {
  return (
    <a href={o.bookUrl} target="_blank" rel="noopener noreferrer" className="offer" onClick={onLeave} aria-label={o.kind === "search" ? o.title : `${o.title}, ${euro(o.price)} ${unit}, book on ${o.providerLabel}`}>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="offer-title">{o.title}</span>
        <span className="offer-sub">
          {o.kind === "search" ? "opens the partner's full search, dates and travelers filled in" : <><Fresh o={o} />· book on {o.providerLabel}</>}
        </span>
        {o.note && <span className="offer-sub">{o.note}</span>}
      </span>
      <span className="offer-price">
        {o.kind !== "search" && <b>{euro(o.price)}</b>}
        <Icon name="external" size={12} />
      </span>
    </a>
  );
}

function ActivitiesSection({ step, items, estimate, onLeave, onMark, onUndo }: { step: Step; items: Handoff["activities"]; estimate: number; onLeave: () => void; onMark: () => void; onUndo: () => void }) {
  return (
    <section id={`sec-${step.id}`} className={`decision${step.done ? " done" : ""}`} aria-label="Activities">
      <header className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <span className="tl-icon" style={{ background: step.done ? "var(--real)" : "var(--real-tint)", color: step.done ? "#fff" : "var(--real)" }}>
          <Icon name={step.done ? "check" : "sun"} size={18} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="row-title" style={{ fontSize: 15 }}>Things to book ahead</span>
          <span className="row-sub">{items.length} from your plan · about {euro(estimate)} per person</span>
        </span>
        {step.done && (
          <button className="btn link" style={{ height: 32, padding: 0, fontSize: 12 }} onClick={onUndo}>
            Undo
          </button>
        )}
      </header>
      {step.done ? (
        <div className="tip" style={{ background: "var(--real-tint)", color: "var(--real)" }}>
          <Icon name="check" size={18} />
          <span>Booked.</span>
        </div>
      ) : (
        <>
          <div className="acts">
            {items.map((a) => {
              const options = a.options?.length ? a.options : [{ partner: a.partner, url: a.url, label: a.partner }];
              return (
                <div key={`${a.place}·${a.note}`} className="act">
                  <span>
                    <span className="offer-title">{a.place}</span>
                    <span className="offer-sub">{a.note}</span>
                  </span>
                  <span className="act-btns">
                    {options.map((o, i) => {
                      const [name, ...rest] = o.label.split(" · ");
                      return (
                        <a key={o.url} href={o.url} target="_blank" rel="noopener noreferrer" className={`btn act-btn${i ? " secondary" : ""}`} onClick={onLeave} aria-label={`Book ${a.place} on ${o.partner}`}>
                          <b>{name}</b>
                          {rest.length > 0 && <span>· {rest.join(" · ")}</span>}
                          <Icon name="external" size={12} />
                        </a>
                      );
                    })}
                  </span>
                </div>
              );
            })}
          </div>
          {items.some((a) => a.options?.some((o) => o.partner === "Tiqets")) && (
            <p className="small" style={{ margin: 0 }}>Tiqets opens the exact ticket when it sells one for that place, otherwise its page for the town. Pick the date there.</p>
          )}
          <button className="btn secondary" style={{ height: 44 }} onClick={onMark}>
            <Icon name="check" size={16} /> I've booked these
          </button>
        </>
      )}
    </section>
  );
}

export type { ReactNode };

/** "Flight" → "flight", "Stay · Lisbon" → "stay in Lisbon" (the city keeps its capitals). */
const stepWords = (label: string) => (label.startsWith("Stay · ") ? `stay in ${label.slice(7)}` : label.toLowerCase());
