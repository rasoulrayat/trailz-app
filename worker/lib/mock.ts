/**
 * Mock mode (MOCK_AI="1"): realistic sample results without calling Supadata or Gemini.
 * Lets the whole app be built, tested and demoed before API keys exist.
 * The scenario is picked from words in the link, e.g. a link containing "italy"
 * gives the many-places result.
 */
import type { PlaceRef, RealityCard } from "../../shared/types";
import type { VideoRecord } from "./extract-schema";
import type { ExtractJob } from "./supadata";

type Scenario = "single" | "multi" | "pick" | "vibe" | "not_travel";

export function scenarioFor(url: string): Scenario {
  const u = url.toLowerCase();
  if (/italy|gems|multi|list/.test(u)) return "multi";
  if (/pasta|cook|recipe|dance/.test(u)) return "not_travel";
  if (/cove|vibe|beach|mood/.test(u)) return "vibe";
  if (/alps|lake|hallstatt|unsure/.test(u)) return "pick";
  return "single";
}

const RECORDS: Record<Scenario, VideoRecord> = {
  single: {
    video_type: "single_place",
    travel_confidence: 0.97,
    what_we_saw: "White houses and blue domes above a volcanic caldera at sunset, with an empty terrace.",
    places: [
      {
        name: "Oia",
        region: "Santorini",
        country: "Greece",
        lat: 36.4618,
        lng: 25.3753,
        t_start: "0:01",
        evidence: "Spoken name, blue domes, caldera view",
        confidence: 0.93,
      },
    ],
    places_relation: "one_place",
    vibe_tags: ["blue domes", "caldera sunset", "white village"],
    claims: ["Nobody around", "Perfect sunset", "Infinity pool for everyone"],
    editing: { filter_suspected: true, time_of_day: "early morning" },
    transcript: [{ t: "0:03", text: "This is Oia at sunset and there's literally nobody here" }],
    on_screen_text: [{ t: "0:01", text: "Santorini's most peaceful spot" }],
    skipped_clips: 0,
  },
  multi: {
    video_type: "multi_place",
    travel_confidence: 0.95,
    what_we_saw: "A fast montage of Italian coastal villages, hot springs and mountain ridges.",
    places: [
      { name: "Atrani", region: "Amalfi Coast", country: "Italy", lat: 40.636, lng: 14.608, t_start: "0:03", evidence: "Church dome and tiny beach", confidence: 0.86, creator_label: "Positano" },
      { name: "Path of the Gods", region: "Amalfi Coast", country: "Italy", lat: 40.627, lng: 14.539, t_start: "0:07", evidence: "On-screen text", confidence: 0.9 },
      { name: "Fiordo di Furore", region: "Amalfi Coast", country: "Italy", lat: 40.618, lng: 14.55, t_start: "0:11", evidence: "Bridge over a narrow beach", confidence: 0.84 },
      { name: "Bagni San Filippo", region: "Tuscany", country: "Italy", lat: 42.928, lng: 11.7, t_start: "0:15", evidence: "White calcium hot springs", confidence: 0.8 },
      { name: "Val d'Orcia", region: "Tuscany", country: "Italy", lat: 43.07, lng: 11.68, t_start: "0:18", evidence: "Cypress-lined road", confidence: 0.82 },
      { name: "Seceda", region: "Dolomites", country: "Italy", lat: 46.6, lng: 11.73, t_start: "0:22", evidence: "Jagged ridge", confidence: 0.88 },
      { name: "Lago di Braies", region: "Dolomites", country: "Italy", lat: 46.694, lng: 12.085, t_start: "0:26", evidence: "Wooden boats on a green lake", confidence: 0.91 },
      { name: "Tre Cime di Lavaredo", region: "Dolomites", country: "Italy", lat: 46.618, lng: 12.302, t_start: "0:29", evidence: "Three peaks", confidence: 0.9 },
    ],
    places_relation: "separate_places",
    vibe_tags: ["coastal villages", "hot springs", "mountain ridges"],
    claims: ["Hidden gems", "No tourists"],
    skipped_clips: 2,
  },
  pick: {
    video_type: "single_place",
    travel_confidence: 0.9,
    what_we_saw: "A lakeside village with a church spire below steep mountains, no name shown.",
    places: [
      { name: "Hallstatt", region: "Upper Austria", country: "Austria", lat: 47.562, lng: 13.649, evidence: "Church spire and lakefront houses", confidence: 0.58 },
      { name: "Gosau lakes", region: "Upper Austria", country: "Austria", lat: 47.53, lng: 13.5, evidence: "Mountain reflection at 0:12", confidence: 0.31 },
      { name: "Obertraun", region: "Upper Austria", country: "Austria", lat: 47.556, lng: 13.692, evidence: "Same lake, other shore", confidence: 0.22 },
    ],
    places_relation: "alternatives",
    vibe_tags: ["alpine lake", "church spire"],
    claims: ["Fairytale village"],
    skipped_clips: 0,
  },
  vibe: {
    video_type: "travel_vibe_no_place",
    travel_confidence: 0.85,
    what_we_saw: "A turquoise cove between white cliffs with small boats, no signs or landmarks.",
    places: [],
    vibe_tags: ["turquoise cove", "white cliffs", "small boats", "Mediterranean"],
    claims: ["Secret beach"],
    skipped_clips: 0,
  },
  not_travel: {
    video_type: "not_travel",
    travel_confidence: 0.05,
    what_we_saw: "A home kitchen and someone cooking pasta. No landmarks, signs or location tags.",
    places: [],
    vibe_tags: [],
    skipped_clips: 0,
  },
};

export function mockJobId(url: string): string {
  return `mock:${scenarioFor(url)}:${Date.now()}`;
}

/** Mock jobs "finish" a few seconds after they start, like the real service. */
export function mockGetExtract(jobId: string): ExtractJob {
  const [, scenario, started] = jobId.split(":");
  if (Date.now() - Number(started) < 3500) return { status: "active" };
  return { status: "completed", data: RECORDS[(scenario as Scenario) ?? "single"] ?? RECORDS.single };
}

export function mockMeta(url: string) {
  const s = scenarioFor(url);
  const meta: Record<Scenario, { title: string; author: string }> = {
    single: { title: "POV: the most peaceful sunset in Europe, nobody around", author: "@sunset.lena" },
    multi: { title: "10 hidden gems in Italy you NEED to see", author: "@wander.with.gio" },
    pick: { title: "This fairytale village doesn't look real", author: "@alpine.ana" },
    vibe: { title: "Found the bluest water in Europe", author: "@blue.hour.bo" },
    not_travel: { title: "My nonna's cacio e pepe, 3 ingredients only", author: "@pasta.nights" },
  };
  return meta[s];
}

export function mockCard(place: PlaceRef, origin: string): RealityCard {
  const known = place.name.toLowerCase() === "oia";
  return {
    place: { name: place.name, region: place.region, country: place.country ?? "", lat: place.lat, lng: place.lng },
    confidence: "high",
    authenticity: known ? 6 : 7,
    summary: known
      ? "Beautiful and real, but packed at sunset from June to August."
      : `${place.name} is real and worth it, but busier than the reel suggests in summer.`,
    comparisons: known
      ? [
          { reel: "Nobody around", reality: "Hundreds of people at sunset, June to August. This was filmed around 7 am." },
          { reel: "Deep orange sky", reality: "A warm filter was added. Real colours are softer." },
          { reel: "Infinity pool for everyone", reality: "It's a private hotel pool for guests only." },
        ]
      : [
          { reel: "No tourists", reality: "Quiet early morning, busy from late morning in July and August." },
          { reel: "Hidden gem", reality: "Well known locally; arrive before 9 am for the reel's view." },
        ],
    months: ["quiet", "quiet", "good", "good", "best", "good", "crowded", "crowded", "best", "best", "good", "quiet"],
    cost: { currency: "EUR", from: origin, days: 5, low: 640, high: 820, flights: 210, stay: 320, food: 110 },
    gems: known
      ? [
          { name: "Imerovigli", why: "Same caldera sunset, 3 km walk, fewer people", authenticity: 9 },
          { name: "Pyrgos village", why: "Hilltop lanes and local tavernas", authenticity: 8 },
        ]
      : [{ name: `Villages near ${place.name}`, why: "Same scenery, smaller crowds", authenticity: 8 }],
  };
}

export const MOCK_VIBE_SUGGESTIONS = [
  { name: "Sarakiniko, Milos", country: "Greece", why: "White rock and turquoise water, real colours", authenticity: 8 },
  { name: "Calanques, Marseille", country: "France", why: "Limestone coves, reachable by train", authenticity: 8 },
  { name: "Ksamil", country: "Albania", why: "Cheapest option, busy in August", authenticity: 6 },
];
