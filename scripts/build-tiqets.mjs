// Builds worker/data/tiqets.json: Tiqets' towns, regions and countries, and every ticket per town, from Tiqets'
// public English sitemaps. Used to send each activity to the exact Tiqets ticket (or the town's page).
//
//   Download into a folder (Tiqets blocks some datacenter IPs; a normal connection works):
//     https://www.tiqets.com/sitemap/site-map-{city,product,region,country}-en.xml.gz
//   node scripts/build-tiqets.mjs <folder> > worker/data/tiqets.json
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

const dir = process.argv[2];
const urls = (name) => {
  const raw = readFileSync(join(dir, `site-map-${name}-en.xml.gz`));
  return [...gunzipSync(raw).toString("utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
};
const townName = (slug) =>
  slug
    .replace(/-c\d+$/, "")
    .replace(/^(best-)?(things-to-do-in|what-to-do-in)-/, "")
    .replace(/-(attractions|tickets|tours|activities|things-to-do)$/, "")
    .replace(/-/g, " ");

const towns = new Map(); // id → { name, slug, tickets: [[id, words]] }
for (const u of urls("city")) {
  const m = u.match(/\/en\/([a-z0-9-]+-c(\d+))\/$/);
  if (m) towns.set(m[2], { name: townName(m[1]), slug: m[1], tickets: [] });
}
for (const u of urls("product")) {
  const m = u.match(/\/en\/([a-z0-9-]+-c(\d+))\/([a-z0-9-]+)-p(\d+)\/?$/);
  if (!m) continue;
  if (!towns.has(m[2])) towns.set(m[2], { name: townName(m[1]), slug: m[1], tickets: [] });
  towns.get(m[2]).tickets.push([m[4], m[3]]);
}
const areas = (name, letter) =>
  urls(name)
    .map((u) => u.match(new RegExp(`/en/([a-z0-9-]+-${letter}(\\d+))/$`)))
    .filter(Boolean)
    .map((m) => [m[1].replace(new RegExp(`-${letter}\\d+$`), "").replace(/-(attractions|things-to-do)$/, "").replace(/^things-to-do-in-/, "").replace(/-/g, " "), m[1]]);

const out = {
  built: new Date().toISOString().slice(0, 10),
  // [town name, page slug, [[ticket id, ticket slug]]]
  towns: [...towns.values()].map((t) => [t.name, t.slug, t.tickets]),
  regions: areas("region", "r"),
  countries: areas("country", "z"),
};
process.stderr.write(`${out.towns.length} towns, ${out.towns.reduce((n, t) => n + t[2].length, 0)} tickets, ${out.regions.length} regions, ${out.countries.length} countries\n`);
process.stdout.write(JSON.stringify(out));
