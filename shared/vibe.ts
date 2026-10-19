import type { Profile, SavedPlace } from "./types";

/** One learned vibe word, with how many saved places taught it. */
export interface VibeTag {
  /** Normalised key, e.g. "hidden gem" (what is stored when a tag is muted). */
  key: string;
  /** How it is shown: the most common spelling among the saves. */
  label: string;
  count: number;
  /** Names of the saved places that taught it, most recent first (at most 3). */
  from: string[];
}

export interface VibeProfile {
  /** Learned from saves, strongest first. Empty when learning is off. */
  tags: VibeTag[];
  /** Tags the person removed by hand (keys). */
  muted: string[];
  /** Whether saves teach the profile at all (default on). */
  learning: boolean;
  /** How many saved places went into it. */
  saves: number;
}

/** Same normalisation as the worker's placeKey, kept here so client and server mute the same key. */
export const vibeKey = (word: string) =>
  word
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export const MAX_VIBE_TAGS = 12;

/**
 * Build the learned vibe from saved places. A word counts once per place, however often the reel repeated it;
 * muted words are left out; with learning off nothing is learned (the onboarding picks still stand on their own).
 */
export function buildVibe(saves: readonly SavedPlace[], profile: Profile | null | undefined): VibeProfile {
  const muted = (profile?.vibeOff ?? []).map(vibeKey).filter(Boolean);
  const learning = profile?.learnVibe !== false;
  if (!learning) return { tags: [], muted, learning, saves: saves.length };
  const mutedSet = new Set(muted);
  const acc = new Map<string, { count: number; labels: Map<string, number>; from: string[] }>();
  const ordered = [...saves].sort((a, b) => b.createdAt - a.createdAt);
  for (const s of ordered) {
    const seen = new Set<string>();
    for (const raw of s.vibe ?? []) {
      const key = vibeKey(raw);
      if (!key || key.length > 32 || mutedSet.has(key) || seen.has(key)) continue;
      seen.add(key);
      const entry = acc.get(key) ?? { count: 0, labels: new Map<string, number>(), from: [] as string[] };
      entry.count += 1;
      const label = raw.trim();
      entry.labels.set(label, (entry.labels.get(label) ?? 0) + 1);
      if (entry.from.length < 3) entry.from.push(s.name);
      acc.set(key, entry);
    }
  }
  const tags: VibeTag[] = [...acc.entries()]
    .map(([key, e]) => ({
      key,
      label: [...e.labels.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
      count: e.count,
      from: e.from,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, MAX_VIBE_TAGS);
  return { tags, muted, learning, saves: saves.length };
}
