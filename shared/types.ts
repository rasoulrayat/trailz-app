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
      suggestions: { name: string; country: string; why: string; authenticity: number }[];
    }
  | { outcome: "not_travel"; whatWeSaw: string; kind: "not_travel" | "tips" };

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
  label: string;
  video: VideoMeta;
  createdAt: number;
}

export interface StartCheckResponse {
  id: string;
  cached: boolean;
}

export interface ApiError {
  error: LinkErrorCode | "not_found" | "bad_request" | "server_error";
  message: string;
}
