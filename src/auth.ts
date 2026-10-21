import { useEffect, useSyncExternalStore } from "react";
import type { Me, Profile } from "../shared/types";
import { meApi } from "./api";
import { bumpExploreVersion } from "./explore-version";

/** Who is using the app (account or anonymous) and their onboarding picks, shared by every screen. */
interface State extends Me {
  loaded: boolean;
}
let state: State = { user: null, profile: null, canLogin: true, canEmail: false, contact: null, loaded: false };
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
        // Coming back from a login (or logout) changes whose saves and picks the feed is about.
        if ((state.user?.id ?? null) !== (m.user?.id ?? null) && state.loaded) bumpExploreVersion();
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
    () => state, // server render (tests): the same snapshot
  );
  useEffect(() => {
    loadMe();
  }, []);
  return s;
}

// Saves run one after another and only the latest answer is applied: a fast tap burst can't land out of order.
let saveChain: Promise<unknown> = Promise.resolve();
let saveSeq = 0;
export function saveProfile(patch: Partial<Profile>): Promise<Profile> {
  // Optimistic: the picks show at once.
  set({ profile: { vibes: [], ...(state.profile ?? {}), ...patch } });
  bumpExploreVersion();
  const seq = ++saveSeq;
  const run = saveChain.then(() => meApi.saveProfile(patch)).then((r) => {
    if (seq === saveSeq) set({ profile: r.profile });
    return r.profile;
  });
  saveChain = run.catch(() => null);
  return run;
}

export async function logout() {
  await meApi.logout();
  set({ user: null, profile: null });
  bumpExploreVersion();
  await loadMe(true);
}

/** Where to send the browser to sign in with Google and come back to `next`. */
export const loginUrl = (next: string = typeof location !== "undefined" ? location.pathname + location.search : "/") =>
  `/api/auth/google/start?next=${encodeURIComponent(next)}`;

/** The in-app "Log in with email" screen, coming back to `next`. */
export const emailLoginUrl = (next: string = typeof location !== "undefined" ? location.pathname + location.search : "/") =>
  `/login?next=${encodeURIComponent(next)}`;

/** Only paths inside the app (same rule as the worker's safeNext). */
export const safeNextPath = (next: string | null | undefined, fallback = "/") =>
  next && /^\/(?!\/)[\w\-./?=&%]*$/.test(next) && !next.startsWith("/login") ? next : fallback;

// ---- This phone remembers the last way and address used, so the log-in screen opens there (23c).
const METHOD_KEY = "tz_login_method";
const EMAIL_KEY = "tz_login_email";
export function rememberLogin(method: "code" | "password", email: string) {
  try {
    localStorage.setItem(METHOD_KEY, method);
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* ignore */
  }
}
export function lastLogin(): { method: "code" | "password" | null; email: string } {
  try {
    const m = localStorage.getItem(METHOD_KEY);
    return { method: m === "password" || m === "code" ? m : null, email: localStorage.getItem(EMAIL_KEY) ?? "" };
  } catch {
    return { method: null, email: "" };
  }
}

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
