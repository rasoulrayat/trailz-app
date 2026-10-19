import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { logout, resetOnboarded, useMe } from "../auth";
import { GoogleButton } from "../components/Account";
import { Icon } from "../components/Icon";
import { TabBar } from "../components/TabBar";
import { homeCity } from "../cities";
import { VIBES } from "../onboarding-data";

/** Account: who you are, your picks, and the way out. */
export function MePage() {
  const me = useMe();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const p = me.profile;
  const picks = [
    ...(p?.vibes ?? []).map((id) => VIBES.find((v) => v.id === id)?.label ?? id),
    p?.home ? `from ${homeCity(p.home)}` : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <main className="page" style={{ gap: 16 }}>
        <div className="topbar">
          <button className="icon-btn plain" aria-label="Back" onClick={() => navigate(-1)}>
            <Icon name="back" />
          </button>
          <h1 style={{ margin: 0, fontSize: 22 }}>You</h1>
          <span style={{ width: 44 }} />
        </div>

        {!me.loaded ? (
          <div className="skeleton" style={{ height: 120, borderRadius: 20 }} />
        ) : me.user ? (
          <div className="card row" style={{ gap: 14, padding: 16 }}>
            <span className="avatar big">
              {me.user.avatar ? <img src={me.user.avatar} alt="" referrerPolicy="no-referrer" /> : <span>{(me.user.name ?? "?").charAt(0).toUpperCase()}</span>}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 17 }}>{me.user.name ?? "You"}</div>
              <div className="small" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{me.user.email}</div>
              <div className="small" style={{ color: "var(--real)", marginTop: 4 }}>Saves, trips and prices follow you to any phone.</div>
            </div>
          </div>
        ) : (
          <div className="card stack" style={{ padding: 16, gap: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 17 }}>You're browsing as a guest</div>
            <p className="lead">Everything you save lives on this phone only. Log in to keep it everywhere — and to see prices and book.</p>
            {me.canLogin && <GoogleButton next="/me" />}
          </div>
        )}

        <section className="card stack" style={{ padding: 16, gap: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Your picks</h2>
            <Link to="/welcome?step=1" className="small" style={{ color: "var(--blue)", fontWeight: 500 }}>
              Edit
            </Link>
          </div>
          {picks.length ? (
            <div className="chips" style={{ gap: 6 }}>
              {picks.map((x) => (
                <span key={x} className="chip soft">{x}</span>
              ))}
            </div>
          ) : (
            <p className="lead">No picks yet. Thirty seconds, and Explore starts matching your vibe.</p>
          )}
          <p className="small" style={{ margin: 0 }}>Used for: Explore's "My vibe" and where your trips start from.</p>
        </section>

        <section className="stack" style={{ gap: 8 }}>
          <button
            className="btn secondary"
            onClick={() => {
              resetOnboarded();
              navigate("/welcome");
            }}
          >
            <Icon name="play" size={16} /> Replay the intro
          </button>
          {me.user && (
            <button
              className="btn secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await logout().catch(() => null);
                setBusy(false);
                navigate("/");
              }}
            >
              <Icon name="logout" size={16} /> {busy ? "Logging out…" : "Log out"}
            </button>
          )}
        </section>

        <p className="small" style={{ textAlign: "center", margin: 0 }}>
          <Link to="/privacy" style={{ color: "var(--muted)" }}>Privacy &amp; your data</Link>
        </p>
      </main>
      <TabBar />
    </>
  );
}
