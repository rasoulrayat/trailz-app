import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import type { CheckStatus, RealityCard } from "../../shared/types";
import { api, placeCardShared } from "../api";
import { Icon } from "../components/Icon";
import { MapView } from "../components/MapView";
import { HeroPhotos } from "../components/PlacePhoto";
import { RealityCardView } from "../components/RealityCardView";

/** Where a place from this check's result is, and its country, so photos and map show before the card. */
function lookup(check: CheckStatus | null, name: string) {
  const r = check?.result;
  const key = name.toLowerCase();
  if (r?.outcome === "vibe") {
    const s = r.suggestions.find((x) => `${x.name}, ${x.country}`.toLowerCase() === key || x.name.toLowerCase() === key);
    if (s) return { title: s.name, q: `${s.name}, ${s.country}`, lat: s.lat, lng: s.lng };
  }
  const list = r?.outcome === "multi" ? r.places : r?.outcome === "pick" ? r.candidates : [];
  const p = list.find((x) => x.name.toLowerCase() === key);
  if (p) return { title: p.name, q: [p.name, p.country].filter(Boolean).join(", "), lat: p.lat, lng: p.lng };
  return { title: name.split(",")[0], q: name, lat: undefined, lng: undefined };
}

/** Reality Card for one place: a place in a many-places reel, a picked candidate, a vibe suggestion or a typed name. */
export function PlacePage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const name = params.get("name") ?? "";
  const typed = params.get("typed") === "1";
  const [card, setCard] = useState<RealityCard | null>(null);
  const [check, setCheck] = useState<CheckStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let stop = false;
    api.getCheck(id).then((c) => !stop && setCheck(c)).catch(() => {});
    return () => {
      stop = true;
    };
  }, [id]);

  useEffect(() => {
    let stop = false;
    setCard(null);
    setError(null);
    setSeconds(0);
    const started = Date.now();
    const tick = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    // Give up after 2 minutes so the page never spins forever.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("The AI is very busy right now. Try again in a minute.")), 120_000),
    );
    Promise.race([placeCardShared(id, name, typed), timeout])
      .then((r) => !stop && setCard(r.card))
      .catch((e: Error) => !stop && setError(e.message))
      .finally(() => clearInterval(tick));
    return () => {
      stop = true;
      clearInterval(tick);
    };
  }, [id, name, typed, attempt]);

  const context =
    check?.result?.outcome === "multi"
      ? `From a reel with ${check.result.places.length} places`
      : check?.result?.outcome === "vibe" && !typed
        ? "A place with the same vibe as your reel"
        : typed
          ? "The place you told us"
          : undefined;

  const vibe = check?.result?.outcome === "vibe" ? check.result.vibe : undefined;
  if (card) return <RealityCardView card={card} video={check?.video} backTo={`/check/${id}`} context={context} checkId={id} vibe={vibe} />;

  // While the card is written: the place's photos and map are ready already.
  const place = lookup(check, name);
  return (
    <>
      <HeroPhotos q={place.q} title={place.title}>
        {() => (
          <div className="top">
            <Link to={`/check/${id}`} className="icon-btn on-media" aria-label="Back">
              <Icon name="back" />
            </Link>
          </div>
        )}
      </HeroPhotos>
      <main className="page" style={{ gap: 18 }}>
        <div className="stack" style={{ gap: 8 }}>
          {context && <span className="small">{context}</span>}
          <h1 style={{ fontSize: 34, lineHeight: 1 }}>{place.title}</h1>
        </div>
        {error ? (
          <section className="card stack" style={{ padding: 16 }}>
            <h2 style={{ fontSize: 16 }}>We couldn't write this Reality Card</h2>
            <p className="lead" style={{ margin: 0 }}>
              {error}
            </p>
            <button className="btn" onClick={() => setAttempt((a) => a + 1)}>
              <Icon name="refresh" size={18} /> Try again
            </button>
          </section>
        ) : (
          <section className="card stack" style={{ padding: 16, gap: 10 }} aria-live="polite">
            <div className="row" style={{ gap: 10 }}>
              <span className="spinner" aria-hidden="true" />
              <h2 style={{ fontSize: 15 }}>Writing the Reality Card…</h2>
            </div>
            <p className="small" style={{ margin: 0 }}>
              {seconds < 20
                ? "Checking crowds, seasons and real costs. This usually takes 10 to 30 seconds."
                : seconds < 60
                  ? "Almost there. The AI is busier than usual right now."
                  : "Still working. Thanks for waiting, the AI is very busy right now."}
            </p>
            <div className="skeleton" style={{ height: 90 }} />
            <div className="skeleton" style={{ height: 70 }} />
          </section>
        )}
        {place.lat != null && place.lng != null && (
          <MapView points={[{ lat: place.lat, lng: place.lng, label: "", name: place.title, selected: true }]} height={170} />
        )}
      </main>
    </>
  );
}
