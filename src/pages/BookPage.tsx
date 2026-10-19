import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import type { Handoff, Trip, TripPrices } from "../../shared/types";
import { forgetPrices, pricesShared, tripsApi } from "../api";
import { useMe } from "../auth";
import { GoogleButton } from "../components/Account";
import { Icon } from "../components/Icon";
import { PhotoStrip } from "../components/PlacePhoto";
import { PricedTrip } from "./book/PricedTrip";
import { TripSetup } from "./book/TripSetup";
import { TabBar } from "../components/TabBar";

/**
 * Book = two screens. Trip setup (when, from where, how many) and then the priced trip:
 * one number, three decisions, each with its best option and a "book" button.
 */
export function BookPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [prices, setPrices] = useState<TripPrices | null | "loading">(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const me = useMe();
  const signedIn = me.loaded && !!me.user;

  // A trip without dates goes to setup; with dates, straight to prices (prefetched from the trip page).
  // Prices and booking need an account, so nothing is fetched until the person is signed in.
  useEffect(() => {
    if (!me.loaded) return;
    tripsApi.getTrip(id).then((r) => {
      setTrip(r.trip);
      setEditing(!r.trip.startDate && r.trip.status !== "saved");
      if (signedIn && (r.trip.startDate || r.trip.status === "saved")) load(r.trip);
    });
  }, [id, me.loaded, signedIn]);

  // Back from Duffel's checkout: the flight is booked.
  useEffect(() => {
    if (params.get("booked") === "flights" && trip && !trip.booked.flights) {
      tripsApi.updateTrip(trip.id, { booked: { flights: true } }).then((r) => setTrip(r.trip));
      setParams({}, { replace: true });
    }
    if (params.get("error") === "duffel") {
      setNotice("The airline checkout couldn't open. Pick another option, or try again in a minute.");
      setParams({}, { replace: true });
    }
  }, [params, trip, setParams]);

  function load(t: Trip) {
    tripsApi.handoff(t.id).then((h) => setHandoff(h.handoff)).catch(() => setHandoff(null));
    setPrices("loading");
    pricesShared(t.id)
      .then((r) => setPrices(r.prices))
      .catch(() => setPrices(null));
  }

  async function done(v: { startDate: string | null; origin: string; travelers: number }) {
    if (!trip || busy) return;
    setBusy(true);
    const r = await tripsApi.updateTrip(trip.id, { status: "saved", ...v }).catch(() => null);
    if (r) {
      forgetPrices(trip.id);
      setTrip(r.trip);
      setEditing(false);
      load(r.trip);
    }
    setBusy(false);
  }

  async function booked(patch: Trip["booked"]) {
    if (!trip) return;
    const r = await tripsApi.updateTrip(trip.id, { booked: patch }).catch(() => null);
    if (r) setTrip(r.trip);
  }

  if (!trip)
    return (
      <main className="page">
        <div className="skeleton" style={{ height: 60 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </main>
    );
  if (!signedIn) return <BookingGate trip={trip} />;
  if (editing) return <TripSetup trip={trip} onDone={done} busy={busy} />;
  return (
    <>
      {notice && (
        <div className="notice" role="status">
          <span style={{ flex: 1 }}>{notice}</span>
          <button className="icon-btn plain" style={{ width: 32, height: 32 }} aria-label="Dismiss" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}
      <PricedTrip trip={trip} handoff={handoff} prices={prices} onBooked={booked} onChangeDates={() => setEditing(true)} />
    </>
  );
}

/** The one place that needs an account: prices, "did you book it?" and partner links follow the person, not the phone. */
function BookingGate({ trip }: { trip: Trip }) {
  const [params] = useSearchParams();
  const failed = params.get("login") === "failed";
  const first = trip.places[0];
  const q = first ? [first.name, first.country].filter(Boolean).join(", ") : trip.plan.title;
  return (
    <>
    <main className="page" style={{ gap: 16 }}>
      <div className="topbar">
        <Link to={`/trips/${trip.id}`} className="icon-btn plain" aria-label="Back to the trip">
          <Icon name="back" />
        </Link>
        <span className="meta">Prices &amp; booking</span>
        <span style={{ width: 44 }} />
      </div>
      <PhotoStrip q={q} title={trip.plan.title} height={150} />
      <div>
        <h1 style={{ marginBottom: 6 }}>{trip.plan.title}</h1>
        <p className="lead">
          {trip.places.length} place{trip.places.length === 1 ? "" : "s"} · {trip.plan.days.length} days
        </p>
      </div>
      <div className="card stack gate" style={{ padding: 18, gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Log in to see prices</h2>
        <ul className="gate-list">
          <li>Flights from Kiwi, Google Flights and airlines, hotels from Booking.com — ranked, one number per trip.</li>
          <li>This trip and your saves on every phone you log in on.</li>
          <li>We remember what you booked, so nothing gets booked twice.</li>
        </ul>
        {failed && (
          <div className="field-error" role="alert">
            <Icon name="alert" size={16} /> <span>Google sign-in didn't finish. Try again.</span>
          </div>
        )}
        <GoogleButton next={`/trips/${trip.id}/book`} />
        <p className="small" style={{ margin: 0, textAlign: "center" }}>Free. We never post or read anything on your behalf.</p>
      </div>
    </main>
    <TabBar />
    </>
  );
}
