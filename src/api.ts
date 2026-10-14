import type { ApiError, CheckStatus, CheckSummary, Handoff, Mood, RealityCard, SavedPlace, StartCheckResponse, Trip, TripSuggestion } from "../shared/types";

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
    call<{ card: RealityCard }>(`/api/checks/${encodeURIComponent(id)}/place-card`, {
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
const cardCache = new Map<string, Promise<{ card: RealityCard }>>();

/** Reality Card for a place, shared with any background request for the same place. */
export function placeCardShared(id: string, name: string, typed = false) {
  const key = `${id}|${name}|${typed ? 1 : 0}`;
  let p = cardCache.get(key);
  if (!p) {
    p = api.placeCard(id, name, typed);
    p.catch(() => cardCache.delete(key)); // a failure can be retried
    cardCache.set(key, p);
  }
  return p;
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
  updateTrip: (id: string, body: { status?: "saved"; startDate?: string | null; origin?: string; travelers?: number }) =>
    call<{ trip: Trip }>(`/api/trips/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTrip: (id: string) => call<{ ok: true }>(`/api/trips/${encodeURIComponent(id)}`, { method: "DELETE" }),
  handoff: (id: string) => call<{ handoff: Handoff }>(`/api/trips/${encodeURIComponent(id)}/handoff`),
};
