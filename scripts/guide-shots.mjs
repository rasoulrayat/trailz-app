#!/usr/bin/env node
/**
 * Screenshots for the user guide: the real app in mock mode, on a phone (390 × 844, 2×), walked like a new user.
 * Run with the dev server up (port 5179) and the local database migrated:
 *   node scripts/guide-shots.mjs guide
 * Photos come from Wikimedia, so run it where the internet is reachable (the guide-screens workflow does).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const base = process.env.GUIDE_BASE ?? "http://localhost:5179";
const out = process.argv[2] ?? "guide";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ["--proxy-server=direct://"] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: "Europe/Amsterdam", locale: "en-GB", isMobile: true, hasTouch: true };
const settle = (p, ms = 2500) => p.waitForLoadState("networkidle").catch(() => null).then(() => p.waitForTimeout(ms));
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` }).then(() => console.log("shot", name));

// ---------- 1. First run: intro, vibe, home city ----------
{
  const ctx = await b.newContext(phone);
  const p = await ctx.newPage();
  await p.goto(`${base}/welcome`);
  await settle(p, 3000);
  await shot(p, "01-intro");
  await p.click("text=Let's go");
  await settle(p, 1000);
  const tiles = await p.$$("button.vibe-tile");
  for (const i of [0, 2, 3]) await tiles[i].click();
  await settle(p, 2500);
  await shot(p, "02-vibe");
  await p.click("button.ob-cta");
  await settle(p, 2000);
  await shot(p, "03-home-city");
  await p.fill(".city-search input", "lisb");
  await settle(p, 600);
  await shot(p, "03b-home-city-search");
  await ctx.close();
}

// ---------- 2. Seed: four checked reels, three saves, a trip with dates, signed in ----------
const ctx = await b.newContext(phone);
await ctx.addInitScript(() => localStorage.setItem("tz_onboarded", "1"));
const req = ctx.request;
const post = (u, data) => req.post(base + u, { data }).then((r) => r.json());
const multi = (await post("/api/checks", { input: "https://www.tiktok.com/@italy.gems/video/7301234567890000102" })).id;
const single = (await post("/api/checks", { input: "https://www.youtube.com/shorts/dQw4w9WgXcQ" })).id;
const pick = (await post("/api/checks", { input: "https://www.tiktok.com/@alpine.lake/video/7301234567890000103" })).id;
const vibe = (await post("/api/checks", { input: "https://www.instagram.com/reel/DcadgbRsmc6X/" })).id;
for (let i = 0; i < 15; i++) {
  const s = await Promise.all([multi, single, pick, vibe].map((id) => req.get(`${base}/api/checks/${id}`).then((r) => r.json())));
  if (s.every((x) => x.status === "ready" || x.status === "failed")) break;
  await new Promise((r) => setTimeout(r, 1500));
}
await req.put(base + "/api/me/profile", { data: { vibes: ["beach", "villages", "food"], home: "Amsterdam, Netherlands", onboarded: true } });
for (const [n, c, la, lo] of [["Atrani", "Italy", 40.63, 14.61], ["Positano", "Italy", 40.63, 14.48], ["Ravello", "Italy", 40.65, 14.61]])
  await post("/api/saves", { name: n, country: c, lat: la, lng: lo, vibe: ["coastal villages", "sea views", "lemon groves"], placeKey: n.toLowerCase() });
const saves = (await req.get(base + "/api/saves").then((r) => r.json())).items;
const trip = (await post("/api/trips", { mood: "friends", placeIds: saves.slice(0, 3).map((s) => s.id) })).trip;
await req.get(base + "/api/auth/google/start?next=/", { maxRedirects: 3 });
await req.patch(base + `/api/trips/${trip.id}`, { data: { status: "saved", startDate: "2027-05-14", origin: "Amsterdam, Netherlands", travelers: 2 } });

const p = await ctx.newPage();
const analyzing = JSON.stringify({ id: single, status: "analyzing", video: { platform: "youtube", url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", title: "Santorini sunset from Oia castle", author: "@sunset.lena", thumbnailUrl: null } });
await p.route(`**/api/checks/${single}`, (route) => (p.url().includes("guide=analyzing") ? route.fulfill({ status: 200, contentType: "application/json", body: analyzing }) : route.continue()));

// ---------- 3. Check a reel ----------
await p.goto(`${base}/`);
await settle(p, 3000);
await p.fill("#reel", "https://www.tiktok.com/@sunset.lena/video/7341812345678901234");
await p.waitForTimeout(600);
await shot(p, "04-home");

await p.goto(`${base}/check/${single}?guide=analyzing`);
await settle(p, 4000);
await shot(p, "05-checking");

await p.goto(`${base}/check/${single}`);
await settle(p, 3500);
await shot(p, "06-reality-card");
await p.evaluate(() => window.scrollBy(0, 640));
await settle(p, 1200);
await shot(p, "07-reality-details");

await p.goto(`${base}/check/${multi}`);
await settle(p, 3500);
await shot(p, "07b-many-places");

// ---------- 4. Explore and your vibe ----------
await p.goto(`${base}/explore`);
await settle(p, 3500);
await shot(p, "08-explore");

await p.goto(`${base}/saved`);
await settle(p, 3000);
await shot(p, "09-vibe");

// ---------- 5. Plan and book ----------
await p.goto(`${base}/plan?ids=${saves.slice(0, 3).map((x) => x.id).join(",")}`);
await settle(p, 3000);
await shot(p, "10-plan");

await p.goto(`${base}/trips/${trip.id}`);
await settle(p, 3500);
await shot(p, "11-trip");

await p.goto(`${base}/trips/${trip.id}/book`);
await settle(p, 5000);
await shot(p, "12-book");

await p.goto(`${base}/trips`);
await settle(p, 2500);
await shot(p, "13-trips");

await b.close();
