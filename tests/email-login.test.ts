// Log in with email (design 23–23c) and the password in You (16a): the rules, and the whole flow through the API
// on the real migrations (node:sqlite).
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../worker/index";
import { upsertGoogleUser } from "../worker/lib/auth";
import { hashPassword, newCode, verifyPassword } from "../worker/lib/email-login";
import { loginCodeEmail } from "../worker/lib/email";
import { looksLikeEmail, passwordOk, passwordRules, suggestEmail } from "../shared/login";
import { fakeD1 } from "./regressions/P4__fake-d1";
import { fakeCtx } from "./regressions/P1__fakeD1";

type Env = Parameters<typeof app.request>[2];

function client(vars: Record<string, string> = { MOCK_AI: "1" }) {
  const db = fakeD1();
  const env = { DB: db, DAILY_LIMIT: "10", ...vars } as unknown as Env;
  let cookies = "tz_device=dev0dev0dev0dev0dev0dev0";
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(
      path,
      { method, headers: { "content-type": "application/json", cookie: cookies, "cf-connecting-ip": "203.0.113.7" }, body: body === undefined ? undefined : JSON.stringify(body) },
      env,
      fakeCtx(),
    );
    const session = /tz_session=([a-f0-9]{64})/.exec(res.headers.get("set-cookie") ?? "");
    if (session) cookies = `${cookies.replace(/; tz_session=[a-f0-9]+/, "")}; tz_session=${session[1]}`;
    return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, any> };
  };
  return { db, call, loggedIn: () => cookies.includes("tz_session=") };
}

afterEach(() => vi.unstubAllGlobals());

describe("email log-in rules", () => {
  it("checks the shape of an address", () => {
    expect(looksLikeEmail("emma@example.com")).toBe(true);
    expect(looksLikeEmail("emma@example")).toBe(false);
    expect(looksLikeEmail("emma example.com")).toBe(false);
    expect(looksLikeEmail("@example.com")).toBe(false);
  });

  it("suggests the mailbox someone probably meant (23b), and leaves real domains alone", () => {
    expect(suggestEmail("emma@gmial.com")).toBe("emma@gmail.com");
    expect(suggestEmail("Emma@Gmail.con")).toBe("emma@gmail.com");
    expect(suggestEmail("jan@hotmial.com")).toBe("jan@hotmail.com");
    expect(suggestEmail("emma@gmail.com")).toBeNull();
    expect(suggestEmail("lars@hotmail.be")).toBeNull(); // another country's Hotmail is real
    expect(suggestEmail("ceo@acme-travel.eu")).toBeNull();
    expect(suggestEmail("emma@gmai")).toBeNull(); // still typing
  });

  it("asks for 8+ characters and not an easy or personal password (16a)", () => {
    expect(passwordRules("short", "emma@example.com")).toEqual({ long: false, notEasy: true });
    expect(passwordRules("12345678", null)).toEqual({ long: true, notEasy: false });
    expect(passwordRules("aaaaaaaaaa", null).notEasy).toBe(false);
    expect(passwordRules("Password1", null).notEasy).toBe(false);
    expect(passwordRules("emma2026!", "emma@example.com").notEasy).toBe(false);
    expect(passwordOk("sunset-oia-27", "emma@example.com")).toBe(true);
  });

  it("makes 6-digit codes and keeps passwords only as salted hashes", async () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^\d{6}$/);
    const a = await hashPassword("sunset-oia-27");
    const b = await hashPassword("sunset-oia-27");
    expect(a).not.toContain("sunset");
    expect(a).not.toBe(b); // a fresh salt each time
    expect(await verifyPassword("sunset-oia-27", a)).toBe(true);
    expect(await verifyPassword("sunset-oia-28", a)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
  });

  it("puts the code first in the email subject (23d)", () => {
    const m = loginCodeEmail("482913");
    expect(m.subject).toBe("482913 is your TrailZ code");
    expect(m.text).toContain("482913");
    expect(m.html).toContain("482913");
  });
});

describe("POST /api/auth/email/*", () => {
  it("emails a code, rejects a wrong one with tries left, then logs in and creates the account", async () => {
    const { db, call, loggedIn } = client();
    const start = await call("POST", "/api/auth/email/start", { email: "  Emma@Example.com " });
    expect(start.status).toBe(200);
    expect(start.body.devCode).toMatch(/^\d{6}$/); // local test mode only
    const code = start.body.devCode as string;
    const wrong = code === "000000" ? "111111" : "000000";

    const bad = await call("POST", "/api/auth/email/verify", { email: "emma@example.com", code: wrong });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ error: "code_wrong", message: "That code doesn't match. 4 tries left." });

    const ok = await call("POST", "/api/auth/email/verify", { email: "emma@example.com", code });
    expect(ok.status).toBe(200);
    expect(loggedIn()).toBe(true);
    const me = await call("GET", "/api/me");
    expect(me.body.user).toMatchObject({ email: "emma@example.com", hasPassword: false });
    expect(me.body.canEmail).toBe(true);

    // One use only.
    const again = await call("POST", "/api/auth/email/verify", { email: "emma@example.com", code });
    expect(again.body.error).toBe("code_expired");
    // Only a hash of the code was ever stored.
    const rows = await db.prepare("SELECT * FROM login_codes").all();
    expect(JSON.stringify(rows.results)).not.toContain(code);
  });

  it("kills a code after 5 wrong tries", async () => {
    const { call } = client();
    const code = (await call("POST", "/api/auth/email/start", { email: "a@b.co" })).body.devCode as string;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) expect((await call("POST", "/api/auth/email/verify", { email: "a@b.co", code: wrong })).body.error).toBe("code_wrong");
    expect((await call("POST", "/api/auth/email/verify", { email: "a@b.co", code: wrong })).body.error).toBe("code_expired");
    expect((await call("POST", "/api/auth/email/verify", { email: "a@b.co", code })).body.error).toBe("code_expired");
  });

  it("waits 60 s between codes and allows 5 an hour per address", async () => {
    const { db, call } = client();
    expect((await call("POST", "/api/auth/email/start", { email: "a@b.co" })).status).toBe(200);
    const soon = await call("POST", "/api/auth/email/start", { email: "a@b.co" });
    expect(soon.status).toBe(429);
    expect(soon.body.message).toMatch(/new one in \d+ seconds/);
    for (let i = 0; i < 4; i++) {
      await db.prepare("UPDATE login_codes SET sent_at = sent_at - 61000").run();
      expect((await call("POST", "/api/auth/email/start", { email: "a@b.co" })).status).toBe(200);
    }
    await db.prepare("UPDATE login_codes SET sent_at = sent_at - 61000").run();
    const sixth = await call("POST", "/api/auth/email/start", { email: "a@b.co" });
    expect(sixth.status).toBe(429);
    expect(sixth.body.message).toMatch(/5 codes in the last hour/);
  });

  it("rejects a malformed address and answers 503 when email isn't set up (no test mode in production)", async () => {
    const dev = client();
    expect((await dev.call("POST", "/api/auth/email/start", { email: "nope" })).body.error).toBe("bad_email");
    const prod = client({ MOCK_AI: "0" });
    const res = await prod.call("POST", "/api/auth/email/start", { email: "a@b.co" });
    expect(res.status).toBe(503);
    expect((await prod.call("GET", "/api/me")).body.canEmail).toBe(false);
  });

  it("sends through Resend when configured, and never returns the code", async () => {
    const sent: { url: string; body: any }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    });
    const { call } = client({ MOCK_AI: "1", RESEND_API_KEY: "re_test", EMAIL_FROM: "TrailZ <login@trailz.test>" });
    const res = await call("POST", "/api/auth/email/start", { email: "emma@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.devCode).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://api.resend.com/emails");
    expect(sent[0].body).toMatchObject({ from: "TrailZ <login@trailz.test>", to: ["emma@example.com"] });
    expect(sent[0].body.subject).toMatch(/^\d{6} is your TrailZ code$/);
  });

  it("joins an email account and a Google log-in on the same address into one account", async () => {
    const { db, call } = client();
    const code = (await call("POST", "/api/auth/email/start", { email: "emma@example.com" })).body.devCode as string;
    await call("POST", "/api/auth/email/verify", { email: "emma@example.com", code });
    const before = await db.prepare("SELECT id FROM users").all<{ id: string }>();
    const g = await upsertGoogleUser(db, { sub: "g-123", email: "Emma@Example.com", name: "Emma de Vries", picture: null });
    expect(g.id).toBe(before.results[0].id);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>())?.n).toBe(1);
  });
});

describe("password (16a, 23c)", () => {
  async function emailUser() {
    const c = client();
    const code = (await c.call("POST", "/api/auth/email/start", { email: "emma@example.com" })).body.devCode as string;
    await c.call("POST", "/api/auth/email/verify", { email: "emma@example.com", code });
    return c;
  }

  it("needs a log-in, refuses a weak one, then logs in with it", async () => {
    expect((await client().call("POST", "/api/me/password", { password: "sunset-oia-27" })).status).toBe(401);
    const { db, call } = await emailUser();
    expect((await call("POST", "/api/me/password", { password: "12345678" })).body.error).toBe("password_weak");
    expect((await call("POST", "/api/me/password", { password: "sunset-oia-27" })).status).toBe(200);
    expect((await call("GET", "/api/me")).body.user.hasPassword).toBe(true);
    const stored = await db.prepare("SELECT password_hash FROM users").first<{ password_hash: string }>();
    expect(stored?.password_hash).toMatch(/^pbkdf2-sha256\$100000\$/);

    // Changing it asks for the current one.
    expect((await call("POST", "/api/me/password", { password: "new-trail-2027" })).body.error).toBe("password_wrong");
    expect((await call("POST", "/api/me/password", { password: "new-trail-2027", current: "sunset-oia-27" })).status).toBe(200);
  });

  it("logs in with email + password on another phone; a wrong one gets the same answer as an unknown email", async () => {
    const first = await emailUser();
    await first.call("POST", "/api/me/password", { password: "sunset-oia-27" });
    // Same database, a phone without a session.
    const env = { DB: first.db, MOCK_AI: "1" } as unknown as Env;
    const post = (body: unknown) =>
      app.request("/api/auth/password/login", { method: "POST", headers: { "content-type": "application/json", cookie: "tz_device=phone2phone2phone2" }, body: JSON.stringify(body) }, env, fakeCtx());

    const wrong = await post({ email: "emma@example.com", password: "nope-nope-nope" });
    const unknown = await post({ email: "nobody@example.com", password: "nope-nope-nope" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());

    const ok = await post({ email: "Emma@Example.com", password: "sunset-oia-27" });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/tz_session=[a-f0-9]{64}/);
  });

  it("locks password log-in for 15 minutes after 10 wrong tries", async () => {
    const first = await emailUser();
    await first.call("POST", "/api/me/password", { password: "sunset-oia-27" });
    const env = { DB: first.db, MOCK_AI: "1" } as unknown as Env;
    const post = (password: string) =>
      app.request("/api/auth/password/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "emma@example.com", password }) }, env, fakeCtx());
    for (let i = 0; i < 10; i++) expect((await post("wrong-wrong-" + i)).status).toBe(401);
    const locked = await post("sunset-oia-27");
    expect(locked.status).toBe(429);
    expect(((await locked.json()) as { message: string }).message).toMatch(/Try again in 15 minutes/);
  });
});
