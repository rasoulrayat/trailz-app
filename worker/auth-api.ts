import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { ApiError, Me } from "../shared/types";
import { CODE_MAX_TRIES, CODE_TTL_MS, CODES_PER_HOUR, RESEND_AFTER_S, looksLikeEmail, normalizeEmail, passwordOk } from "../shared/login";
import { isMock, type Env } from "./env";
import {
  createSession,
  deleteSession,
  findOrCreateEmailUser,
  mergeDeviceIntoUser,
  randomToken,
  readProfile,
  safeNext,
  upsertGoogleUser,
  writeProfile,
  type GoogleIdentity,
  type UserRow,
} from "./lib/auth";
import { sendLoginCode } from "./lib/email";
import { hashCode, hashPassword, minutesUntil, newCode, verifyPassword } from "./lib/email-login";
import { logError } from "./lib/store";
import { recordOp } from "./lib/ops";

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
  if (!code || !state || c.req.query("state") !== state) {
    // Google's own error (access_denied: not a test user, or the person said no) arrives here as ?error=…
    await recordOp(c.env.DB, "auth.google", "fail", { detail: c.req.query("error") ? `Google: ${c.req.query("error")}` : "missing or mismatched state" });
    return c.redirect(`${safeNext(next)}?login=failed`);
  }
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
    await recordOp(c.env.DB, "auth.google", "ok");
    return await finishLogin(
      c,
      { sub: info.sub, email: info.email_verified === "true" ? (info.email ?? null) : null, name: info.name ?? null, picture: info.picture ?? null },
      next,
    );
  } catch (err) {
    await logError(c.env.DB, "google-login", err, "");
    await recordOp(c.env.DB, "auth.google", "fail", { detail: err });
    return c.redirect(`${safeNext(next)}?login=failed`);
  }
});

// ======================= Log in with email (design 23–23c, 16a) =======================

/** Local/dev only: no email is sent and the code comes back in the answer (MOCK_AI=1 and no Resend key). */
const emailDevMode = (env: Env) => env.MOCK_AI === "1" && !env.RESEND_API_KEY;
const canEmail = (env: Env) => emailDevMode(env) || !!(env.RESEND_API_KEY && env.EMAIL_FROM);

const IP_CODES_PER_HOUR = 20;
const PASSWORD_MAX_FAILS = 10;
const PASSWORD_LOCK_MS = 15 * 60_000;

type AuthStatus = 400 | 401 | 429 | 503;
const authFail = (c: Context<AppEnv>, status: AuthStatus, error: ApiError["error"], message: string) => c.json<ApiError>({ error, message }, status);

async function readJson(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  const body = await c.req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Same session as Google: this device's guest data moves into the account, then the cookie. */
async function startSession(c: Context<AppEnv>, user: UserRow) {
  await mergeDeviceIntoUser(c.env.DB, c.get("rawDeviceId"), user.id);
  const { token, maxAge } = await createSession(c.env.DB, user.id);
  setCookie(c, SESSION_COOKIE, token, { path: "/", httpOnly: true, secure: true, sameSite: "Lax", maxAge });
  return c.json({ ok: true as const });
}

// ---------- POST /api/auth/email/start {email} : email a 6-digit code ----------
// Answers the same whether or not the address has an account (nobody can probe who uses TrailZ).
auth.post("/auth/email/start", async (c) => {
  const env = c.env;
  if (!canEmail(env)) return authFail(c, 503, "busy", "Log in with email isn't set up yet. Use Google for now.");
  const email = normalizeEmail(str((await readJson(c)).email));
  if (!looksLikeEmail(email)) return authFail(c, 400, "bad_email", "That doesn't look like an email address. Check for typos.");

  const db = env.DB;
  const now = Date.now();
  const ip = c.req.header("cf-connecting-ip") ?? "";
  const live = await db.prepare("SELECT sent_at FROM login_codes WHERE email_norm = ?").bind(email).first<{ sent_at: number }>();
  if (live && now - live.sent_at < RESEND_AFTER_S * 1000) {
    const wait = Math.ceil((RESEND_AFTER_S * 1000 - (now - live.sent_at)) / 1000);
    return authFail(c, 429, "too_many", `We just sent a code. You can ask for a new one in ${wait} seconds.`);
  }
  const hourAgo = now - 3600_000;
  const byEmail = await db
    .prepare("SELECT COUNT(*) AS n, MIN(sent_at) AS first FROM login_sends WHERE email_norm = ? AND sent_at > ?")
    .bind(email, hourAgo)
    .first<{ n: number; first: number | null }>();
  if ((byEmail?.n ?? 0) >= CODES_PER_HOUR) {
    const m = minutesUntil((byEmail?.first ?? now) + 3600_000, now);
    return authFail(c, 429, "too_many", `You've asked for ${CODES_PER_HOUR} codes in the last hour. Try again in ${m} minute${m === 1 ? "" : "s"}, or use Google.`);
  }
  if (ip) {
    const byIp = await db.prepare("SELECT COUNT(*) AS n FROM login_sends WHERE ip = ? AND sent_at > ?").bind(ip, hourAgo).first<{ n: number }>();
    if ((byIp?.n ?? 0) >= IP_CODES_PER_HOUR) return authFail(c, 429, "too_many", "Too many codes from this network. Try again in an hour, or use Google.");
  }

  const code = newCode();
  await db.batch([
    db
      .prepare(
        "INSERT INTO login_codes (email_norm, code_hash, expires_at, tries, sent_at) VALUES (?, ?, ?, 0, ?) " +
          "ON CONFLICT (email_norm) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0, sent_at = excluded.sent_at",
      )
      .bind(email, await hashCode(email, code), now + CODE_TTL_MS, now),
    db.prepare("INSERT INTO login_sends (email_norm, ip, sent_at) VALUES (?, ?, ?)").bind(email, ip, now),
    db.prepare("DELETE FROM login_sends WHERE sent_at < ?").bind(now - 86400_000),
    db.prepare("DELETE FROM login_codes WHERE expires_at < ?").bind(now - 86400_000),
  ]);

  if (emailDevMode(env)) return c.json({ ok: true as const, resendIn: RESEND_AFTER_S, devCode: code });
  const t0 = Date.now();
  try {
    await sendLoginCode(env, email, code);
    await recordOp(db, "auth.email-send", "ok", { ms: Date.now() - t0 });
  } catch (err) {
    await logError(db, "email-login-send", err, "");
    await recordOp(db, "auth.email-send", "fail", { ms: Date.now() - t0, detail: err });
    // The code was never delivered: let the person ask again right away.
    await db.prepare("DELETE FROM login_codes WHERE email_norm = ?").bind(email).run();
    return authFail(c, 503, "busy", "We couldn't send the email right now. Try again in a minute, or use Google.");
  }
  return c.json({ ok: true as const, resendIn: RESEND_AFTER_S });
});

// ---------- POST /api/auth/email/verify {email, code} : the code logs in (or creates the account) ----------
auth.post("/auth/email/verify", async (c) => {
  const body = await readJson(c);
  const email = normalizeEmail(str(body.email));
  const code = str(body.code).replace(/\D/g, "");
  if (!looksLikeEmail(email)) return authFail(c, 400, "bad_email", "That doesn't look like an email address.");
  if (code.length !== 6) return authFail(c, 400, "code_wrong", "Enter the 6 digits from the email.");

  const db = c.env.DB;
  const now = Date.now();
  const row = await db.prepare("SELECT code_hash, expires_at, tries FROM login_codes WHERE email_norm = ?").bind(email).first<{ code_hash: string; expires_at: number; tries: number }>();
  const dead = "This code no longer works. Codes last 15 minutes and 5 tries.";
  if (!row || row.expires_at < now || row.tries >= CODE_MAX_TRIES) return authFail(c, 400, "code_expired", dead);

  const hash = await hashCode(email, code);
  if (hash !== row.code_hash) {
    await db.prepare("UPDATE login_codes SET tries = tries + 1 WHERE email_norm = ?").bind(email).run();
    const left = CODE_MAX_TRIES - (row.tries + 1);
    if (left <= 0) return authFail(c, 400, "code_expired", "Too many wrong tries, so this code no longer works.");
    return authFail(c, 400, "code_wrong", `That code doesn't match. ${left} ${left === 1 ? "try" : "tries"} left.`);
  }
  // One use only: whoever deletes the row first gets in.
  const used = await db.prepare("DELETE FROM login_codes WHERE email_norm = ? AND code_hash = ?").bind(email, hash).run();
  if (!used.meta.changes) return authFail(c, 400, "code_expired", dead);

  const user = await findOrCreateEmailUser(db, email);
  await recordOp(db, "auth.email", "ok");
  return startSession(c, user);
});

// ---------- POST /api/auth/password/login {email, password} ----------
auth.post("/auth/password/login", async (c) => {
  const body = await readJson(c);
  const email = normalizeEmail(str(body.email));
  const password = str(body.password);
  const wrong = "Wrong email or password.";
  if (!looksLikeEmail(email) || !password) return authFail(c, 401, "password_wrong", wrong);

  const db = c.env.DB;
  const now = Date.now();
  const row = await db
    .prepare("SELECT id, password_hash, password_fails, password_locked_until FROM users WHERE email_norm = ? ORDER BY created_at LIMIT 1")
    .bind(email)
    .first<{ id: string; password_hash: string | null; password_fails: number; password_locked_until: number | null }>();
  if (row?.password_locked_until && row.password_locked_until > now) {
    const m = minutesUntil(row.password_locked_until, now);
    return authFail(c, 429, "password_locked", `Too many wrong tries. Try again in ${m} minute${m === 1 ? "" : "s"}, or email yourself a code.`);
  }
  const ok = await verifyPassword(password, row?.password_hash);
  if (!row || !ok) {
    if (row?.password_hash) {
      const fails = row.password_fails + 1;
      await db
        .prepare("UPDATE users SET password_fails = ?, password_locked_until = ? WHERE id = ?")
        .bind(fails >= PASSWORD_MAX_FAILS ? 0 : fails, fails >= PASSWORD_MAX_FAILS ? now + PASSWORD_LOCK_MS : null, row.id)
        .run();
    }
    await recordOp(db, "auth.password", "fail", { detail: row?.password_hash ? "wrong password" : "no password for that email" });
    return authFail(c, 401, "password_wrong", wrong);
  }
  await db.prepare("UPDATE users SET password_fails = 0, password_locked_until = NULL, last_login_at = ? WHERE id = ?").bind(now, row.id).run();
  await recordOp(db, "auth.password", "ok");
  return startSession(c, { id: row.id, google_sub: null, email, name: null, avatar_url: null });
});

// ---------- POST /api/me/password {password, current?} : set or change the password (16a) ----------
auth.post("/me/password", async (c) => {
  const u = c.get("user");
  if (!u) return authFail(c, 401, "login_required", "Log in first.");
  if (!u.email) return authFail(c, 400, "no_email", "Your account has no email address, so a password can't be used with it.");
  const body = await readJson(c);
  const password = str(body.password);
  const db = c.env.DB;
  const row = await db.prepare("SELECT password_hash FROM users WHERE id = ?").bind(u.id).first<{ password_hash: string | null }>();
  if (row?.password_hash && !(await verifyPassword(str(body.current), row.password_hash))) {
    return authFail(c, 400, "password_wrong", "Your current password isn't right.");
  }
  if (!passwordOk(password, u.email)) {
    return authFail(c, 400, "password_weak", "Use 8 characters or more, and not your email or an easy one like 12345678.");
  }
  await db
    .prepare("UPDATE users SET password_hash = ?, password_fails = 0, password_locked_until = NULL, email_norm = COALESCE(email_norm, ?) WHERE id = ?")
    .bind(await hashPassword(password), normalizeEmail(u.email), u.id)
    .run();
  return c.json({ ok: true as const });
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
    user: u ? { id: u.id, name: u.name, email: u.email, avatar: u.avatar_url, hasPassword: !!u.has_password } : null,
    profile,
    canLogin: canLogin(c.env),
    canEmail: canEmail(c.env),
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
