/**
 * The home-city list for onboarding: every country and its towns of 15,000+ people (public/cities.json, built by
 * scripts/build-cities.mjs from GeoNames). Loaded only when the picker opens. Search is local and instant.
 */
export interface City {
  name: string;
  /** Second name that also matches a search: the local one for "Cologne" (Köln), or the English one. */
  other?: string;
  /** Population in thousands, for ranking. */
  pop: number;
  country: Country;
  key: string;
  otherKey?: string;
}

export interface Country {
  code: string;
  name: string;
  flag: string;
  key: string;
  cities: City[];
}

/** Lower case, no accents, words split by single spaces: "Thessaloníki" → "thessaloniki". */
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Regional-indicator letters; shows as the flag on phones. */
export const flagOf = (code: string) =>
  /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((ch) => 0x1f1a5 + ch.charCodeAt(0))) : "";

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function parseCities(data: { countries: Record<string, string> }): Country[] {
  const out: Country[] = [];
  for (const [code, packed] of Object.entries(data.countries)) {
    const name = countryName(code);
    const country: Country = { code, name, flag: flagOf(code), key: fold(name), cities: [] };
    for (const row of packed ? packed.split("|") : []) {
      const [cityName, pop, other] = row.split("~");
      if (!cityName) continue;
      country.cities.push({ name: cityName, other: other || undefined, pop: Number(pop) || 1, country, key: fold(cityName), otherKey: other ? fold(other) : undefined });
    }
    out.push(country);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "en"));
}

let loading: Promise<Country[]> | null = null;
export function loadCountries(): Promise<Country[]> {
  loading ??= fetch("/cities.json")
    .then((r) => {
      if (!r.ok) throw new Error(`cities ${r.status}`);
      return r.json();
    })
    .then(parseCities)
    .catch((err) => {
      loading = null; // try again next time
      throw err;
    });
  return loading;
}

/** How well a name matches: 0 starts with it, 1 a word starts with it, 2 contains it, -1 no match. */
function tier(key: string | undefined, q: string): number {
  if (!key) return -1;
  if (key.startsWith(q)) return 0;
  if (` ${key}`.includes(` ${q}`)) return 1;
  return q.length >= 3 && key.includes(q) ? 2 : -1;
}

/**
 * Cities and countries for what someone typed. Bigger places first within the same kind of match; a city named
 * exactly what was typed counts as ten times bigger, so "porto" puts Porto above Porto Alegre.
 * "utrecht, neth" narrows to countries starting with "neth".
 */
export function searchPlaces(countries: Country[], query: string, limit = 40): { countries: Country[]; cities: City[] } {
  const [cityPart, countryPart] = query.split(",").map(fold);
  const q = cityPart ?? "";
  if (!q) return { countries: [], cities: [] };
  const inCountries = countryPart ? countries.filter((c) => tier(c.key, countryPart) >= 0) : countries;
  const scored: { c: City; t: number; w: number }[] = [];
  for (const country of inCountries) {
    for (const c of country.cities) {
      const a = tier(c.key, q);
      const b = tier(c.otherKey, q);
      const t = a < 0 ? b : b < 0 ? a : Math.min(a, b);
      if (t < 0) continue;
      const exact = c.key === q || c.otherKey === q;
      scored.push({ c, t, w: c.pop * (exact ? 10 : 1) });
    }
  }
  scored.sort((x, y) => x.t - y.t || y.w - x.w);
  const matchedCountries = countryPart
    ? []
    : countries
        .map((c) => ({ c, t: tier(c.key, q) }))
        .filter((x) => x.t >= 0 && x.t < 2)
        .sort((x, y) => x.t - y.t || x.c.name.localeCompare(y.c.name))
        .slice(0, 3)
        .map((x) => x.c);
  return { countries: matchedCountries, cities: scored.slice(0, limit).map((x) => x.c) };
}

/** What is saved as the home: "Utrecht, Netherlands" (the country helps find the right airport). Profiles keep 60 characters. */
export const homeOf = (c: City) => {
  const full = `${c.name}, ${c.country.name}`;
  return full.length <= 60 ? full : c.name.slice(0, 60);
};

/** The city part of a saved home, for short labels: "Utrecht, Netherlands" → "Utrecht". */
export const homeCity = (home: string | undefined | null) => (home ? home.split(",")[0].trim() : "");

/** The listed city a saved home or a guessed name points to, the biggest one when several share the name. */
export function findCity(countries: Country[], home: string | null | undefined): City | null {
  if (!home) return null;
  const [city, country] = home.split(",").map(fold);
  if (!city) return null;
  let best: City | null = null;
  for (const c of countries) {
    if (country && c.key !== country) continue;
    for (const x of c.cities) if ((x.key === city || x.otherKey === city) && (!best || x.pop > best.pop)) best = x;
  }
  return best;
}
