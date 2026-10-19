import { useEffect, useSyncExternalStore } from "react";
import type { SavedPlace, TripSuggestion } from "../shared/types";
import { tripsApi, type NewSave } from "./api";
import { bumpExploreVersion } from "./explore-version";

/** Saved places for this device, shared by every screen (one fetch, instant hearts). */
interface State {
  items: SavedPlace[];
  suggestions: TripSuggestion[];
  loaded: boolean;
}
let state: State = { items: [], suggestions: [], loaded: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  emit();
};
let loading: Promise<void> | null = null;

export function loadSaves(force = false) {
  if (state.loaded && !force) return Promise.resolve();
  if (!loading) {
    loading = tripsApi
      .listSaves()
      .then((r) => set({ items: r.items, suggestions: r.suggestions, loaded: true }))
      .catch(() => set({ loaded: true }))
      .finally(() => (loading = null));
  }
  return loading;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const findSaved = (name: string, country?: string | null) =>
  state.items.find((s) => norm(s.name) === norm(name) && (!country || !s.country || norm(s.country) === norm(country)));

const inFlight = new Map<string, Promise<boolean>>();
/** Server ids of places saved from this session, so an unsave of a still-optimistic row knows what to delete. */
const serverIds = new Map<string, string>();
const flightKey = (name: string, country?: string | null) => `${norm(name)}|${norm(country ?? "")}`;

/**
 * Save or unsave. The heart changes at once; the network work for one place runs in order, so a second tap
 * while the first is still saving ends where the person left it (and never deletes a temporary id).
 */
export function toggleSave(place: NewSave): Promise<boolean> {
  bumpExploreVersion();
  const key = flightKey(place.name, place.country);
  const existing = findSaved(place.name, place.country);
  const prev = (inFlight.get(key) ?? Promise.resolve(false)).catch(() => false);
  let run: Promise<boolean>;
  const latest = () => inFlight.get(key) === run;
  if (existing) {
    // Optimistic: the heart empties at once.
    set({ items: state.items.filter((s) => s.id !== existing.id) });
    run = prev.then(async () => {
      const id = existing.id.startsWith("tmp-") ? serverIds.get(key) : existing.id;
      const r = id ? await tripsApi.unsave(id).catch(() => null) : null;
      if (r && latest()) set({ items: r.items, suggestions: r.suggestions });
      else if (!r) loadSaves(true);
      return false;
    });
  } else {
    set({ items: [{ ...place, id: `tmp-${Date.now()}`, createdAt: Date.now() }, ...state.items] });
    run = prev.then(async () => {
      const r = await tripsApi.save(place).catch(() => null);
      if (r) {
        const saved = r.items.find((s) => flightKey(s.name, s.country) === key);
        if (saved) serverIds.set(key, saved.id);
        if (latest()) set({ items: r.items, suggestions: r.suggestions });
      } else loadSaves(true);
      return true;
    });
  }
  inFlight.set(key, run);
  run.finally(() => latest() && inFlight.delete(key)).catch(() => null);
  return run;
}

export function useSaves(): State {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  useEffect(() => {
    loadSaves();
  }, []);
  return s;
}
