/**
 * The "video text record": what Supadata Extract returns for every reel.
 * The same JSON is saved for every video and becomes training data later.
 */

export type VideoType =
  | "single_place"
  | "multi_place"
  | "route_trip"
  | "travel_tips_no_place"
  | "travel_vibe_no_place"
  | "not_travel";

export interface ExtractPlace {
  name: string;
  region?: string;
  country?: string;
  lat?: number;
  lng?: number;
  t_start?: string;
  evidence?: string;
  confidence: number;
  creator_label?: string;
}

export interface VideoRecord {
  video_type: VideoType;
  travel_confidence: number;
  what_we_saw: string;
  places: ExtractPlace[];
  places_relation?: "one_place" | "alternatives" | "separate_places";
  vibe_tags?: string[];
  claims?: string[];
  transcript?: { t?: string; text: string }[];
  on_screen_text?: { t?: string; text: string }[];
  editing?: { filter_suspected?: boolean; time_of_day?: string };
  skipped_clips?: number;
}

/** JSON Schema sent to Supadata Extract (`schema` parameter). */
export const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    video_type: {
      type: "string",
      enum: ["single_place", "multi_place", "route_trip", "travel_tips_no_place", "travel_vibe_no_place", "not_travel"],
      description:
        "single_place: the video is about one destination. multi_place: a list or compilation of several destinations. route_trip: one trip moving through several stops. travel_tips_no_place: travel advice with no specific destination. travel_vibe_no_place: travel scenery but no identifiable place. not_travel: not about travel or a visitable place (a restaurant or hotel that can be identified IS a place).",
    },
    travel_confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "How sure you are this video is about travel or a place someone could visit.",
    },
    what_we_saw: {
      type: "string",
      description: "One plain sentence describing what the video actually shows, e.g. 'A home kitchen and someone cooking pasta.'",
    },
    places: {
      type: "array",
      description:
        "Every real, specific place shown (town, beach, viewpoint, landmark, restaurant). Use the most specific correct name. Do not invent places. Empty if none can be identified.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          region: { type: "string" },
          country: { type: "string" },
          lat: { type: "number", description: "Approximate latitude if known" },
          lng: { type: "number", description: "Approximate longitude if known" },
          t_start: { type: "string", description: "When it first appears, m:ss" },
          evidence: { type: "string", description: "What identifies it: spoken name, on-screen text, landmark…" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          creator_label: {
            type: "string",
            description: "What the creator calls this place, only if it differs from what you identified",
          },
        },
        required: ["name", "confidence"],
      },
    },
    places_relation: {
      type: "string",
      enum: ["one_place", "alternatives", "separate_places"],
      description:
        "alternatives: the video shows ONE place but you are unsure which of the listed places it is. separate_places: the video really shows several different places.",
    },
    vibe_tags: {
      type: "array",
      items: { type: "string" },
      description: "3 to 6 short visual vibe tags, e.g. 'turquoise cove', 'white cliffs'.",
    },
    claims: {
      type: "array",
      items: { type: "string" },
      description: "Promises the video makes or implies about the place, e.g. 'nobody around', 'free viewpoint'.",
    },
    transcript: {
      type: "array",
      items: { type: "object", properties: { t: { type: "string" }, text: { type: "string" } }, required: ["text"] },
    },
    on_screen_text: {
      type: "array",
      items: { type: "object", properties: { t: { type: "string" }, text: { type: "string" } }, required: ["text"] },
    },
    editing: {
      type: "object",
      properties: {
        filter_suspected: { type: "boolean" },
        time_of_day: { type: "string" },
      },
    },
    skipped_clips: {
      type: "integer",
      description: "Number of clips where no specific place could be identified.",
    },
  },
  required: ["video_type", "travel_confidence", "what_we_saw", "places"],
} as const;

const clamp01 = (n: unknown, fallback = 0) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const VIDEO_TYPES: VideoType[] = [
  "single_place",
  "multi_place",
  "route_trip",
  "travel_tips_no_place",
  "travel_vibe_no_place",
  "not_travel",
];

/** AI output is never trusted blindly: coerce it into a safe, complete record. */
export function normalizeRecord(raw: unknown): VideoRecord {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const places = Array.isArray(r.places) ? r.places : [];
  const textList = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
      .filter((x) => str(x.text))
      .slice(0, 60)
      .map((x) => ({ t: str(x.t), text: str(x.text)! }));
  const lat = (v: unknown) => {
    const n = num(v);
    return n !== undefined && n >= -90 && n <= 90 ? n : undefined;
  };
  const lng = (v: unknown) => {
    const n = num(v);
    return n !== undefined && n >= -180 && n <= 180 ? n : undefined;
  };

  return {
    video_type: VIDEO_TYPES.includes(r.video_type as VideoType) ? (r.video_type as VideoType) : "not_travel",
    travel_confidence: clamp01(r.travel_confidence),
    what_we_saw: str(r.what_we_saw) ?? "We couldn't describe this video.",
    places: places
      .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}))
      .filter((p) => str(p.name))
      .slice(0, 15)
      .map((p) => ({
        name: str(p.name)!,
        region: str(p.region),
        country: str(p.country),
        lat: lat(p.lat),
        lng: lng(p.lng),
        t_start: str(p.t_start),
        evidence: str(p.evidence),
        confidence: clamp01(p.confidence, 0.5),
        creator_label: str(p.creator_label),
      })),
    places_relation: ["one_place", "alternatives", "separate_places"].includes(r.places_relation as string)
      ? (r.places_relation as VideoRecord["places_relation"])
      : undefined,
    vibe_tags: (Array.isArray(r.vibe_tags) ? r.vibe_tags : [])
      .map(str)
      .filter((s): s is string => !!s)
      .slice(0, 6),
    claims: (Array.isArray(r.claims) ? r.claims : [])
      .map(str)
      .filter((s): s is string => !!s)
      .slice(0, 8),
    transcript: textList(r.transcript),
    on_screen_text: textList(r.on_screen_text),
    editing:
      r.editing && typeof r.editing === "object"
        ? {
            filter_suspected: (r.editing as Record<string, unknown>).filter_suspected === true,
            time_of_day: str((r.editing as Record<string, unknown>).time_of_day),
          }
        : undefined,
    skipped_clips: Math.max(0, Math.round(num(r.skipped_clips) ?? 0)),
  };
}
