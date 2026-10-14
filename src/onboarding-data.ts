import type { Crew } from "../shared/types";

/** The picks in the intro. Ids are what the server matches against card vibes. */
export const VIBES: { id: string; label: string; photoQuery: string; tint: string }[] = [
  { id: "beach", label: "Beach days", photoQuery: "Navagio Beach, Greece", tint: "linear-gradient(160deg, #1b6fb8, #5fd0e8)" },
  { id: "mountains", label: "Mountain air", photoQuery: "Kandersteg, Switzerland", tint: "linear-gradient(160deg, #2f5d3a, #9fd0a8)" },
  { id: "city", label: "Big city nights", photoQuery: "Shinjuku, Tokyo", tint: "linear-gradient(160deg, #2a1f5e, #ff6fa5)" },
  { id: "villages", label: "Hidden villages", photoQuery: "Atrani, Italy", tint: "linear-gradient(160deg, #8a4b2a, #f2c28c)" },
  { id: "food", label: "Food first", photoQuery: "Mercado de San Miguel, Madrid", tint: "linear-gradient(160deg, #a3321f, #ffb37a)" },
  { id: "desert", label: "Desert & stars", photoQuery: "Wadi Rum, Jordan", tint: "linear-gradient(160deg, #7a3e1d, #f0a35a)" },
  { id: "islands", label: "Islands & boats", photoQuery: "Hvar, Croatia", tint: "linear-gradient(160deg, #0d5c8a, #7fe0d6)" },
  { id: "snow", label: "Snow & lights", photoQuery: "Tromsø, Norway", tint: "linear-gradient(160deg, #1c3a6b, #b9d7ff)" },
  { id: "culture", label: "Temples & history", photoQuery: "Fushimi Inari, Kyoto", tint: "linear-gradient(160deg, #6b1f2a, #ff9a8a)" },
];

export const CREWS: { id: Crew; label: string; sub: string; icon: "user" | "heart" | "users" | "home" }[] = [
  { id: "solo", label: "Just me", sub: "my trip, my rules", icon: "user" },
  { id: "partner", label: "Me + 1", sub: "partner, bestie, whoever", icon: "heart" },
  { id: "friends", label: "The group chat", sub: "3 or more, chaos included", icon: "users" },
  { id: "family", label: "Family", sub: "everyone has an opinion", icon: "home" },
];

export const BUDGETS: { value: number; label: string; sub: string }[] = [
  { value: 300, label: "Under €300", sub: "broke but bold" },
  { value: 600, label: "€300–600", sub: "comfy, not fancy" },
  { value: 1000, label: "€600–1000", sub: "treat yourself" },
  { value: 0, label: "Whatever it takes", sub: "the trip is the budget" },
];

/** A likely home city from the phone's time zone: one tap instead of typing. */
const TZ_CITY: Record<string, string> = {
  "Europe/Amsterdam": "Amsterdam", "Europe/London": "London", "Europe/Berlin": "Berlin", "Europe/Paris": "Paris", "Europe/Madrid": "Madrid",
  "Europe/Rome": "Rome", "Europe/Lisbon": "Lisbon", "Europe/Vienna": "Vienna", "Europe/Zurich": "Zurich", "Europe/Brussels": "Brussels",
  "Europe/Stockholm": "Stockholm", "Europe/Copenhagen": "Copenhagen", "Europe/Oslo": "Oslo", "Europe/Dublin": "Dublin", "Europe/Prague": "Prague",
  "Europe/Warsaw": "Warsaw", "Europe/Athens": "Athens", "Europe/Istanbul": "Istanbul", "Europe/Budapest": "Budapest", "Europe/Helsinki": "Helsinki",
  "Asia/Tehran": "Tehran", "Asia/Dubai": "Dubai", "Asia/Riyadh": "Riyadh", "Asia/Tokyo": "Tokyo", "Asia/Seoul": "Seoul", "Asia/Singapore": "Singapore",
  "Asia/Bangkok": "Bangkok", "Asia/Kolkata": "Mumbai", "Asia/Shanghai": "Shanghai", "Asia/Hong_Kong": "Hong Kong", "Australia/Sydney": "Sydney",
  "America/New_York": "New York", "America/Los_Angeles": "Los Angeles", "America/Chicago": "Chicago", "America/Toronto": "Toronto",
  "America/Mexico_City": "Mexico City", "America/Sao_Paulo": "São Paulo", "Africa/Cairo": "Cairo", "Africa/Johannesburg": "Johannesburg",
};
export function guessHomeCity(): string | null {
  try {
    return TZ_CITY[Intl.DateTimeFormat().resolvedOptions().timeZone] ?? null;
  } catch {
    return null;
  }
}

export const budgetLabel = (b: number | undefined) => (b === undefined ? null : (BUDGETS.find((x) => x.value === b)?.label ?? `~€${b}`));
