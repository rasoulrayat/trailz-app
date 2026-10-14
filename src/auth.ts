import { useEffect, useSyncExternalStore } from "react";
import type { Me, Profile } from "../shared/types";
import { meApi } from "./api";

/** Who is using the app (account or anonymous) and their onboarding picks, shared by every screen. */
interface State extends Me {
  loaded: boolean;
}
let state: State = { user: null, profile: null, canLogin: true, loaded: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  emit();
};
let loading: Promise<void> | null = null;

export function loadMe(force = false) {
  if (state.loaded && !force) return Promise.resolve();
  if (!loading) {
    loading = meApi
      .get()
      .then((m) => {
        set({ ...m, loaded: true });
        if (m.profile?.onboarded) markOnboarded();
      })
      .catch(() => set({ loaded: true }))
      .finally(() => (loading = null));
  }
  return loading;
}

export function useMe() {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  useEffect(() => {
    loadMe();
  }, []);
  return s;
}

export async function saveProfile(patch: Partial<Profile>) {
  // Optimistic: the picks show at once.
  set({ profile: { vibes: [], ...(state.profile ?? {}), ...patch } });
  const r = await meApi.saveProfile(patch);
  set({ profile: r.profile });
  return r.profile;
}

export async function logout() {
  await meApi.logout();
  set({ user: null, profile: null });
  await loadMe(true);
}

/** Where to send the browser to sign in with Google and come back to `next`. */
export const loginUrl = (next: string = typeof location !== "undefined" ? location.pathname + location.search : "/") =>
  `/api/auth/google/start?next=${encodeURIComponent(next)}`;

// ---- First visit: show the intro once. The flag is local (instant) and mirrored in the profile (follows the account).
const KEY = "tz_onboarded";
export const hasOnboarded = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true; // no storage: never trap someone in the intro
  }
};
export const markOnboarded = () => {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
};
export const resetOnboarded = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
