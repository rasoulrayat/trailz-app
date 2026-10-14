import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Me } from "../shared/types";
import { isMock, type Env } from "./env";
import { createSession, deleteSession, mergeDeviceIntoUser, randomToken, readProfile, safeNext, upsertGoogleUser, writeProfile, type GoogleIdentity, type UserRow } from "./lib/auth";
import { logError } from "./lib/store";

export type AuthVars = { deviceId: string; rawDeviceId: string; user: UserRow | null };
type AppEnv = { Bindings: Env; Variables: AuthVars };

export const SESSION_COOKIE = "tz_session";
const STATE_COOKIE = "tz_oauth";

export const auth = new Hono<AppEnv>();

const canLogin = (env: Env) => isMock(env) || !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const redirectUri = (reqUrl: string) => `${new URL(reqUrl).origin}/api/auth/google/callback`;

async function finishLogin(c: Context<AppEnv>, g: GoogleIdentity, next: string) {
  const user = await upsertGoogleUser(c.env.DB, g);
  await mergeDeviceIntoUser(c.env.DB, c.get("rawDeviceId"), user.id);
  const { token, maxAge } = await createSession(c.env.DB, user.id);
  setCookie(c, SESSION_COOKIE, token, { path: "/", httpOnly: true, secure: true, sameSite: "Lax", maxAge });
  deleteCookie(c, STATE_COOKIE, { path: "/" });
  return c.redirect(safeNext(next));
}

// ---------- GET /api/auth/google/start?next=/path ----------
auth.get("/auth/google/start", async (c) => {
  const next = safeNext(c.req.query("next"));
  if (!canLogin(c.env)) return c.text("Sign-in isn't set up yet.", 503);
  if (isMock(c.env)) {
    // Sample account for local development and screenshots.
    return finishLogin(c, { sub: "mock-sam", email: "sam@example.com", name: "Sam Mock", picture: null }, next);
  }
  const state = randomToken(16);
  setCookie(c, STATE_COOKIE, `${state}.${next}`, { path: "/", httpOnly: true, secure: true, sameSite: "Lax", maxAge: 600 });
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", c.env.GOOGLE_CLIENT_ID!);
  u.searchParams.set("redirect_uri", redirectUri(c.req.url));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("prompt", "select_account");
  return c.redirect(u.toString());
});

// ---------- GET /api/auth/google/callback ----------
auth.get("/auth/google/callback", async (c) => {
  const saved = getCookie(c, STATE_COOKIE) ?? "";
  const dot = saved.indexOf(".");
  const state = dot > 0 ? saved.slice(0, dot) : "";
  const next = dot > 0 ? saved.slice(dot + 1) : "/";
  const code = c.req.query("code");
  if (!code || !state || c.req.query("state") !== state) return c.redirect(`${safeNext(next)}?login=failed`);
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID!,
        client_secret: c.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(c.req.url),
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const tok = (await tokenRes.json()) as { id_token?: string; error?: string; error_description?: string };
    if (!tokenRes.ok || !tok.id_token) throw new Error(`token: ${tok.error ?? tokenRes.status} ${tok.error_description ?? ""}`);
    // Google checks the token's signature for us; we check it was issued for this app.
    const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tok.id_token)}`, { signal: AbortSignal.timeout(10_000) });
    const info = (await infoRes.json()) as { aud?: string; sub?: string; email?: string; email_verified?: string; name?: string; picture?: string; iss?: string };
    if (!infoRes.ok || info.aud !== c.env.GOOGLE_CLIENT_ID || !info.sub) throw new Error("tokeninfo: audience mismatch");
    if (!["https://accounts.google.com", "accounts.google.com"].includes(info.iss ?? "")) throw new Error("tokeninfo: issuer");
    return await finishLogin(
      c,
      { sub: info.sub, email: info.email_verified === "true" ? (info.email ?? null) : null, name: info.name ?? null, picture: info.picture ?? null },
      next,
    );
  } catch (err) {
    await logError(c.env.DB, "google-login", err, "");
    return c.redirect(`${safeNext(next)}?login=failed`);
  }
});

// ---------- POST /api/auth/logout ----------
auth.post("/auth/logout", async (c) => {
  await deleteSession(c.env.DB, getCookie(c, SESSION_COOKIE));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// ---------- GET /api/me ----------
auth.get("/me", async (c) => {
  const u = c.get("user");
  const profile = await readProfile(c.env.DB, c.get("deviceId"));
  const me: Me = {
    user: u ? { id: u.id, name: u.name, email: u.email, avatar: u.avatar_url } : null,
    profile,
    canLogin: canLogin(c.env),
    contact: c.env.CONTACT_EMAIL && !c.env.CONTACT_EMAIL.startsWith("[") ? c.env.CONTACT_EMAIL : null,
  };
  c.header("cache-control", "private, no-store");
  return c.json(me);
});

// ---------- PUT /api/me/profile ----------
auth.put("/me/profile", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const profile = await writeProfile(c.env.DB, c.get("deviceId"), body);
  return c.json({ profile });
});
