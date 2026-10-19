import type { Profile } from "../../shared/types";

/** Owner id for everything a logged-in user owns. Anonymous owners use the bare device id. */
export const ownerForUser = (userId: string) => `u:${userId}`;

const SESSION_DAYS = 90;

export const randomToken = (bytes = 32) => {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
};

export async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface UserRow {
  id: string;
  google_sub: string | null;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
}

/** Who holds this session cookie, if anyone. */
export async function userForSession(db: D1Database, token: string | undefined): Promise<UserRow | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = await sha256(token);
  return db
    .prepare("SELECT u.id, u.google_sub, u.email, u.name, u.avatar_url FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?")
    .bind(hash, Date.now())
    .first<UserRow>();
}

export async function createSession(db: D1Database, userId: string): Promise<{ token: string; maxAge: number }> {
  const token = randomToken();
  const now = Date.now();
  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), userId, now, now + SESSION_DAYS * 86400_000)
    .run();
  return { token, maxAge: SESSION_DAYS * 86400 };
}

export async function deleteSession(db: D1Database, token: string | undefined) {
  if (!token) return;
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export interface GoogleIdentity {
  sub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

/** Find or create the user for a Google identity. */
export async function upsertGoogleUser(db: D1Database, g: GoogleIdentity): Promise<UserRow> {
  const now = Date.now();
  const existing = await db.prepare("SELECT id, google_sub, email, name, avatar_url FROM users WHERE google_sub = ?").bind(g.sub).first<UserRow>();
  if (existing) {
    await db
      .prepare("UPDATE users SET email = ?, name = ?, avatar_url = ?, last_login_at = ? WHERE id = ?")
      .bind(g.email ?? existing.email, g.name ?? existing.name, g.picture ?? existing.avatar_url, now, existing.id)
      .run();
    return { ...existing, email: g.email ?? existing.email, name: g.name ?? existing.name, avatar_url: g.picture ?? existing.avatar_url };
  }
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  await db
    .prepare("INSERT INTO users (id, google_sub, email, name, avatar_url, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, g.sub, g.email, g.name, g.picture, now, now)
    .run();
  return { id, google_sub: g.sub, email: g.email, name: g.name, avatar_url: g.picture };
}

/**
 * Everything this device did before logging in now belongs to the account.
 * Rows that would collide with the account's own (same saved place, same vote) are dropped, so nothing
 * stays behind under the device id: the account keeps one row per place/vote, and a later logout shows a clean guest.
 */
export async function mergeDeviceIntoUser(db: D1Database, deviceId: string, userId: string) {
  const owner = ownerForUser(userId);
  if (!deviceId || deviceId === owner) return;
  const statements = [
    db.prepare("UPDATE checks SET device_id = ? WHERE device_id = ?").bind(owner, deviceId),
    db.prepare("UPDATE OR IGNORE saves SET device_id = ? WHERE device_id = ?").bind(owner, deviceId),
    db.prepare("DELETE FROM saves WHERE device_id = ?").bind(deviceId),
    db.prepare("UPDATE trips SET device_id = ? WHERE device_id = ?").bind(owner, deviceId),
    db.prepare("UPDATE OR IGNORE shares SET device_id = ? WHERE device_id = ?").bind(owner, deviceId),
    // A vote cast on this device wins over an older one on the account (the latest opinion counts once).
    db.prepare("DELETE FROM votes WHERE device_id = ? AND share_token IN (SELECT v.share_token FROM votes v WHERE v.device_id = ? AND v.created_at <= (SELECT d.created_at FROM votes d WHERE d.device_id = ? AND d.share_token = v.share_token))").bind(owner, owner, deviceId),
    db.prepare("UPDATE OR IGNORE votes SET device_id = ? WHERE device_id = ?").bind(owner, deviceId),
    db.prepare("DELETE FROM votes WHERE device_id = ?").bind(deviceId),
    db.prepare("UPDATE feedback SET device_id = ? WHERE device_id = ?").bind(owner, deviceId),
    // Onboarding answers: the account keeps its own if it has any; otherwise the device's move over.
    db.prepare("UPDATE OR IGNORE profiles SET owner_id = ? WHERE owner_id = ?").bind(owner, deviceId),
    db.prepare("DELETE FROM profiles WHERE owner_id = ?").bind(deviceId),
  ];
  await db.batch(statements);
}

export const EMPTY_PROFILE: Profile = { vibes: [] };

export async function readProfile(db: D1Database, ownerId: string): Promise<Profile | null> {
  const row = await db.prepare("SELECT json FROM profiles WHERE owner_id = ?").bind(ownerId).first<{ json: string }>();
  if (!row) return null;
  try {
    return cleanProfile(JSON.parse(row.json));
  } catch {
    return null;
  }
}

export async function writeProfile(db: D1Database, ownerId: string, patch: unknown): Promise<Profile> {
  // Only the fields the client sent, validated; merged by SQLite itself so two quick saves can't overwrite each other.
  const clean = cleanPatch(patch);
  await db
    .prepare(
      "INSERT INTO profiles (owner_id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT (owner_id) DO UPDATE SET json = json_patch(profiles.json, ?), updated_at = excluded.updated_at",
    )
    .bind(ownerId, JSON.stringify({ ...EMPTY_PROFILE, ...clean }), Date.now(), JSON.stringify(clean))
    .run();
  return (await readProfile(db, ownerId)) ?? EMPTY_PROFILE;
}

/** The valid fields present in a patch (and nothing else), so a save of one answer can't blank the others. */
export function cleanPatch(raw: unknown): Partial<Profile> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const full = cleanProfile(raw);
  const out: Partial<Profile> = {};
  if (Array.isArray(r.vibes)) out.vibes = full.vibes;
  if ("crew" in r && full.crew) out.crew = full.crew;
  if ("budget" in r && full.budget !== undefined) out.budget = full.budget;
  if ("home" in r && full.home !== undefined) out.home = full.home;
  if (full.onboarded) out.onboarded = true;
  return out;
}

const CREWS = new Set(["solo", "partner", "friends", "family"]);

/** Keep only well-formed fields, so a bad client can't store junk. */
export function cleanProfile(raw: unknown): Profile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p: Profile = {
    vibes: Array.isArray(r.vibes) ? r.vibes.filter((v): v is string => typeof v === "string" && /^[a-z-]{2,24}$/.test(v)).slice(0, 12) : [],
  };
  if (typeof r.crew === "string" && CREWS.has(r.crew)) p.crew = r.crew as Profile["crew"];
  if (typeof r.budget === "number" && Number.isFinite(r.budget) && r.budget >= 0) p.budget = Math.round(r.budget);
  if (typeof r.home === "string" && r.home.trim()) p.home = r.home.trim().slice(0, 60);
  if (r.onboarded === true) p.onboarded = true;
  return p;
}

/** Where to send someone after login: only paths inside the app. */
export const safeNext = (next: string | undefined, fallback = "/") => (next && /^\/(?!\/)[\w\-./?=&%]*$/.test(next) ? next : fallback);

/** Vibe words the onboarding picks stand for, matched against card vibes in Explore. */
export const VIBE_WORDS: Record<string, string[]> = {
  beach: ["beach", "coast", "coastal", "sea", "seaside", "sand", "cove"],
  mountains: ["mountain", "alpine", "alps", "peak", "hiking", "valley", "ridge"],
  city: ["city", "urban", "nightlife", "skyline", "neon", "street"],
  villages: ["village", "old town", "medieval", "hilltop", "cobbled", "hidden"],
  food: ["food", "market", "street food", "wine", "vineyard", "cafe", "cuisine"],
  desert: ["desert", "dunes", "canyon", "stars", "oasis"],
  islands: ["island", "boat", "sailing", "lagoon", "snorkel", "harbour", "harbor"],
  snow: ["snow", "ski", "winter", "glacier", "ice", "northern lights"],
  nature: ["forest", "lake", "waterfall", "wild", "nature", "national park"],
  culture: ["temple", "museum", "history", "ruins", "heritage", "castle", "art"],
};
