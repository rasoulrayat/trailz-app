import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Profile } from "../../shared/types";
import { markOnboarded, saveProfile, useMe } from "../auth";
import { findCity, homeCity, homeOf, loadCountries, searchPlaces, type City, type Country } from "../cities";
import { GoogleButton } from "../components/Account";
import { Icon } from "../components/Icon";
import { Img } from "../components/Img";
import { prefetchGalleries, thumb, usePlaceGallery } from "../components/PlacePhoto";
import { guessHomeCity, HOOK_PHOTO, VIBES } from "../onboarding-data";

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
const PAGE = 120;

function HomeStep({ value, onDone }: { value: string; onDone: (home: string) => void }) {
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [home, setHome] = useState(value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Country | null>(null);
  const [shown, setShown] = useState(PAGE);
  const deferred = useDeferredValue(query);
  const top = useRef<HTMLDivElement>(null);
  const edge = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  // The search bar gets its backdrop only once it's pinned to the top, so it never shows as a band.
  useEffect(() => {
    const el = edge.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { root: el.closest(".ob-step"), threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    loadCountries()
      .then((c) => live && setCountries(c))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const picked = useMemo(() => (countries ? findCity(countries, home) : null), [countries, home]);
  const guess = useMemo(() => {
    const g = guessHomeCity();
    return countries && g ? findCity(countries, g) : null;
  }, [countries]);
  const q = deferred.trim();
  const results = useMemo(() => {
    if (!countries || !q) return null;
    return open ? searchPlaces([open], q, 60) : searchPlaces(countries, q, 40);
  }, [countries, open, q]);

  const choose = (c: City) => setHome(homeOf(c));
  const openCountry = (c: Country | null) => {
    setOpen(c);
    setQuery("");
    setShown(PAGE);
    top.current?.scrollIntoView({ block: "start" });
  };
  const typed = query.trim().replace(/\s+/g, " ").slice(0, 60);
  const exact = results?.cities.some((c) => c.key === typed.toLowerCase() || homeOf(c).toLowerCase() === typed.toLowerCase());

  return (
    <div className="ob-body">
      <div ref={top} className="stack" style={{ gap: 8 }}>
        <h1 className="ob-h sm">Where do you fly from?</h1>
        <p className="ob-p">So every price starts at your airport, not someone else's.</p>
      </div>

      <div ref={edge} className="city-edge" aria-hidden="true" />
      <div className={`city-head${stuck ? " stuck" : ""}`}>
        {open && (
          <div className="city-crumb">
            <button type="button" className="city-back" onClick={() => openCountry(null)}>
              <Icon name="back" size={16} /> All countries
            </button>
            <span className="city-flag" aria-hidden="true">{open.flag}</span>
            <b>{open.name}</b>
            <span className="city-muted">{count(open.cities.length)}</span>
          </div>
        )}
        <label className="city-search">
          <Icon name="search" size={18} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder={open ? `Search in ${open.name}` : "Search a city or country"}
            aria-label={open ? `Search cities in ${open.name}` : "Search a city or country"}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {query && (
            <button type="button" className="city-clear" aria-label="Clear search" onClick={() => setQuery("")}>
              <Icon name="close" size={14} />
            </button>
          )}
        </label>
      </div>

      {!countries && !failed && (
        <div className="city-group" aria-busy="true" aria-label="Loading cities">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="city-row skeleton-dark" />
          ))}
        </div>
      )}

      {failed && <p className="ob-p small-note">Couldn't load the city list. Type your city and use it as typed.</p>}

      {/* Searching: countries and cities at once */}
      {(results || (failed && typed)) && (
        <>
          {results && results.countries.length > 0 && (
            <>
              <div className="city-label">Countries</div>
              <div className="city-group">
                {results.countries.map((c) => (
                  <CountryRow key={c.code} c={c} onOpen={() => openCountry(c)} />
                ))}
              </div>
            </>
          )}
          <div className="city-label">{open ? `Cities in ${open.name}` : "Cities · every country"}</div>
          <div className="city-group">
            {results?.cities.map((c) => (
              <CityRow key={`${c.country.code}:${c.name}`} c={c} q={q} on={picked === c} showCountry={!open} onPick={() => choose(c)} />
            ))}
            {typed.length >= 2 && !exact && (
              <button type="button" className={`city-row${!picked && home === typed ? " on" : ""}`} onClick={() => setHome(typed)}>
                <span className="city-lead" aria-hidden="true">
                  <Icon name="pin" size={18} />
                </span>
                <span className="city-text">
                  <b>Use “{typed}” as I typed it</b>
                  <span>For a town that isn't listed</span>
                </span>
                {!picked && home === typed && <Icon name="check" size={18} />}
              </button>
            )}
          </div>
          {results && results.cities.length === 0 && typed.length < 2 && <p className="ob-p small-note">Keep typing…</p>}
        </>
      )}

      {/* Browsing one country */}
      {countries && !q && open && (
        <>
          <div className="city-label">Biggest first</div>
          <div className="city-group">
            {open.cities.slice(0, shown).map((c) => (
              <CityRow key={c.name} c={c} on={picked === c} onPick={() => choose(c)} />
            ))}
          </div>
          {open.cities.length > shown && (
            <button type="button" className="ob-skip center" onClick={() => setShown((n) => n + PAGE * 2)}>
              Show more ({open.cities.length - shown} left)
            </button>
          )}
        </>
      )}

      {/* Browsing everything */}
      {countries && !q && !open && (
        <>
          {(picked || guess) && (
            <>
              <div className="city-label">{picked ? "Your city" : "Near you"}</div>
              <div className="city-group">
                {picked ? (
                  <CityRow c={picked} on showCountry onPick={() => choose(picked)} />
                ) : (
                  guess && (
                    <button type="button" className="city-row" onClick={() => choose(guess)}>
                      <span className="city-lead sky" aria-hidden="true">
                        <Icon name="pin" size={20} />
                      </span>
                      <span className="city-text">
                        <b>{guess.name}</b>
                        <span>{guess.country.name} · your phone's time zone</span>
                      </span>
                      <span className="city-hint">one tap</span>
                    </button>
                  )
                )}
                <CountryRow c={(picked ?? guess)!.country} onOpen={() => openCountry((picked ?? guess)!.country)} />
              </div>
            </>
          )}
          <div className="city-label">All countries · {countries.length}</div>
          <div className="city-group">
            {countries.map((c) => (
              <CountryRow key={c.code} c={c} onOpen={() => openCountry(c)} />
            ))}
          </div>
        </>
      )}

      {countries && <p className="city-credit">City list: GeoNames and simplemaps, CC BY 4.0</p>}

      <button className="btn ob-cta" type="button" onClick={() => onDone(home.trim())}>
        {home.trim() ? `Next · from ${homeCity(home)}` : "Skip this"} <Icon name="arrow" size={18} />
      </button>
    </div>
  );
}

const count = (n: number) => `${n.toLocaleString("en")} ${n === 1 ? "city" : "cities"}`;

function CountryRow({ c, onOpen }: { c: Country; onOpen: () => void }) {
  return (
    <button type="button" className="city-row" onClick={onOpen}>
      <span className="city-lead city-flag" aria-hidden="true">{c.flag}</span>
      <span className="city-text">
        <b>{c.name}</b>
      </span>
      <span className="city-muted">{count(c.cities.length)}</span>
      <Icon name="chevron" size={16} />
    </button>
  );
}

/** The typed part in bold, so it's clear why a city matched. */
function Marked({ text, q }: { text: string; q?: string }) {
  if (!q) return <>{text}</>;
  const plain = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const at = plain.indexOf(q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
  // Only safe to cut the original when accents didn't change its length.
  if (at < 0 || plain.length !== text.length) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

function CityRow({ c, q, on, showCountry, onPick }: { c: City; q?: string; on: boolean; showCountry?: boolean; onPick: () => void }) {
  const size = c.pop >= 1000 ? `${(c.pop / 1000).toFixed(c.pop >= 10_000 ? 0 : 1)}M` : `${c.pop}k`;
  return (
    <button type="button" className={`city-row${on ? " on" : ""}`} aria-pressed={on} onClick={onPick}>
      {showCountry && (
        <span className="city-lead city-flag" aria-hidden="true">
          {c.country.flag}
        </span>
      )}
      <span className="city-text">
        <b>
          <Marked text={c.name} q={q} />
          {c.other && <span className="city-other"> · <Marked text={c.other} q={q} /></span>}
        </b>
        <span>{[showCountry ? c.country.name : null, on ? "Your city" : `${size} people`].filter(Boolean).join(" · ")}</span>
      </span>
      {on && <Icon name="check" size={18} />}
    </button>
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
