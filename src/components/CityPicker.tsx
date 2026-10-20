import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { findCity, homeOf, loadCountries, searchPlaces, type City, type Country } from "../cities";
import { guessHomeCity } from "../onboarding-data";
import { Icon } from "./Icon";

/**
 * Every country and its cities, with one search across all of them (canvas 02a–02c, 12a–12b).
 * Dark on onboarding's "Where do you fly from?"; light inside the trip's "Flying from" sheet, where it also offers
 * the profile's home city first. A town that isn't listed can be used as typed.
 */
const PAGE = 120;

export function CityPicker({
  value,
  onPick,
  home,
  light = false,
}: {
  /** The current pick: "Utrecht, Netherlands", or a name used as typed. */
  value: string;
  onPick: (value: string) => void;
  /** The profile's home city (trip sheet): offered first when the pick is somewhere else. */
  home?: string | null;
  light?: boolean;
}) {
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Country | null>(null);
  const [shown, setShown] = useState(PAGE);
  const deferred = useDeferredValue(query);
  const edge = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  // The search bar gets its backdrop only once it's pinned to the top, so it never shows as a band.
  useEffect(() => {
    const el = edge.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { root: el.closest(".ob-step, .sheet-scroll"), threshold: 0 });
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

  const picked = useMemo(() => (countries ? findCity(countries, value) : null), [countries, value]);
  const homeHit = useMemo(() => (countries && home ? findCity(countries, home) : null), [countries, home]);
  const guess = useMemo(() => {
    const g = guessHomeCity();
    return countries && g ? findCity(countries, g) : null;
  }, [countries]);
  const q = deferred.trim();
  const results = useMemo(() => {
    if (!countries || !q) return null;
    return open ? searchPlaces([open], q, 60) : searchPlaces(countries, q, 40);
  }, [countries, open, q]);

  const choose = (c: City) => onPick(homeOf(c));
  const openCountry = (c: Country | null) => {
    setOpen(c);
    setQuery("");
    setShown(PAGE);
    edge.current?.closest(".ob-step, .sheet-scroll")?.scrollTo({ top: 0 });
  };
  const typed = query.trim().replace(/\s+/g, " ").slice(0, 60);
  const exact = results?.cities.some((c) => c.key === typed.toLowerCase() || homeOf(c).toLowerCase() === typed.toLowerCase());
  const onWord = light ? "Selected" : "Your city";
  // The trip sheet: the pick and the profile's home city lead the list ("Amsterdam" and "Amsterdam, Netherlands" are the same city).
  const sameAsHome = !!home && (picked ? picked === homeHit : value.trim().toLowerCase() === home.trim().toLowerCase());
  const unlisted = !picked && value.trim().length > 1 ? value.trim() : null;
  const lead = picked ?? homeHit ?? guess;

  return (
    <div className={light ? "city-picker city-light" : "city-picker"}>
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
            <div key={i} className={`city-row ${light ? "skeleton" : "skeleton-dark"}`} />
          ))}
        </div>
      )}

      {failed && <p className="city-note">Couldn't load the city list. Type your city and use it as typed.</p>}

      {/* Searching: countries and cities at once */}
      {(results || (failed && typed)) && (
        <>
          {results && results.countries.length > 0 && (
            <>
              <div className="city-label">Countries</div>
              <div className="city-group">
                {results.countries.map((c) => (
                  <CountryRow key={c.code} c={c} short={light} onOpen={() => openCountry(c)} />
                ))}
              </div>
            </>
          )}
          <div className="city-label">{open ? `Cities in ${open.name}` : "Cities · every country"}</div>
          <div className="city-group">
            {results?.cities.map((c) => (
              <CityRow key={`${c.country.code}:${c.name}`} c={c} q={q} on={picked === c} onWord={onWord} showCountry={!open} onPick={() => choose(c)} />
            ))}
            {typed.length >= 2 && !exact && (
              <button type="button" className={`city-row${!picked && value === typed ? " on" : ""}`} onClick={() => onPick(typed)}>
                <span className="city-lead" aria-hidden="true">
                  <Icon name="pin" size={18} />
                </span>
                <span className="city-text">
                  <b>Use “{typed}” as I typed it</b>
                  <span>For a town that isn't listed</span>
                </span>
                {!picked && value === typed && <Icon name="check" size={18} />}
              </button>
            )}
          </div>
          {results && results.cities.length === 0 && typed.length < 2 && <p className="city-note">Keep typing…</p>}
        </>
      )}

      {/* Browsing one country */}
      {countries && !q && open && (
        <>
          <div className="city-label">Biggest first</div>
          <div className="city-group">
            {open.cities.slice(0, shown).map((c) => (
              <CityRow key={c.name} c={c} on={picked === c} onWord={onWord} onPick={() => choose(c)} />
            ))}
          </div>
          {open.cities.length > shown && (
            <button type="button" className="ob-skip center city-more" onClick={() => setShown((n) => n + PAGE * 2)}>
              Show more ({open.cities.length - shown} left)
            </button>
          )}
        </>
      )}

      {/* Browsing everything: the trip sheet */}
      {countries && !q && !open && light && (lead || unlisted) && (
        <>
          <div className="city-label">{sameAsHome || (!picked && !unlisted && homeHit) ? "Your city" : picked || unlisted ? "Flying from" : "Near you"}</div>
          <div className="city-group">
            {picked && <CityRow c={picked} on showCountry note={sameAsHome ? "from your profile" : "for this trip"} onPick={() => choose(picked)} />}
            {unlisted && (
              <button type="button" className="city-row on" aria-pressed="true" onClick={() => onPick(unlisted)}>
                <span className="city-lead" aria-hidden="true">
                  <Icon name="pin" size={18} />
                </span>
                <span className="city-text">
                  <b>{unlisted}</b>
                  <span>As you typed it</span>
                </span>
                <Icon name="check" size={18} />
              </button>
            )}
            {homeHit && homeHit !== picked && <CityRow c={homeHit} on={false} showCountry note="your city · one tap" onPick={() => choose(homeHit)} />}
            {!picked && !homeHit && guess && <GuessRow c={guess} onPick={() => choose(guess)} />}
            {lead && <CountryRow c={lead.country} short label={`Other cities in ${theCountry(lead.country.name)}`} onOpen={() => openCountry(lead.country)} />}
          </div>
        </>
      )}

      {/* Browsing everything: onboarding */}
      {countries && !q && !open && !light && (picked || guess) && (
        <>
          <div className="city-label">{picked ? "Your city" : "Near you"}</div>
          <div className="city-group">
            {picked ? <CityRow c={picked} on onWord={onWord} showCountry onPick={() => choose(picked)} /> : guess && <GuessRow c={guess} onPick={() => choose(guess)} />}
            <CountryRow c={(picked ?? guess)!.country} onOpen={() => openCountry((picked ?? guess)!.country)} />
          </div>
        </>
      )}

      {countries && !q && !open && (
        <>
          <div className="city-label">All countries · {countries.length}</div>
          <div className="city-group">
            {countries.map((c) => (
              <CountryRow key={c.code} c={c} short={light} onOpen={() => openCountry(c)} />
            ))}
          </div>
        </>
      )}

      {countries && <p className="city-credit">City list: GeoNames and simplemaps, CC BY 4.0</p>}
    </div>
  );
}

const count = (n: number) => `${n.toLocaleString("en")} ${n === 1 ? "city" : "cities"}`;

/** "the Netherlands", "the United Kingdom", "Spain". */
export const theCountry = (name: string) =>
  /^(Netherlands|Philippines|Bahamas|Gambia|Maldives|Seychelles|Comoros)$|Republic|Kingdom|States|Islands|Emirates/.test(name) ? `the ${name}` : name;

function CountryRow({ c, short, label, onOpen }: { c: Country; short?: boolean; label?: string; onOpen: () => void }) {
  return (
    <button type="button" className="city-row" onClick={onOpen}>
      <span className="city-lead city-flag" aria-hidden="true">{c.flag}</span>
      <span className="city-text">
        <b>{label ?? c.name}</b>
      </span>
      <span className="city-muted">{short ? c.cities.length.toLocaleString("en") : count(c.cities.length)}</span>
      <Icon name="chevron" size={16} />
    </button>
  );
}

function GuessRow({ c, onPick }: { c: City; onPick: () => void }) {
  return (
    <button type="button" className="city-row" onClick={onPick}>
      <span className="city-lead sky" aria-hidden="true">
        <Icon name="pin" size={20} />
      </span>
      <span className="city-text">
        <b>{c.name}</b>
        <span>{c.country.name} · your phone's time zone</span>
      </span>
      <span className="city-hint">one tap</span>
    </button>
  );
}

/** The typed part in bold, so it's clear why a city matched. */
function Marked({ text, q }: { text: string; q?: string }) {
  if (!q) return <>{text}</>;
  const plain = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const at = plain.indexOf(q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
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

function CityRow({ c, q, on, onWord = "Your city", note, showCountry, onPick }: { c: City; q?: string; on: boolean; onWord?: string; note?: string; showCountry?: boolean; onPick: () => void }) {
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
        <span>{[showCountry ? c.country.name : null, note ?? (on ? onWord : `${size} people`)].filter(Boolean).join(" · ")}</span>
      </span>
      {on && <Icon name="check" size={18} />}
    </button>
  );
}
