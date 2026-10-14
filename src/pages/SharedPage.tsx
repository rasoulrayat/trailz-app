import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { MOODS, type SharePayload, type ShareVotes } from "../../shared/types";
import { shareApi } from "../api";
import { Icon } from "../components/Icon";
import { MapView, toPoints } from "../components/MapView";
import { PhotoStrip } from "../components/PlacePhoto";
import { RealityCardView } from "../components/RealityCardView";

/** A shared card or trip: read-only, with "I'm in / Not for me". No account needed. */
export function SharedPage() {
  const { token = "" } = useParams();
  const [data, setData] = useState<SharePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    shareApi.get(token).then(setData).catch((e: Error) => setError(e.message));
  }, [token]);

  async function vote(v: "in" | "out") {
    if (!data) return;
    const r = await shareApi.vote(token, v, name || undefined).catch(() => null);
    if (r) setData({ ...data, votes: r.votes });
  }

  if (error)
    return (
      <main className="page">
        <h1>{error}</h1>
        <Link to="/" className="btn">Open TrailZ</Link>
      </main>
    );
  if (!data)
    return (
      <main className="page">
        <div className="skeleton" style={{ height: 260 }} />
      </main>
    );

  const votesBox = <VoteBox votes={data.votes} name={name} setName={setName} onVote={vote} />;

  if (data.kind === "check") {
    return (
      <>
        <RealityCardView card={data.card} video={data.video} backTo="/" readOnly footer={votesBox} />
      </>
    );
  }
  const { trip } = data;
  const mood = MOODS.find((m) => m.id === trip.mood)?.title ?? "";
  const est = trip.plan.estimate;
  return (
    <>
      <main className="page" style={{ gap: 16 }}>
        <div className="topbar" style={{ justifyContent: "flex-start" }}>
          <Link to="/" className="btn-sm">
            <Icon name="sparkle" size={14} /> TrailZ
          </Link>
          <span className="small">A friend's trip plan</span>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: 30 }}>{trip.plan.title}</h1>
          <div className="lead">
            {[trip.startDate ? `from ${trip.startDate}` : "dates open", `${trip.plan.days.length} days`, `${trip.travelers} ${trip.travelers === 1 ? "traveler" : "travelers"}`, mood.toLowerCase()].join(" · ")}
          </div>
          {trip.plan.summary && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{trip.plan.summary}</p>}
        </div>
        {votesBox}
        <div className="cost" style={{ gap: 4 }}>
          <span style={{ fontSize: 13, color: "var(--muted-on-dark)" }}>Estimated per person, from {trip.origin}</span>
          <span className="big-number" style={{ fontSize: 30 }}>€{(est.travel + est.stay + est.activities + est.food).toLocaleString("en-US")}</span>
        </div>
        <MapView points={toPoints(trip.places)} height={150} />
        {trip.plan.days.map((d) => (
          <section key={d.day} className="card stack" style={{ gap: 8 }}>
            <PhotoStrip q={[d.base || trip.places[0]?.name, trip.places[0]?.country].filter(Boolean).join(", ")} title={d.base || `Day ${d.day}`} height={110} />
            <h2 style={{ fontSize: 15 }}>
              Day {d.day} · {d.title}
            </h2>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: "var(--muted)" }}>
              {d.items.map((it, i) => (
                <li key={i}>
                  <b style={{ color: "var(--navy)" }}>{it.time}</b> {it.title}
                  {it.fromReel ? " 🎬" : ""}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <Link to="/" className="btn">
          <Icon name="sparkle" size={18} /> Plan your own trip on TrailZ
        </Link>
      </main>
    </>
  );
}

function VoteBox({ votes, name, setName, onVote }: { votes: ShareVotes; name: string; setName: (s: string) => void; onVote: (v: "in" | "out") => void }) {
  const total = votes.in + votes.out;
  return (
    <section className="card stack vote" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 15 }}>Are you in?</h2>
        <span className="small">{total ? `${votes.in} in · ${votes.out} not for me` : "No votes yet"}</span>
      </div>
      {total > 0 && (
        <div className="vote-bar" role="img" aria-label={`${votes.in} in, ${votes.out} out`}>
          <span style={{ width: `${(votes.in / total) * 100}%` }} />
        </div>
      )}
      {votes.names.length > 0 && <div className="small">In: {votes.names.join(", ")}</div>}
      {!votes.mine && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" className="plain-input" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px" }} />}
      <div className="row" style={{ gap: 8 }}>
        <button className={`btn secondary${votes.mine === "out" ? " saved" : ""}`} style={{ flex: 1 }} onClick={() => onVote("out")}>
          Not for me
        </button>
        <button className={`btn${votes.mine === "in" ? " accent" : ""}`} style={{ flex: 1 }} onClick={() => onVote("in")}>
          <Icon name="check" size={18} /> I'm in
        </button>
      </div>
      {votes.mine && <div className="small" style={{ textAlign: "center" }}>You voted {votes.mine === "in" ? "I'm in" : "not for me"}. Tap again to change.</div>}
    </section>
  );
}
