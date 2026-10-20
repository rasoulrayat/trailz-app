// Types shared by the Worker (API) and the React app.

export type Platform = "tiktok" | "instagram" | "youtube";

export type Outcome = "single" | "multi" | "pick" | "vibe" | "not_travel";

export type CheckStatusName = "extracting" | "analyzing" | "ready" | "failed";

/** Why a pasted link was refused before any AI call. */
export type LinkErrorCode =
  | "no_link" // nothing that looks like a URL
  | "unsupported_site" // a website, not TikTok / Instagram / YouTube
  | "profile_link" // a creator profile instead of a single video
  | "unavailable" // private, deleted or region-blocked post
  | "daily_limit"; // too many new checks today

export interface VideoMeta {
  platform: Platform;
  url: string;
  title?: string | null;
  author?: string | null;
  thumbnailUrl?: string | null;
}

export type MonthRating = "best" | "good" | "crowded" | "quiet";

export interface RealityCard {
  place: { name: string; region?: string; country: string; lat?: number; lng?: number };
  /** "high" when the place was confirmed in the map database. */
  confidence: "high" | "medium";
  /** 0–10: how close the reel is to what visitors really find. */
  authenticity: number;
  summary: string;
  comparisons: { reel: string; reality: string }[];
  /** 12 entries, January first. */
  months: MonthRating[];
  cost: {
    currency: "EUR";
    from: string;
    days: number;
    low: number;
    high: number;
    flights: number;
    stay: number;
    food: number;
  };
  gems: { name: string; why: string; authenticity: number }[];
  /** The city or town to base yourself in for this place, and how to enjoy it like a local. */
  base?: CityGuide;
  /** Crowds by hour and day, for the "When to go" line. */
  timing?: { quiet: string; busy: string; closed?: string; tip?: string };
  /** The four practical facts that turn "I want this" into "I can do this". */
  practical?: { flightHours: number; timeDiff: string; dailyBudget: number; visa: string; safety: string };
}

export interface CityGuide {
  city: string;
  country?: string;
  /** e.g. "The reel's airport serves this city" or "40 min by bus from the beach". */
  fromPlace: string;
  /** One honest line on what the city is like. */
  vibe: string;
  /** 3-4 things to do the authentic way, not the tourist way. */
  do: { title: string; detail: string }[];
  /** 2-3 local foods or places to eat. */
  eat: string[];
  /** 1-2 tourist traps to skip. */
  skip: string[];
  /** One tip only locals would tell you. */
  localTip: string;
}

export interface PlaceRef {
  name: string;
  region?: string;
  country?: string;
  lat?: number;
  lng?: number;
  /** Where it appears in the reel, e.g. "0:07". */
  t?: string;
  evidence?: string;
  confidence: number;
  /** What the creator calls it, when that differs from what we see. */
  creatorLabel?: string;
  /** True when the place was found in the map database. */
  verified?: boolean;
}

export interface Region {
  name: string;
  placeIndexes: number[];
}

export type CheckResult =
  | { outcome: "single"; card: RealityCard }
  | { outcome: "multi"; places: PlaceRef[]; regions: Region[]; skippedClips: number; advice: string }
  | { outcome: "pick"; candidates: PlaceRef[]; whatWeSaw: string }
  | {
      outcome: "vibe";
      vibe: string[];
      whatWeSaw: string;
      /** Country (or region) the reel seems to be filmed in, when the AI can tell. */
      filmedIn?: string;
      suggestions: { name: string; country: string; why: string; authenticity: number; lat?: number; lng?: number }[];
    }
  | { outcome: "not_travel"; whatWeSaw: string; kind: "not_travel" | "tips" };

/** The place part of a Reality Card (everything except the verdict on one reel). Written once per place, shared by all reels. */
export type PlaceProfile = Omit<RealityCard, "authenticity" | "summary" | "comparisons">;

/** A place card as the API serves it: the full card, or the place facts while the reel verdict is still being written. */
export interface PlaceCardResponse {
  card?: RealityCard;
  profile?: PlaceProfile;
  pending: boolean;
}

export interface CheckStatus {
  id: string;
  status: CheckStatusName;
  video: VideoMeta;
  result?: CheckResult;
  error?: string;
}

export interface CheckSummary {
  id: string;
  status: CheckStatusName;
  outcome?: Outcome | null;
  /** Where + vibe, e.g. "India · pine forest, mountain valley". */
  label: string;
  /** Which result screen, e.g. "Places with this vibe". */
  kind: string;
  /** Place whose photo stands in when the reel has no cover. */
  photoQuery?: string;
  video: VideoMeta;
  createdAt: number;
}

export interface StartCheckResponse {
  id: string;
  cached: boolean;
}

export interface ApiError {
  error: LinkErrorCode | "not_found" | "bad_request" | "server_error" | "login_required";
  message: string;
}

// ---------- Saved places and trips (phase 2) ----------

/** A place the user hearted. Enough to show it, map it, and reopen its Reality Card. */
export interface SavedPlace {
  id: string;
  name: string;
  region?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Vibe words from the reel it came from: this is how we learn the user's taste. */
  vibe: string[];
  /** The check it came from, to reopen the Reality Card. */
  checkId?: string | null;
  authenticity?: number | null;
  createdAt: number;
}

/** Saved places that are close together: "a trip is forming". */
export interface TripSuggestion {
  title: string;
  placeIds: string[];
  /** Days a relaxed visit would take. */
  days: number;
  vibe: string[];
  country?: string | null;
}

export type Mood = "solo" | "energetic" | "friends";

export const MOODS: { id: Mood; title: string; line: string }[] = [
  { id: "solo", title: "Solo & slow", line: "Mornings alone, long walks, a book on a square" },
  { id: "energetic", title: "Energetic", line: "Early starts, hikes, as much as a day can hold" },
  { id: "friends", title: "With friends", line: "Shared tables, late nights, easy logistics" },
];

export type ItemKind = "travel" | "stay" | "see" | "do" | "eat" | "free";

export interface PlanItem {
  time: string;
  kind: ItemKind;
  title: string;
  detail: string;
  /** Typical cost per person in euros; 0 = free. */
  cost: number;
  /** True when this is one of the user's own saved / reel places. */
  fromReel?: boolean;
  /** Which partner can book it, if any. */
  book?: "flights" | "stay" | "activity" | "transport";
}

export interface PlanDay {
  day: number;
  title: string;
  /** Town the night is spent in. */
  base: string;
  items: PlanItem[];
}

export interface TripPlan {
  title: string;
  summary: string;
  days: PlanDay[];
  estimate: { travel: number; stay: number; activities: number; food: number };
  tips: string[];
  /** Cities with the airport or main station the trip arrives in and leaves from (for flight searches). */
  gateway?: { arrive: string; leave: string };
}

export interface Trip {
  id: string;
  status: "draft" | "saved";
  mood: Mood;
  budgetMode: boolean;
  origin: string;
  travelers: number;
  /** ISO date of day 1, when the user has chosen dates. */
  startDate?: string | null;
  places: SavedPlace[];
  plan: TripPlan;
  /** Which parts the person told us they booked (or Duffel confirmed). */
  booked: { flights?: boolean; stay?: Record<string, boolean>; activities?: boolean };
  /** Month numbers (1–12) the Reality Cards rated "best" for these places, for quick date picks. */
  bestMonths: number[];
  createdAt: number;
  updatedAt: number;
}

/** Partner links with the trip's dates and places filled in. */
export interface Handoff {
  flights: { partner: string; url: string; note: string }[];
  stay: { partner: string; url: string; note: string; city: string; nights: number }[];
  /** partner/url = the first choice; options = every partner for it, best pre-filled first (Tiqets' exact ticket, then a GetYourGuide search). */
  activities: { partner: string; url: string; note: string; place: string; options?: { partner: string; url: string; label: string }[] }[];
  transport: { partner: string; url: string; note: string }[];
  disclaimer: string;
}

/** One bookable price from one provider. The UI never cares which provider, only the tag. */
export interface Offer {
  provider: "google" | "aviasales" | "duffel" | "hotellook" | "kiwi" | "booking";
  /** Where the person will book, in words they know: "KLM", "Booking.com", "Google Flights". */
  providerLabel: string;
  /** "search": a partner search page with the trip filled in (no price), listed after priced options. */
  kind?: "offer" | "search";
  /** True when TrailZ earns on this booking (markup or commission). Only breaks ties in ranking. */
  earns?: boolean;
  /** "live" = fetched now; "cached" = seen by other travelers recently. */
  freshness: "live" | "cached";
  price: number;
  currency: string;
  /** Flights: "KLM · direct · 2h 10m". Stays: "Hotel Bacco · ★★★★ · 8.6". */
  title: string;
  detail?: string;
  /** One line under the offer about what the partner page opens with, when it isn't obvious. */
  note?: string;
  /** Flights: true when the dates are not the exact ones asked. */
  approx?: boolean;
  /** Where "Book" goes. Duffel offers use a hosted checkout created on tap (bookUrl = /api/…). */
  bookUrl: string;
  /** Which part of the price this is: per person (flights) or total stay. */
  unit: "per person" | "total";
}

/** Prices shown on Compare & go before the person leaves the app. */
export interface TripPrices {
  flights: {
    origin?: { code: string; name: string } | null;
    destination?: { code: string; name: string } | null;
    offers: Offer[];
    nights: number;
  } | null;
  stays: { city: string; checkIn: string; checkOut: string; nights: number; offers: Offer[]; searchUrl: string }[];
  /** Which providers answered, for the footnote. */
  sources: string[];
  note: string;
}

// ---------- Accounts + onboarding profile ----------

export type Crew = "solo" | "partner" | "friends" | "family";

/** Onboarding answers. Every field is optional: each question can be skipped. */
export interface Profile {
  /** Vibe ids from the onboarding picker, e.g. "beach", "mountains". */
  vibes: string[];
  crew?: Crew;
  /** Rough budget per person per trip in EUR; 0 = no limit. */
  budget?: number;
  /** Home city, e.g. "Amsterdam". */
  home?: string;
  /** Set once the intro has been seen (or skipped). */
  onboarded?: boolean;
  /** Learned-vibe words the person removed by hand (normalised keys). */
  vibeOff?: string[];
  /** false = saves no longer teach the vibe; Explore then uses the onboarding picks only. Default true. */
  learnVibe?: boolean;
}

export interface Me {
  user: { id: string; name: string | null; email: string | null; avatar: string | null } | null;
  profile: Profile | null;
  /** Whether Google sign-in is configured on the server. */
  canLogin: boolean;
  /** Address for data requests (privacy page). */
  contact: string | null;
}

// ---------- Explore (public feed of checked reels) ----------

export interface ExploreItem {
  id: string;
  outcome: "single" | "multi" | "vibe";
  /** The reel itself, for the embedded player. */
  video: VideoMeta;
  /** Cover: the reel's stored image, or null (the UI then shows a place photo). */
  cover: string | null;
  /** Place to fetch a photo for when there is no cover. */
  photoQuery: string | null;
  title: string;
  sub: string;
  country: string | null;
  vibe: string[];
  authenticity: number | null;
  /** Cheapest typical cost per person (single-place cards). */
  costFrom: number | null;
  /** Best months (1–12) for single-place cards. */
  bestMonths: number[];
  /** Rating for the month asked for, if any. */
  monthRating?: MonthRating | null;
  checks: number;
  checks7d: number;
  saves: number;
  author: string | null;
  /** 0–1: how much its vibe overlaps with the viewer's saved vibe. */
  vibeMatch: number;
  /** km to the viewer's nearest saved place, when known. */
  nearKm: number | null;
  createdAt: number;
}

export interface ExploreResponse {
  items: ExploreItem[];
  /** The viewer's vibe words (from their saves), so the UI can label "My vibe". */
  myVibe: string[];
  hasSaves: boolean;
}

// ---------- Friends: share + vote ----------

export interface ShareVotes {
  in: number;
  out: number;
  names: string[];
  mine?: "in" | "out" | null;
}

export type SharePayload =
  | { kind: "check"; token: string; card: RealityCard; video: VideoMeta; votes: ShareVotes }
  | { kind: "trip"; token: string; trip: Pick<Trip, "plan" | "places" | "mood" | "startDate" | "travelers" | "origin">; votes: ShareVotes };
