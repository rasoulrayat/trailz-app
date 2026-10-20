/**
 * Tiqets for an activity in the plan: the exact ticket when Tiqets sells one for that place in that town,
 * else Tiqets' page for the town, its region or its country. The index (worker/data/tiqets.json) comes from
 * Tiqets' public sitemaps; rebuild it with scripts/build-tiqets.mjs.
 * Tiqets takes no date or group size in a link, so people pick those on Tiqets.
 */
import data from "../data/tiqets.json";

type Ticket = [id: string, slug: string];
type Town = [name: string, slug: string, tickets: Ticket[]];
const TOWNS = data.towns as Town[];
const REGIONS = data.regions as [string, string][];
const COUNTRIES = data.countries as [string, string][];

export const TIQETS_HOME = "https://www.tiqets.com/en/";

/** Words that say nothing about which place a ticket is for. */
const STOP = new Set(
  "tickets ticket for the of and entry entrance admission tour tours guided guide with to in a an at on skip line lines fast track access visit visiting experience day trip from by de la el del les le di da do e y et und audio audioguide optional option options combo combined including include includes incl only adults adult kids family private small group book booking early morning".split(" "),
);

const VENUE = /^(house|museum|palace|tower|cathedral|church|chapel|castle|gallery|park|garden|basilica|monastery|fortress|temple|abbey|zoo|aquarium|museo|palacio)s?$/;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const words = (s: string) => fold(s).split(" ").filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));

const byName = new Map<string, Town>();
for (const t of TOWNS) {
  const k = fold(t[0]);
  const had = byName.get(k);
  // Two towns, one name (Valencia, Toledo): keep the one with more tickets.
  if (!had || had[2].length < t[2].length) byName.set(k, t);
}
const areaByName = (list: [string, string][]) => new Map(list.map(([n, slug]) => [fold(n), slug]));
const regionByName = areaByName(REGIONS);
const countryByName = areaByName(COUNTRIES);

export type TiqetsMatch = { url: string; match: "ticket" | "town" | "region" | "country" | "home"; where?: string };

/**
 * The best Tiqets page for an activity (title as in the plan) in a town. Several towns can be given, nearest
 * first (the day's base, then the trip's arrival town…): the first one Tiqets knows is used.
 */
export function tiqetsFor(activity: string, towns: string | string[], country?: string | null): TiqetsMatch {
  const names = (Array.isArray(towns) ? towns : [towns]).filter(Boolean).map((x) => fold(x.split(",")[0]));
  const t = names.map((n) => byName.get(n)).find(Boolean);
  if (t) {
    const want = words(activity);
    const need = want.length >= 2 ? 2 : 1;
    // "Anne Frank House", "Prado Museum": the building is the point, so a ticket must name it too
    // (an Anne Frank walking tour is not the house).
    const venues = want.filter((w) => VENUE.test(w)).map((w) => w.replace(/s$/, ""));
    let best: { ticket: Ticket; score: number } | null = null;
    for (const ticket of t[2]) {
      const raw = ticket[1].replace(/^tickets-for-/, "").split("-");
      // "…-without-house-entry": what follows "without" isn't included, so a ticket missing what was asked is skipped.
      const cut = raw.indexOf("without");
      const have = new Set(words((cut >= 0 ? raw.slice(0, cut) : raw).join(" ")));
      const common = want.filter((w) => have.has(w));
      if (common.length < need || !common.some((w) => w.length >= 4)) continue;
      if (cut >= 0 && words(raw.slice(cut + 1).join(" ")).some((w) => want.includes(w))) continue;
      if (venues.some((v) => !have.has(v) && !have.has(`${v}s`))) continue;
      // More shared words first; then the plain entry ticket over tours, family or private versions.
      const entry = raw.includes("entry") || raw.includes("ticket") || raw.includes("admission");
      const extra = raw.some((w) => /^(guided|tour|tours|private|family|families|small|group|combo|bundle|pass|card)$/.test(w));
      const score = common.length * 100 - raw.length * 2 + (entry ? 15 : 0) - (extra ? 12 : 0);
      if (!best || score > best.score) best = { ticket, score };
    }
    if (best) return { url: `https://www.tiqets.com/en/${t[1]}/${best.ticket[1]}-p${best.ticket[0]}/`, match: "ticket", where: t[0] };
    return { url: `https://www.tiqets.com/en/${t[1]}/`, match: "town", where: t[0] };
  }
  const hit = names.find((n) => regionByName.has(n));
  if (hit) return { url: `https://www.tiqets.com/en/${regionByName.get(hit)}/`, match: "region", where: hit };
  const land = country ? countryByName.get(fold(country)) : undefined;
  if (land) return { url: `https://www.tiqets.com/en/${land}/`, match: "country", where: country ?? undefined };
  return { url: TIQETS_HOME, match: "home" };
}
