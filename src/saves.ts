import { useEffect, useSyncExternalStore } from "react";
import type { SavedPlace, TripSuggestion } from "../shared/types";
import { tripsApi, type NewSave } from "./api";

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

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export const findSaved = (name: string, country?: string | null) =>
  state.items.find((s) => norm(s.name) === norm(name) && (!country || !s.country || norm(s.country) === norm(country)));

export async function toggleSave(place: NewSave) {
  const existing = findSaved(place.name, place.country);
  if (existing) {
    // Optimistic: the heart empties at once.
    set({ items: state.items.filter((s) => s.id !== existing.id) });
    const r = await tripsApi.unsave(existing.id).catch(() => null);
    if (r) set({ items: r.items, suggestions: r.suggestions });
    else loadSaves(true);
    return false;
  }
  set({ items: [{ ...place, id: `tmp-${Date.now()}`, createdAt: Date.now() }, ...state.items] });
  const r = await tripsApi.save(place).catch(() => null);
  if (r) set({ items: r.items, suggestions: r.suggestions });
  else loadSaves(true);
  return true;
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
