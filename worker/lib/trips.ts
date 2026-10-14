import type { Handoff, Mood, PlanDay, PlanItem, SavedPlace, Trip, TripPlan, TripSuggestion } from "../../shared/types";
import { MOODS } from "../../shared/types";
import type { GeminiConfig } from "./gemini";
import { generateJsonPublic } from "./gemini";
import { distanceKm, placeKey, THRESHOLDS } from "./route";

// ---------- "A trip is forming": group saved places that are close together ----------

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

export function suggestTrips(saves: SavedPlace[]): TripSuggestion[] {
  const clusters: { anchor: SavedPlace; members: SavedPlace[] }[] = [];
  for (const s of saves) {
    const hit = clusters.find((c) => {
      if (s.lat != null && s.lng != null && c.anchor.lat != null && c.anchor.lng != null) {
        return distanceKm({ lat: s.lat, lng: s.lng }, { lat: c.anchor.lat, lng: c.anchor.lng }) <= THRESHOLDS.clusterKm * 2;
      }
      return !!s.country && !!c.anchor.country && placeKey(s.country) === placeKey(c.anchor.country);
    });
    if (hit) hit.members.push(s);
    else clusters.push({ anchor: s, members: [s] });
  }
  return clusters
    .filter((c) => c.members.length >= 2)
    .sort((a, b) => b.members.length - a.members.length)
    .map((c) => {
      const names = c.members.map((m) => m.name);
      const country = uniq(c.members.map((m) => m.country))[0] ?? null;
      const vibeCounts = new Map<string, number>();
      c.members.forEach((m) => m.vibe.forEach((v) => vibeCounts.set(v, (vibeCounts.get(v) ?? 0) + 1)));
      const vibe = [...vibeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v]) => v);
      const title = names.length <= 3 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
      return { title, placeIds: c.members.map((m) => m.id), days: daysFor(c.members.length), vibe, country };
    });
}

/** A relaxed pace: about a day and a half per place, 2 to 10 days. */
export const daysFor = (places: number) => Math.min(10, Math.max(2, Math.round(places * 1.5)));

// ---------- The AI plan ----------

const S = { type: "STRING" } as const;
const N = { type: "NUMBER" } as const;
const PLAN_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "Short, specific, no clichés. e.g. 'Kyoto & Nara, slow mornings'" },
    summary: { type: "STRING", description: "Two sentences on how the trip flows and why this order." },
    days: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          day: N,
          title: { type: "STRING", description: "e.g. 'Arrive, settle in Fira'" },
          base: { type: "STRING", description: "The town where this night is spent." },
          items: {
            type: "ARRAY",
            description: "4 to 6 items in time order. Include travel between places, meals and free time.",
            items: {
              type: "OBJECT",
              properties: {
                time: { type: "STRING", description: "24h clock, e.g. '08:30'" },
                kind: { type: "STRING", enum: ["travel", "stay", "see", "do", "eat", "free"] },
                title: S,
                detail: { type: "STRING", description: "One practical line: how to get there, how long, what to expect, why now." },
                cost: { type: "NUMBER", description: "Typical cost per person in euros, 0 if free." },
                fromReel: { type: "BOOLEAN", description: "True if this is one of the traveler's saved places." },
                book: { type: "STRING", enum: ["flights", "stay", "activity", "transport", "none"], description: "What a partner site would book for this item." },
              },
              required: ["time", "kind", "title", "detail", "cost", "fromReel", "book"],
            },
          },
        },
        required: ["day", "title", "base", "items"],
      },
    },
    estimate: {
      type: "OBJECT",
      description: "Per person in euros for the whole trip, including return travel from the origin.",
      properties: { travel: N, stay: N, activities: N, food: N },
      required: ["travel", "stay", "activities", "food"],
    },
    tips: { type: "ARRAY", description: "2 or 3 practical tips for this exact trip.", items: S },
    gateway: {
      type: "OBJECT",
      description:
        "The city with the airport or main train station the trip arrives in and leaves from, NEAR THE SAVED PLACES (e.g. Naples for the Amalfi Coast, Genoa for Portofino). Never the traveler's home city.",
      properties: { arrive: S, leave: S },
      required: ["arrive", "leave"],
    },
  },
  required: ["title", "summary", "days", "estimate", "tips", "gateway"],
};

const MOOD_BRIEF: Record<Mood, string> = {
  solo: "Solo traveler who likes slow mornings, walking, cafés, quiet viewpoints and time alone. Max one big thing per day. Safe, easy evenings.",
  energetic: "Energetic traveler: early starts, hikes, swims, bikes, several places a day, sunrise and sunset spots. Still realistic about travel times.",
  friends: "A group of friends: shared meals, nightlife, easy logistics, group-friendly stays, a lazy morning after a late night.",
};

export interface PlanInput {
  places: SavedPlace[];
  mood: Mood;
  budgetMode: boolean;
  days: number;
  origin: string;
  travelers: number;
  /** Extra context from the saved Reality Cards (base cities, local tips), when we have it. */
  notes?: string[];
}

export async function generatePlan(cfg: GeminiConfig, input: PlanInput): Promise<TripPlan> {
  const mood = MOODS.find((m) => m.id === input.mood)!;
  const placeLines = input.places.map((p) => `- ${[p.name, p.region, p.country].filter(Boolean).join(", ")}${p.vibe.length ? ` (vibe: ${p.vibe.join(", ")})` : ""}`);
  const prompt = `You plan trips for TrailZ, an app for young travelers who found places on social media reels and want to see them for real, the authentic way.

Traveler departs from: ${input.origin}. Travelers: ${input.travelers}. Trip length: ${input.days} days.
Mood: ${mood.title}. ${MOOD_BRIEF[input.mood]}
${input.budgetMode ? "Budget mode: hostels or cheap guesthouses, public transport, street food and markets, free viewpoints. Cut anything expensive." : "Normal budget: comfortable but not luxury."}

Places the traveler saved from reels (all must appear in the plan, in a sensible geographic order):
${placeLines.join("\n")}
${input.notes?.length ? `\nWhat we already know about these places:\n${input.notes.join("\n")}` : ""}

Rules:
- Day 1 starts with travel from ${input.origin}; the last day ends with the journey back. Use real transport (flights, trains, buses, ferries) and realistic durations.
- Visit the saved places at the right time of day to avoid the crowds the reels hide (mark them fromReel).
- Prefer neighbourhoods, markets and local food over tourist menus. Name real places. If unsure a place exists, leave it out.
- Keep each day doable: travel time between items must be realistic.
- Costs are typical per-person estimates in euros; the estimate totals must match the items roughly.`;
  const raw = await generateJsonPublic<RawPlan>(cfg, prompt, PLAN_SCHEMA);
  return cleanPlan(raw, input.days, input.origin);
}

interface RawPlan {
  title?: string;
  summary?: string;
  days?: { day?: number; title?: string; base?: string; items?: Partial<PlanItem & { book: string }>[] }[];
  estimate?: Partial<TripPlan["estimate"]>;
  tips?: string[];
  gateway?: { arrive?: string; leave?: string };
}

const KINDS: PlanItem["kind"][] = ["travel", "stay", "see", "do", "eat", "free"];
const money = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

function cleanPlan(raw: RawPlan, days: number, origin = ""): TripPlan {
  // A gateway equal to the home city is a mistake (the model confused departure with arrival).
  const same = (a?: string) => !!a && placeKey(a) === placeKey(origin);
  if (raw.gateway && (same(raw.gateway.arrive) || same(raw.gateway.leave))) raw.gateway = undefined;
  const cleanDays: PlanDay[] = (raw.days ?? [])
    .slice(0, Math.max(days, 1))
    .map((d, i) => ({
      day: i + 1,
      title: d.title?.trim() || `Day ${i + 1}`,
      base: d.base?.trim() || "",
      items: (d.items ?? [])
        .filter((it) => it.title && it.detail)
        .slice(0, 8)
        .map((it) => ({
          time: it.time?.trim() || "",
          kind: KINDS.includes(it.kind as PlanItem["kind"]) ? (it.kind as PlanItem["kind"]) : "do",
          title: it.title!.trim(),
          detail: it.detail!.trim(),
          cost: money(it.cost),
          fromReel: !!it.fromReel,
          book: ["flights", "stay", "activity", "transport"].includes(it.book ?? "") ? (it.book as PlanItem["book"]) : undefined,
        })),
    }))
    .filter((d) => d.items.length > 0);
  if (!cleanDays.length) throw new Error("The plan came back empty");
  return {
    title: raw.title?.trim() || "Your trip",
    summary: raw.summary?.trim() || "",
    days: cleanDays,
    estimate: {
      travel: money(raw.estimate?.travel),
      stay: money(raw.estimate?.stay),
      activities: money(raw.estimate?.activities),
      food: money(raw.estimate?.food),
    },
    tips: (raw.tips ?? []).filter((t) => typeof t === "string" && t.trim()).slice(0, 3),
    gateway: raw.gateway?.arrive?.trim() ? { arrive: raw.gateway.arrive.trim(), leave: raw.gateway.leave?.trim() || raw.gateway.arrive.trim() } : undefined,
  };
}

// ---------- Partner hand-off links (search pages with the trip filled in) ----------

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface PartnerIds {
  kiwi?: string;
  booking?: string;
  getyourguide?: string;
  omio?: string;
  /** Travelpayouts: marker (partner id), trs (project id) and each brand's campaign ("p") id. */
  tp?: { marker: string; trs: string; kiwiP?: string; bookingP?: string; gygP?: string; omioP?: string };
}

/** Kiwi.com's documented Travelpayouts link: c111 click + promo 3791 + the search as custom_url. */
export function tpKiwi(url: string, tp: PartnerIds["tp"]): string {
  if (!tp?.marker) return url;
  return `https://c111.travelpayouts.com/click?shmarker=${encodeURIComponent(tp.marker)}.flights&promo_id=${tp.kiwiP || "3791"}&source_type=customlink&type=click&custom_url=${encodeURIComponent(url)}`;
}

/**
 * Wrap a partner URL in Travelpayouts tracking (their "destination page" deeplink), so the booking
 * is credited to TrailZ. Without a campaign id for the brand, the plain URL is returned.
 */
export function tpWrap(url: string, tp: PartnerIds["tp"], p: string | undefined, subId = "trailz"): string {
  if (!tp?.marker || !tp.trs || !p) return url;
  const u = new URL("https://tp.media/r");
  u.searchParams.set("marker", tp.marker);
  u.searchParams.set("trs", tp.trs);
  u.searchParams.set("p", p);
  u.searchParams.set("u", url);
  u.searchParams.set("sub_id", subId);
  return u.toString();
}

/** Links that open each partner with the trip's dates, places and travelers already filled in. */
export function buildHandoff(
  trip: Trip,
  ids: PartnerIds = {},
  /** IATA codes, when the airport lookup found them. */
  codes?: { origin?: string; destination?: string; leave?: string },
): Handoff {
  const start = trip.startDate ?? null;
  const nights = Math.max(1, trip.plan.days.length - 1);
  const end = start ? addDays(start, nights) : null;
  const firstBase = trip.plan.days[0]?.base || trip.places[0]?.name || "";
  const lastBase = trip.plan.days[trip.plan.days.length - 1]?.base || firstBase;
  const country = trip.places.find((p) => p.country)?.country ?? "";

  // Flights: Kiwi.com's deep link (airport/city codes when we have them, otherwise names it can resolve).
  const arrive = trip.plan.gateway?.arrive || firstBase;
  const leave = trip.plan.gateway?.leave || lastBase;
  const dest = [arrive, country].filter(Boolean).join(", ");
  const kiwi = new URL("https://www.kiwi.com/deep");
  kiwi.searchParams.set("from", codes?.origin ?? trip.origin);
  kiwi.searchParams.set("to", codes?.destination ?? arrive);
  if (start) {
    kiwi.searchParams.set("departure", start);
    kiwi.searchParams.set("return", end!);
  }
  if (leave !== arrive && codes?.leave) kiwi.searchParams.set("returnFrom", codes.leave);
  kiwi.searchParams.set("adults", String(trip.travelers));
  kiwi.searchParams.set("lang", "en");
  kiwi.searchParams.set("currency", "eur");
  if (ids.kiwi) kiwi.searchParams.set("affilid", ids.kiwi);

  // Stays: one Booking.com search per base town, with the nights spent there.
  const bases: { city: string; nights: number; from: number }[] = [];
  trip.plan.days.slice(0, -1).forEach((d, i) => {
    const city = d.base || firstBase;
    const last = bases[bases.length - 1];
    if (last && last.city === city) last.nights++;
    else bases.push({ city, nights: 1, from: i });
  });
  if (!bases.length) bases.push({ city: firstBase, nights, from: 0 });
  const stay = bases.map((b) => {
    const u = new URL("https://www.booking.com/searchresults.html");
    u.searchParams.set("ss", [b.city, country].filter(Boolean).join(", "));
    if (start) {
      u.searchParams.set("checkin", addDays(start, b.from));
      u.searchParams.set("checkout", addDays(start, b.from + b.nights));
    }
    u.searchParams.set("group_adults", String(trip.travelers));
    u.searchParams.set("no_rooms", String(Math.max(1, Math.ceil(trip.travelers / 2))));
    if (trip.budgetMode) u.searchParams.set("order", "price");
    if (ids.booking) u.searchParams.set("aid", ids.booking);
    return {
      partner: "Booking.com",
      url: tpWrap(u.toString(), ids.tp, ids.tp?.bookingP, "stay"),
      city: b.city,
      nights: b.nights,
      note: `${b.nights} ${b.nights === 1 ? "night" : "nights"} in ${b.city}${start ? `, ${addDays(start, b.from)} → ${addDays(start, b.from + b.nights)}` : ""}`,
    };
  });

  // Activities: GetYourGuide search for each bookable activity in the plan.
  const activities = trip.plan.days
    .flatMap((d) => d.items.filter((it) => it.book === "activity").map((it) => ({ day: d.day, it })))
    .slice(0, 6)
    .map(({ day, it }) => {
      const u = new URL("https://www.getyourguide.com/s/");
      u.searchParams.set("q", `${it.title} ${firstBase}`);
      if (start) u.searchParams.set("date_from", addDays(start, day - 1));
      if (ids.getyourguide) u.searchParams.set("partner_id", ids.getyourguide);
      return { partner: "GetYourGuide", url: tpWrap(u.toString(), ids.tp, ids.tp?.gygP, "activity"), place: it.title, note: `Day ${day} · ${it.time}` };
    });

  // Trains and buses between bases: Omio.
  const transport = bases.length > 1 || trip.plan.days.some((d) => d.items.some((it) => it.book === "transport"))
    ? [
        {
          partner: "Omio",
          url: tpWrap(`https://www.omio.com/${ids.omio ? `?partner=${encodeURIComponent(ids.omio)}` : ""}`, ids.tp, ids.tp?.omioP, "transport"),
          note: `Trains and buses ${bases.map((b) => b.city).join(" → ")}`,
        },
      ]
    : [];

  const tp = ids.tp;
  return {
    flights: [{ partner: "Kiwi.com", url: tpKiwi(kiwi.toString(), tp), note: `${trip.origin} → ${dest}${start ? `, ${start} → ${end}` : ", dates flexible"} · ${trip.travelers} ${trip.travelers === 1 ? "traveler" : "travelers"}` }],
    stay,
    activities,
    transport,
    disclaimer: "You book each part with our partners. Nothing is charged here. Final price, payment and cancellation are set by each partner.",
  };
}
