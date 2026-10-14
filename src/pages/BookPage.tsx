import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import type { Handoff, Trip, TripPrices } from "../../shared/types";
import { forgetPrices, pricesShared, tripsApi } from "../api";
import { PricedTrip } from "./book/PricedTrip";
import { TripSetup } from "./book/TripSetup";

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

  // A trip without dates goes to setup; with dates, straight to prices (prefetched from the trip page).
  useEffect(() => {
    tripsApi.getTrip(id).then((r) => {
      setTrip(r.trip);
      setEditing(!r.trip.startDate && r.trip.status !== "saved");
      if (r.trip.startDate || r.trip.status === "saved") load(r.trip);
    });
  }, [id]);

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
