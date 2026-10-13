import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import type { CheckStatus, RealityCard } from "../../shared/types";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { RealityCardView } from "../components/RealityCardView";

/** Reality Card for one place: a place in a many-places reel, a picked candidate or a typed name. */
export function PlacePage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const name = params.get("name") ?? "";
  const typed = params.get("typed") === "1";
  const [card, setCard] = useState<RealityCard | null>(null);
  const [check, setCheck] = useState<CheckStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    setCard(null);
    setError(null);
    api.getCheck(id).then((c) => !stop && setCheck(c)).catch(() => {});
    api
      .placeCard(id, name, typed)
      .then((r) => !stop && setCard(r.card))
      .catch((e: Error) => !stop && setError(e.message));
    return () => {
      stop = true;
    };
  }, [id, name, typed]);

  const context =
    check?.result?.outcome === "multi"
      ? `From a reel with ${check.result.places.length} places`
      : typed
        ? "The place you told us"
        : undefined;

  if (card) return <RealityCardView card={card} video={check?.video} backTo={`/check/${id}`} context={context} />;

  return (
    <main className="page">
      <div className="topbar">
        <Link to={`/check/${id}`} className="icon-btn plain" aria-label="Back">
          <Icon name="back" size={22} />
        </Link>
      </div>
      {error ? (
        <>
          <h1>We couldn't build this card</h1>
          <p className="lead">{error}</p>
        </>
      ) : (
        <>
          <h1 aria-live="polite">Checking {name}…</h1>
          <p className="lead">Comparing the reel with what visitors really find.</p>
          <div className="skeleton" style={{ height: 160 }} />
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 140 }} />
        </>
      )}
    </main>
  );
}
