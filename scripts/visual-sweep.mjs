#!/usr/bin/env node
/**
 * Visual sweep: opens every screen of the app (mock mode) at phone, tablet and desktop widths,
 * screenshots them into visual/<name>-<width>.png and fails when a page scrolls sideways or an
 * element spills out of the viewport. Run with the dev server up (`npm run dev`, port 5179):
 *   npm run visual
 * Needs Playwright's Chromium; set PW_CHROMIUM to its path (default: /opt/pw-browsers/chromium).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
const base = process.env.VISUAL_BASE ?? "http://localhost:5179"; const out = process.argv[2] ?? "visual"; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--proxy-server=direct://"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const req = ctx.request;
// seed: a multi reel, a single reel, a pick reel, saves, a trip, a share, and login
const post = (u, data) => req.post(base + u, { data }).then((r) => r.json());
const multi = (await post("/api/checks", { input: "https://www.tiktok.com/@italy.gems/video/7301234567890000102" })).id;
const single = (await post("/api/checks", { input: "https://www.youtube.com/shorts/dQw4w9WgXcQ" })).id;
const pick = (await post("/api/checks", { input: "https://www.tiktok.com/@alpine.lake/video/7301234567890000103" })).id;
const vibe = (await post("/api/checks", { input: "https://www.instagram.com/reel/DcadgbRsmc6X/" })).id;
for (let i = 0; i < 10; i++) { const s = await Promise.all([multi, single, pick, vibe].map((id) => req.get(`${base}/api/checks/${id}`).then((r) => r.json()))); if (s.every((x) => x.status === "ready" || x.status === "failed")) break; await new Promise((r) => setTimeout(r, 1500)); }
for (const [n, c, la, lo] of [["Atrani", "Italy", 40.63, 14.61], ["Positano", "Italy", 40.63, 14.48], ["Ravello", "Italy", 40.65, 14.61]]) await post("/api/saves", { name: n, country: c, lat: la, lng: lo, vibe: ["coastal villages"], placeKey: n.toLowerCase() });
const saves = (await req.get(base + "/api/saves").then((r) => r.json())).items;
const trip = (await post("/api/trips", { mood: "friends", placeIds: saves.slice(0, 3).map((s) => s.id) })).trip;
const token = (await post("/api/share", { kind: "trip", id: trip.id })).token;
await req.get(base + "/api/auth/google/start?next=/", { maxRedirects: 3 });
await req.patch(base + `/api/trips/${trip.id}`, { data: { status: "saved", startDate: "2027-05-14", origin: "Amsterdam", travelers: 3 } });
const pages = [
  ["welcome", "/welcome"], ["welcome-vibes", "/welcome?step=1"], ["home", "/"], ["check-multi", `/check/${multi}`], ["check-single", `/check/${single}`], ["check-pick", `/check/${pick}`], ["check-vibe", `/check/${vibe}`],
  ["place", `/check/${multi}/place?name=Atrani`], ["where", `/check/${single}/where`], ["explore", "/explore"], ["reel", `/explore/reel/${multi}`], ["saved", "/saved"], ["plan", "/plan"], ["trips", "/trips"], ["trip", `/trips/${trip.id}`], ["book", `/trips/${trip.id}/book`], ["shared", `/s/${token}`], ["me", "/me"], ["set-password", "/me/password"], ["privacy", "/privacy"], ["status", "/status"], ["404", "/nope"],
  // the in-progress "Checking your reel" screen: the status call is answered as still analysing
  ["checking", `/check/${single}?visual=analyzing`],
];
const analyzing = JSON.stringify({ id: single, status: "analyzing", video: { platform: "youtube", url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", title: "Santorini sunset from Oia castle", author: "@sunset.lena", thumbnailUrl: null } });
const widths = [390, 768, 1280];
const report = [];
for (const w of widths) {
  const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: w < 500 ? 844 : 900 });
  await p.addInitScript(() => localStorage.setItem("tz_onboarded", "1"));
  await p.route(`**/api/checks/${single}`, (route) => (p.url().includes("visual=analyzing") ? route.fulfill({ status: 200, contentType: "application/json", body: analyzing }) : route.continue()));
  for (const [name, url] of pages) {
    try {
      await p.goto(base + url, { waitUntil: "networkidle", timeout: 20000 }); await p.waitForTimeout(1800);
      const m = await p.evaluate(() => {
        const vw = document.documentElement.clientWidth; const sw = document.documentElement.scrollWidth;
        const spill = []; const over = [];
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
          const cs = getComputedStyle(el); if (cs.position === "fixed" || cs.visibility === "hidden") continue;
          // is it inside a horizontal scroller? then spilling is fine
          let anc = el.parentElement, scroller = false; while (anc) { const s = getComputedStyle(anc); if (/(auto|scroll)/.test(s.overflowX)) { scroller = true; break; } anc = anc.parentElement; }
          if (!scroller && (r.right > vw + 1 || r.left < -1)) spill.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}@${Math.round(r.left)}-${Math.round(r.right)}`);
          if (el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 2 && cs.overflow === "visible" && cs.whiteSpace !== "nowrap") over.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}: "${el.textContent.trim().slice(0, 30)}"`);
        }
        return { hscroll: sw > vw + 1 ? sw - vw : 0, spill: [...new Set(spill)].slice(0, 6), over: [...new Set(over)].slice(0, 6) };
      });
      await p.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: false });
      if (m.hscroll || m.spill.length || m.over.length) report.push({ name, w, ...m });
    } catch (e) { report.push({ name, w, error: String(e.message).split("\n")[0] }); }
  }
  await p.close();
}
await b.close();
if (report.length) { console.log("LAYOUT ISSUES", JSON.stringify(report, null, 1)); process.exit(1); }
console.log(`ok: ${pages.length} pages × ${widths.length} widths, no sideways scroll or spill; screenshots in ${out}/`);
