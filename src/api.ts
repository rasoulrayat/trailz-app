import type { ApiError, CheckStatus, CheckSummary, Handoff, Me, Mood, PlaceCardResponse, Profile, RealityCard, SavedPlace, StartCheckResponse, ExploreResponse, SharePayload, Trip, TripPrices, TripSuggestion } from "../shared/types";
import { exploreVersion } from "./explore-version";

export class ApiFailure extends Error {
  constructor(
    readonly code: ApiError["error"],
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiFailure("server_error", "You seem to be offline. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) {
    const err = body as ApiError | null;
    throw new ApiFailure(err?.error ?? "server_error", err?.message ?? "Something went wrong. Try again.");
  }
  return body as T;
}

export const api = {
  startCheck: (input: string) =>
    call<StartCheckResponse>("/api/checks", { method: "POST", body: JSON.stringify({ input }) }),
  getCheck: (id: string) => call<CheckStatus>(`/api/checks/${encodeURIComponent(id)}`),
  listChecks: () => call<{ items: CheckSummary[] }>("/api/checks"),
  placeCard: (id: string, name: string, typed = false) =>
    call<PlaceCardResponse>(`/api/checks/${encodeURIComponent(id)}/place-card`, {
      method: "POST",
      body: JSON.stringify({ name, typed }),
    }),
  reportWrong: (id: string, value = "") =>
    call<{ ok: true }>(`/api/checks/${encodeURIComponent(id)}/feedback`, {
      method: "POST",
      body: JSON.stringify({ kind: "wrong_result", value }),
    }),
};

// Reality Cards in flight or done, so a card started in the background is reused when the place is opened.
// Only full cards stay cached: a partial answer (facts without the verdict) is asked again.
const cardCache = new Map<string, Promise<PlaceCardResponse>>();

/** Reality Card for a place, shared with any background request for the same place. */
export function placeCardShared(id: string, name: string, typed = false) {
  const key = `${id}|${name}|${typed ? 1 : 0}`;
  let p = cardCache.get(key);
  if (!p) {
    p = api.placeCard(id, name, typed);
    p.then((r) => r.pending && cardCache.delete(key)).catch(() => cardCache.delete(key)); // partial or failed: retry later
    cardCache.set(key, p);
  }
  return p;
}

/** The full card: shows the facts as soon as they exist (via `onPartial`) and keeps asking until the verdict is in. */
export async function placeCardFull(id: string, name: string, typed: boolean, onPartial: (r: PlaceCardResponse) => void, signal?: { stop: boolean }): Promise<RealityCard> {
  for (;;) {
    const r = await placeCardShared(id, name, typed);
    if (signal?.stop) throw new Error("stopped");
    if (r.card && !r.pending) return r.card;
    onPartial(r);
    await new Promise((res) => setTimeout(res, 2500));
    if (signal?.stop) throw new Error("stopped");
  }
}

/**
 * Start writing the Reality Cards of the places on a result screen, one after another,
 * so the first taps open instantly. Writing a card takes the AI 10 to 30 seconds.
 */
export async function prefetchCards(id: string, names: string[]) {
  for (const name of names) {
    await placeCardShared(id, name).catch(() => {});
  }
}

// ---------- Saved places and trips ----------
export type SavesResponse = { items: SavedPlace[]; suggestions: TripSuggestion[] };
export type NewSave = Omit<SavedPlace, "id" | "createdAt">;

export const tripsApi = {
  listSaves: () => call<SavesResponse>("/api/saves"),
  save: (place: NewSave) => call<SavesResponse>("/api/saves", { method: "POST", body: JSON.stringify(place) }),
  unsave: (id: string) => call<SavesResponse>(`/api/saves/${encodeURIComponent(id)}`, { method: "DELETE" }),
  listTrips: () => call<{ items: Trip[] }>("/api/trips"),
  getTrip: (id: string) => call<{ trip: Trip }>(`/api/trips/${encodeURIComponent(id)}`),
  createTrip: (body: {
    placeIds?: string[];
    places?: NewSave[];
    mood: Mood;
    budgetMode: boolean;
    days?: number;
    origin?: string;
    travelers?: number;
  }) => call<{ trip: Trip }>("/api/trips", { method: "POST", body: JSON.stringify(body) }),
  updateTrip: (id: string, body: { status?: "saved"; startDate?: string | null; origin?: string; travelers?: number; booked?: Trip["booked"] }) =>
    call<{ trip: Trip }>(`/api/trips/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTrip: (id: string) => call<{ ok: true }>(`/api/trips/${encodeURIComponent(id)}`, { method: "DELETE" }),
  handoff: (id: string) => call<{ handoff: Handoff }>(`/api/trips/${encodeURIComponent(id)}/handoff`),
  prices: (id: string) => call<{ prices: TripPrices | null; reason?: string }>(`/api/trips/${encodeURIComponent(id)}/prices`),
};

// Prices are fetched when the trip page opens, so the booking screen is already filled when it's tapped.
const priceCache = new Map<string, { at: number; p: Promise<{ prices: TripPrices | null; reason?: string }> }>();
export function pricesShared(id: string, force = false) {
  const hit = priceCache.get(id);
  if (hit && !force && Date.now() - hit.at < 10 * 60_000) return hit.p;
  const p = tripsApi.prices(id);
  p.catch(() => priceCache.delete(id));
  priceCache.set(id, { at: Date.now(), p });
  return p;
}
export const forgetPrices = (id: string) => priceCache.delete(id);

/** Wait for the shared price request, but never longer than `ms`: the booking screen then shows its own loading rows. */
export function waitForPrices(id: string, ms = 25_000): Promise<void> {
  return Promise.race([pricesShared(id).then(() => undefined, () => undefined), new Promise<void>((r) => setTimeout(r, ms))]);
}

export const exploreApi = {
  list: (params: Record<string, string>) => call<ExploreResponse>(`/api/explore?${new URLSearchParams({ ...params, v: exploreVersion() }).toString()}`),
};

export const shareApi = {
  create: (kind: "check" | "trip", id: string, placeName?: string) =>
    call<{ token: string; url: string }>("/api/share", { method: "POST", body: JSON.stringify({ kind, id, placeName }) }),
  get: (token: string) => call<SharePayload>(`/api/share/${encodeURIComponent(token)}`),
  vote: (token: string, vote: "in" | "out", name?: string) =>
    call<{ votes: SharePayload["votes"] }>(`/api/share/${encodeURIComponent(token)}/vote`, { method: "POST", body: JSON.stringify({ vote, name }) }),
  mine: (kind: "check" | "trip", id: string, placeName?: string) =>
    call<{ token: string | null; votes: SharePayload["votes"] | null }>(`/api/share/mine?kind=${kind}&id=${encodeURIComponent(id)}${placeName ? `&placeName=${encodeURIComponent(placeName)}` : ""}`),
};

export const meApi = {
  get: () => call<Me>("/api/me"),
  saveProfile: (patch: Partial<Profile>) => call<{ profile: Profile }>("/api/me/profile", { method: "PUT", body: JSON.stringify(patch) }),
  logout: () => call<{ ok: true }>("/api/auth/logout", { method: "POST" }),
};
