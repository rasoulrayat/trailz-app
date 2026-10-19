import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { MOODS, type Mood } from "../../shared/types";
import { ApiFailure, tripsApi, type NewSave } from "../api";
import { Icon, type IconName } from "../components/Icon";
import { PlaceThumb } from "../components/PlacePhoto";
import { placesFromUrl } from "../plan-url";
import { useSaves } from "../saves";
import { Working } from "../components/Working";

const MOOD_ICON: Record<Mood, IconName> = { solo: "coffee", energetic: "bolt", friends: "users" };
const daysFor = (n: number) => Math.min(10, Math.max(2, Math.round(n * 1.5)));

/** Mood picker: one tap makes a plan. */
export function PlanPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { items: saved, loaded } = useSaves();
  const ids = useMemo(() => (params.get("ids") ?? "").split(",").filter(Boolean), [params]);
  const extra = useMemo(() => placesFromUrl(params), [params]);
  const places: NewSave[] = useMemo(
    () => [...ids.map((id) => saved.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s), ...extra],
    [ids, saved, extra],
  );

  const [mood, setMood] = useState<Mood | null>(null);
  const [budget, setBudget] = useState(false);
  const [days, setDays] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (places.length && !days) setDays(daysFor(places.length));
  }, [places.length, days]);
  useEffect(() => {
    if (!busy) return;
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  async function go() {
    if (!mood || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { trip } = await tripsApi.createTrip({ placeIds: ids, places: extra, mood, budgetMode: budget, days });
      navigate(`/trips/${trip.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  const back = ids.length ? "/saved" : -1;
  return (
    <>
      <main className="page" style={{ gap: 18 }}>
        <div className="topbar" style={{ justifyContent: "flex-start" }}>
          <button className="icon-btn plain" aria-label="Back" onClick={() => (typeof back === "string" ? navigate(back) : navigate(-1))}>
            <Icon name="back" size={22} />
          </button>
          <h1 style={{ fontSize: 26 }}>Plan your trip</h1>
        </div>

        {ids.length > 0 && !loaded ? (
          <div className="skeleton" style={{ height: 80 }} />
        ) : places.length === 0 ? (
          <div className="empty">No places chosen. Save a place or open a Reality Card first.</div>
        ) : (
          <section className="card stack" style={{ padding: 14, gap: 10 }}>
            <span className="small">{places.length === 1 ? "Your place" : `${places.length} places, in a sensible order`}</span>
            {places.length === 1 ? (
              <div className="row" style={{ gap: 12 }}>
                <PlaceThumb q={[places[0].name, places[0].country].filter(Boolean).join(", ")} title={places[0].name} count={false} style={{ width: 72, height: 72, borderRadius: 16 }} />
                <span style={{ minWidth: 0 }}>
                  <span className="row-title" style={{ fontSize: 16 }}>{places[0].name}</span>
                  {places[0].country && <span className="row-sub">{[places[0].region, places[0].country].filter(Boolean).join(" · ")}</span>}
                </span>
              </div>
            ) : (
              <ol className={`plan-places${places.length <= 3 ? " fit" : ""}`} aria-label="Places in this trip">
                {places.map((p, i) => (
                  <li key={p.name} className="plan-place">
                    <span className="plan-place-n" aria-hidden="true">{i + 1}</span>
                    <PlaceThumb q={[p.name, p.country].filter(Boolean).join(", ")} title={p.name} count={false} style={{ width: "100%", height: "auto", aspectRatio: "1", borderRadius: 16 }} />
                    <span className="plan-place-name">{p.name}</span>
                    {p.country && <span className="plan-place-sub">{p.country}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        <section className="stack">
          <h2>What kind of trip?</h2>
          {MOODS.map((m) => (
            <button key={m.id} type="button" className={`mood${mood === m.id ? " on" : ""}`} aria-pressed={mood === m.id} onClick={() => setMood(m.id)}>
              <span className="mood-icon">
                <Icon name={MOOD_ICON[m.id]} size={22} />
              </span>
              <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <span className="row-title">{m.title}</span>
                <span className="row-sub">{m.line}</span>
              </span>
              {mood === m.id && <Icon name="check" size={20} />}
            </button>
          ))}
        </section>

        <div className="row" style={{ gap: 10, alignItems: "stretch" }}>
          <div className="card stack" style={{ flex: 1, gap: 6 }}>
            <span className="small">Days</span>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Fewer days" onClick={() => setDays((d) => Math.max(2, d - 1))}>
                <Icon name="minus" size={16} />
              </button>
              <span style={{ fontSize: 20, fontWeight: 600 }}>{days}</span>
              <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="More days" onClick={() => setDays((d) => Math.min(14, d + 1))}>
                <Icon name="plus" size={16} />
              </button>
            </div>
          </div>
          <label className={`card row toggle${budget ? " on" : ""}`} style={{ flex: 1, cursor: "pointer" }}>
            <span style={{ flex: 1 }}>
              <span className="row-title" style={{ fontSize: 14 }}>
                Budget mode
              </span>
              <span className="row-sub">Hostels, buses, street food</span>
            </span>
            <input type="checkbox" className="sr-only" checked={budget} onChange={(e) => setBudget(e.target.checked)} />
            <span className="switch" aria-hidden="true" />
          </label>
        </div>

        {error && (
          <div className="tip" style={{ background: "var(--warn-tint)", color: "var(--warn)" }}>
            <Icon name="alert" size={18} />
            <span>{error}</span>
          </div>
        )}
        <p className="small" style={{ margin: 0 }}>
          Departure city and dates come later, when you book. Plans start from Amsterdam until you can set a home city.
        </p>
      </main>
      <div className="actionbar col">
        {busy ? (
          <Working label="Writing your plan" />
        ) : (
          <button className="btn" disabled={!mood || !places.length} onClick={go}>
            <Icon name="sparkle" size={18} />
            Make my plan
          </button>
        )}
        {busy && <span className="small" style={{ textAlign: "center" }}>{seconds > 40 ? "Taking longer than usual. Hang on, it's still working." : "Usually 20 to 40 seconds."}</span>}
        {!busy && (
          <Link to="/trips" className="small" style={{ textAlign: "center", color: "var(--blue)" }}>
            See my trips
          </Link>
        )}
      </div>
    </>
  );
}
