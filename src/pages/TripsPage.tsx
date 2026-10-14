import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Trip } from "../../shared/types";
import { tripsApi } from "../api";
import { Icon } from "../components/Icon";
import { PlaceThumb } from "../components/PlacePhoto";
import { TabBar } from "../components/TabBar";
import { tripMeta } from "./TripPage";

export function TripsPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  useEffect(() => {
    tripsApi
      .listTrips()
      .then((r) => setTrips(r.items))
      .catch(() => setTrips([]));
  }, []);
  const saved = trips?.filter((t) => t.status === "saved") ?? [];
  const drafts = trips?.filter((t) => t.status !== "saved") ?? [];

  const Row = ({ t }: { t: Trip }) => (
    <Link to={`/trips/${t.id}`} className="list-row" style={{ padding: 10 }}>
      <PlaceThumb q={[t.plan.days[0]?.base || t.places[0]?.name, t.places[0]?.country].filter(Boolean).join(", ")} title={t.plan.title} style={{ width: 64, height: 64, borderRadius: 14 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="row-title">{t.plan.title}</span>
        <span className="row-sub">{tripMeta(t)}</span>
        <span className="row-sub" style={{ color: "var(--navy)", marginTop: 2 }}>
          {t.places.map((p) => p.name).join(" · ")}
        </span>
      </span>
      <Icon name="chevron" size={18} />
    </Link>
  );

  return (
    <>
      <main className="page" style={{ gap: 18 }}>
        <div className="topbar">
          <h1>Trips</h1>
        </div>
        {trips === null ? (
          <div className="skeleton" style={{ height: 90 }} />
        ) : trips.length === 0 ? (
          <div className="card stack" style={{ padding: 18, alignItems: "center", textAlign: "center", gap: 8 }}>
            <span className="mood-icon">
              <Icon name="trips" size={22} />
            </span>
            <h2>No trips yet</h2>
            <p className="lead">Save a few places, then press "Plan this trip". Your plans, drafts and bookings live here.</p>
            <Link to="/saved" className="btn" style={{ width: "auto" }}>
              Go to Saved
            </Link>
          </div>
        ) : (
          <>
            {saved.length > 0 && (
              <section className="stack">
                <h2>Saved trips</h2>
                {saved.map((t) => (
                  <Row key={t.id} t={t} />
                ))}
              </section>
            )}
            {drafts.length > 0 && (
              <section className="stack">
                <h2>Drafts</h2>
                {drafts.map((t) => (
                  <Row key={t.id} t={t} />
                ))}
              </section>
            )}
          </>
        )}
      </main>
      <TabBar />
    </>
  );
}
