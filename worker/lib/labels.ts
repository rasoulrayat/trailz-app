import type { CheckResult, CheckStatusName } from "../../shared/types";

const uniq = (xs: (string | undefined | null)[]) => [...new Set(xs.filter((x): x is string => !!x && !!x.trim()))];

/**
 * How a check is named in "Your recent checks": where it is first, then the vibe.
 * e.g. "Japan · 6 places", "India · pine forest, mountain valley", "Oia · Greece".
 */
export function checkLabel(r: CheckResult | null, status: CheckStatusName): { label: string; kind: string; photoQuery?: string } {
  const base = labelOf(r, status);
  return { ...base, photoQuery: photoQueryOf(r) };
}

/** A place to show a photo of when the reel has no cover image. */
function photoQueryOf(r: CheckResult | null): string | undefined {
  const q = (name?: string, country?: string | null) => (name ? [name, country].filter(Boolean).join(", ") : undefined);
  switch (r?.outcome) {
    case "single":
      return q(r.card.place.name, r.card.place.country);
    case "multi":
      return q(r.places[0]?.name, r.places[0]?.country);
    case "pick":
      return q(r.candidates[0]?.name, r.candidates[0]?.country);
    case "vibe":
      return q(r.suggestions[0]?.name, r.suggestions[0]?.country);
    default:
      return undefined;
  }
}

function labelOf(r: CheckResult | null, status: CheckStatusName): { label: string; kind: string } {
  if (!r) {
    return status === "failed" ? { label: "Couldn't open", kind: "Try again" } : { label: "Checking…", kind: "In progress" };
  }
  switch (r.outcome) {
    case "single": {
      const p = r.card.place;
      return { label: [p.name, p.country].filter(Boolean).join(" · "), kind: "Reality Card" };
    }
    case "multi": {
      const countries = uniq(r.places.map((p) => p.country));
      const where =
        countries.length === 0 ? null : countries.length <= 2 ? countries.join(" & ") : `${countries.slice(0, 2).join(", ")} +${countries.length - 2}`;
      return { label: [where, `${r.places.length} places`].filter(Boolean).join(" · "), kind: "Many places" };
    }
    case "pick": {
      const c = r.candidates[0];
      return { label: c ? [`${c.name}?`, c.country].filter(Boolean).join(" · ") : "Which place?", kind: "Is it one of these?" };
    }
    case "vibe": {
      const where = r.filmedIn?.replace(/\s*\(.*\)\s*$/, "") || "Somewhere";
      const vibe = r.vibe.slice(0, 2).join(", ");
      return { label: [where, vibe].filter(Boolean).join(" · "), kind: "Places with this vibe" };
    }
    case "not_travel":
      return { label: "Not a travel video", kind: r.kind === "tips" ? "Travel tips" : "No place" };
  }
}
