// Builds public/cities.json, the home-city list in onboarding: every country and its cities, biggest first.
//
//   npm i --no-save cities-15000-structured all-the-cities city-timezones
//   node scripts/build-cities.mjs > public/cities.json
//
// Sources: GeoNames cities15000 (CC BY 4.0) for the cities, topped up from GeoNames cities1000 (all-the-cities) so
// small countries still list a few towns; simplemaps world cities (city-timezones, CC BY 4.0) only for English names
// ("Cologne" for Köln), kept as a second, searchable name.
//
// Output: { source, countries: { NL: "Amsterdam~742|Rotterdam~598|Cologne~963~Köln|…" } }
// Each city is name~population in thousands[~other name]. Country names come from Intl.DisplayNames in the browser.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const geonamesTxt = require.resolve("cities-15000-structured").replace(/[^/]+$/, "cities15000.txt");
const small = require("all-the-cities");
const english = require("city-timezones/data/cityMap.json");

const SKIP = new Set(["PPLX", "PPLH", "PPLQ", "PPLW", "PPLCH"]); // parts of a city, historical, abandoned
const KEEP_TOP = 3; // every country lists at least this many towns
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clean = (s) => s.replace(/[,|~]/g, " ").replace(/\s+/g, " ").trim();
const ascii = (s) => /^[\x20-\x7e]+$/.test(s);

/** @type {Map<string, {name: string, pop: number, alt: Set<string>, lat: number, lng: number}[]>} */
const byCountry = new Map();
const add = (cc, c) => {
  if (!byCountry.has(cc)) byCountry.set(cc, []);
  byCountry.get(cc).push(c);
};

for (const line of readFileSync(geonamesTxt, "utf8").split("\n")) {
  const f = line.split("\t");
  if (f.length < 15 || SKIP.has(f[7]) || !f[8]) continue;
  const alt = new Set((f[3] ? f[3].split(",") : []).map(fold).filter(Boolean));
  add(f[8], { name: clean(f[1]), pop: Number(f[14]) || 0, alt, lat: Number(f[4]), lng: Number(f[5]) });
}
// Countries with fewer than KEEP_TOP towns of 15,000+: top up from the 1,000+ list.
for (const [cc, list] of [...new Set(small.map((c) => c.country))].map((cc) => [cc, byCountry.get(cc) ?? []])) {
  if (list.length >= KEEP_TOP) continue;
  const have = new Set(list.map((c) => fold(c.name)));
  small
    .filter((c) => c.country === cc && !SKIP.has(c.featureCode) && !have.has(fold(c.name)))
    .sort((a, b) => b.population - a.population)
    .slice(0, KEEP_TOP - list.length)
    .forEach((c) => add(cc, { name: clean(c.name), pop: c.population, alt: new Set(), lat: c.loc.coordinates[1], lng: c.loc.coordinates[0] }));
}

// English names: a simplemaps city that GeoNames lists as an alternate name of a nearby city in the same country.
const km = (a, b) => {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};
for (const e of english) {
  const name = clean(e.city);
  const key = fold(name);
  const list = byCountry.get(e.iso2);
  if (!list || !key) continue;
  const hit = list
    .filter((c) => fold(c.name) !== key && c.alt.has(key) && km(c, e) < 30)
    .sort((a, b) => b.pop - a.pop)[0];
  if (!hit || list.some((c) => fold(c.name) === key)) continue;
  hit.english = name;
}

const countries = {};
let total = 0;
for (const cc of [...byCountry.keys()].sort()) {
  const seen = new Set();
  const rows = [];
  for (const c of byCountry.get(cc).sort((a, b) => b.pop - a.pop)) {
    // Show the English name when there is a plain one ("Cologne"); the local name stays searchable.
    const [shown, other] = c.english && ascii(c.english) ? [c.english, c.name] : [c.name, c.english];
    const k = fold(shown);
    if (!shown || seen.has(k)) continue;
    seen.add(k);
    const kpop = Math.max(1, Math.round(c.pop / 1000));
    rows.push([shown, kpop, other && fold(other) !== k ? other : ""].filter((x, i) => i < 2 || x).join("~"));
  }
  countries[cc] = rows.join("|");
  total += rows.length;
}
process.stderr.write(`${Object.keys(countries).length} countries, ${total} cities\n`);
process.stdout.write(JSON.stringify({ source: "GeoNames (CC BY 4.0), simplemaps (CC BY 4.0)", countries }));
