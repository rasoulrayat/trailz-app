import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Profile } from "../../shared/types";
import { markOnboarded, saveProfile, useMe } from "../auth";
import { homeCity, loadCountries } from "../cities";
import { GoogleButton } from "../components/Account";
import { CityPicker } from "../components/CityPicker";
import { Icon } from "../components/Icon";
import { Img } from "../components/Img";
import { prefetchGalleries, thumb, usePlaceGallery } from "../components/PlacePhoto";
import { HOOK_PHOTO, VIBES } from "../onboarding-data";

const STEPS = 4;

/**
 * First-run intro: one hook screen, two questions (vibe, home city), then "keep it everywhere" (Google) or skip.
 * Every answer is optional and saved as it's given, so leaving halfway still counts. Who's coming and budget are
 * asked per trip instead (travelers on "When do you go?", budget on "Plan your trip").
 */
export function WelcomePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const me = useMe();
  const editing = params.get("step") === "1";
  const [step, setStep] = useState(editing ? 1 : 0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [picks, setPicks] = useState<Profile>({ vibes: [] });
  const seeded = useRef(false);

  // The vibe photos start downloading while the hook screen is on, so the grid opens already filled;
  // the city list once the vibe step is up, so the home step opens ready to search.
  useEffect(() => {
    prefetchGalleries(VIBES.map((v) => v.photoQuery), 360);
  }, []);
  useEffect(() => {
    if (step >= 1) loadCountries().catch(() => null);
  }, [step]);

  // Editing existing picks: start from what's saved.
  useEffect(() => {
    if (me.loaded && me.profile && !seeded.current) {
      seeded.current = true;
      setPicks(me.profile);
    }
  }, [me.loaded, me.profile]);

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(Math.max(0, Math.min(STEPS - 1, n)));
  };
  const next = () => go(step + 1);
  const back = () => go(step - 1);

  const update = (patch: Partial<Profile>) => {
    setPicks((p) => ({ ...p, ...patch }));
    saveProfile(patch).catch(() => null);
  };

  // Reaching the last screen = intro seen, on this phone and on the account.
  useEffect(() => {
    if (step === STEPS - 1) {
      markOnboarded();
      saveProfile({ onboarded: true }).catch(() => null);
    }
  }, [step]);

  // Swipe between steps, like stories.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current;
    touch.current = null;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x;
    const dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 60) (dx < 0 ? next : back)();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const finish = () => {
    markOnboarded();
    navigate(editing ? "/me" : "/", { replace: true });
  };

  return (
    <div className="ob" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="ob-top">
        <div className="ob-bars" aria-label={`Step ${step + 1} of ${STEPS}`}>
          {Array.from({ length: STEPS }, (_, i) => (
            <span key={i} className={i < step ? "done" : i === step ? "on" : ""} />
          ))}
        </div>
        <div className="row" style={{ justifyContent: "space-between", minHeight: 36 }}>
          {step > 0 ? (
            <button className="icon-btn on-media" style={{ width: 36, height: 36 }} aria-label="Back" onClick={back}>
              <Icon name="back" size={18} />
            </button>
          ) : (
            <span />
          )}
          {step < STEPS - 1 && (
            <button className="ob-skip" onClick={step === 0 ? finish : next}>
              {step === 0 ? "Skip intro" : "Skip"}
            </button>
          )}
        </div>
      </div>

      <div key={step} className={`ob-step ${dir > 0 ? "from-right" : "from-left"}`}>
        {step === 0 && <Hook onNext={next} />}
        {step === 1 && (editing && !me.loaded ? <div className="ob-body"><h1 className="ob-h sm">What's your vibe?</h1><p className="ob-p">Loading your picks…</p></div> : <VibeStep picked={picks.vibes} onChange={(vibes) => update({ vibes })} onNext={next} />)}
        {step === 2 && (
          <HomeStep
            value={picks.home ?? ""}
            onDone={(home) => {
              if (home && home !== picks.home) update({ home });
              next();
            }}
          />
        )}
        {step === 3 && <Done picks={picks} signedIn={!!me.user} canLogin={me.canLogin} editing={editing} onFinish={finish} />}
      </div>
    </div>
  );
}

// ---------- 0. Hook ----------
function Hook({ onNext }: { onNext: () => void }) {
  return (
    <div className="ob-body hook">
      <figure className="hook-card">
        <div className="hook-reel" aria-hidden="true">
          <Img
            src={thumb(HOOK_PHOTO.url, 500)}
            srcSet={`${thumb(HOOK_PHOTO.url, 500)} 500w, ${thumb(HOOK_PHOTO.url, 960)} 960w`}
            sizes="300px"
            fetchPriority="high"
            style={{ position: "absolute", inset: 0, background: "transparent" }}
          />
          <span className="hook-shade" />
          <span className="hook-pill">
            <Icon name="play" size={10} /> on the reel
          </span>
          <span className="hook-side">
            <span>
              <Icon name="heart" size={22} />
              128k
            </span>
            <span>
              <Icon name="share" size={20} />
              2.1k
            </span>
          </span>
          <span className="hook-caption">
            <b>Oia, Greece</b>
            <span>“hidden gem · zero crowds · 10/10”</span>
          </span>
        </div>
        <div className="hook-real" aria-hidden="true">
          <span className="hook-stamp">6/10 real</span>
          <span>sunset = 2 h queue · best in May · from €640</span>
          <span className="hook-meter">
            {Array.from({ length: 10 }, (_, i) => (
              <i key={i} className={i < 6 ? "on" : ""} />
            ))}
          </span>
        </div>
        <figcaption className="hook-credit">
          <a href={HOOK_PHOTO.link} target="_blank" rel="noreferrer">
            Photo: {HOOK_PHOTO.credit} · {HOOK_PHOTO.license}
          </a>
        </figcaption>
      </figure>
      <h1 className="ob-h">
        Saw it on a reel?
        <br />
        <em>See it for real.</em>
      </h1>
      <p className="ob-p">Paste any TikTok, Reel or Short. We tell you what's actually there: crowds, cost, best month — then plan and book it.</p>
      <button className="btn ob-cta" onClick={onNext}>
        Let's go <Icon name="arrow" size={18} />
      </button>
    </div>
  );
}

// ---------- 1. Vibe ----------
function VibeStep({ picked, onChange, onNext }: { picked: string[]; onChange: (v: string[]) => void; onNext: () => void }) {
  const toggle = (id: string) => onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  return (
    <div className="ob-body">
      <h1 className="ob-h sm">What's your vibe?</h1>
      <p className="ob-p">Tap everything that's you. Explore learns from it.</p>
      <div className="vibe-grid">
        {VIBES.map((v) => (
          <VibeTile key={v.id} id={v.id} label={v.label} photoQuery={v.photoQuery} tint={v.tint} on={picked.includes(v.id)} onToggle={() => toggle(v.id)} />
        ))}
      </div>
      <button className="btn ob-cta" onClick={onNext}>
        {picked.length ? `Next · ${picked.length} picked` : "Next"} <Icon name="arrow" size={18} />
      </button>
    </div>
  );
}

function VibeTile({ id, label, photoQuery, tint, on, onToggle }: { id: string; label: string; photoQuery: string; tint: string; on: boolean; onToggle: () => void }) {
  const { photos } = usePlaceGallery(photoQuery);
  const src = photos[0] ? thumb(photos[0].url, 360) : null;
  return (
    <button type="button" className={`vibe-tile${on ? " on" : ""}`} style={{ background: tint }} aria-pressed={on} onClick={onToggle} data-vibe={id}>
      {src && <Img src={src} style={{ position: "absolute", inset: 0 }} />}
      <span className="vibe-shade" />
      <span className="vibe-check" aria-hidden="true">
        <Icon name="check" size={14} />
      </span>
      <span className="vibe-label">{label}</span>
    </button>
  );
}

// ---------- 2. Home city ----------
function HomeStep({ value, onDone }: { value: string; onDone: (home: string) => void }) {
  const [home, setHome] = useState(value);
  return (
    <div className="ob-body">
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="ob-h sm">Where do you fly from?</h1>
        <p className="ob-p">So every price starts at your airport, not someone else's.</p>
      </div>
      <CityPicker value={home} onPick={setHome} />
      <button className="btn ob-cta" type="button" onClick={() => onDone(home.trim())}>
        {home.trim() ? `Next · from ${homeCity(home)}` : "Skip this"} <Icon name="arrow" size={18} />
      </button>
    </div>
  );
}

// ---------- 3. Done ----------
function Done({ picks, signedIn, canLogin, editing, onFinish }: { picks: Profile; signedIn: boolean; canLogin: boolean; editing: boolean; onFinish: () => void }) {
  const chips = [
    ...picks.vibes.map((id) => VIBES.find((v) => v.id === id)?.label ?? id),
    picks.home ? `from ${homeCity(picks.home)}` : null,
  ].filter(Boolean) as string[];
  return (
    <div className="ob-body">
      <span className="ob-badge">
        <Icon name="check" size={22} />
      </span>
      <h1 className="ob-h sm">{editing ? "Picks updated." : chips.length ? "You're set." : "Fair enough, mystery traveller."}</h1>
      {chips.length > 0 && (
        <div className="chips" style={{ gap: 6 }}>
          {chips.map((x) => (
            <span key={x} className="chip ob-chip static">{x}</span>
          ))}
        </div>
      )}
      {signedIn ? (
        <>
          <p className="ob-p">Saved to your account. Explore is already sorting by your vibe.</p>
          <button className="btn ob-cta" onClick={onFinish}>
            {editing ? "Done" : "Show me reels"} <Icon name="arrow" size={18} />
          </button>
        </>
      ) : (
        <>
          <p className="ob-p">Keep your picks, saves and trips on every phone — and unlock prices when you're ready to book.</p>
          {canLogin && <GoogleButton next="/" light />}
          <button type="button" className="ob-skip center" onClick={onFinish}>
            Skip for now, just show me reels
          </button>
        </>
      )}
    </div>
  );
}
