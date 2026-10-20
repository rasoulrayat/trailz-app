// Which Tiqets links open a search for the activity (and keep a date)?
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
const out = "tiqets"; mkdirSync(out, { recursive: true });
const q = encodeURIComponent;
const C = {
  A_search_slash: `https://www.tiqets.com/en/search/?q=${q("Sagrada Familia Barcelona")}`,
  B_search: `https://www.tiqets.com/en/search?q=${q("Sagrada Familia Barcelona")}`,
  C_date: `https://www.tiqets.com/en/search/?q=${q("Alhambra Granada")}&date=2026-12-03`,
  D_start_date: `https://www.tiqets.com/en/search/?q=${q("Alhambra Granada")}&start_date=2026-12-03&end_date=2026-12-03`,
  E_from_to: `https://www.tiqets.com/en/search/?q=${q("Alhambra Granada")}&from=2026-12-03&to=2026-12-03`,
  F_place_only: `https://www.tiqets.com/en/search/?q=${q("Oia Santorini")}`,
  G_tracked_home: "https://www.tiqets.com/en/?partner=travelpayouts.com&tq_campaign=test-789861",
};
const b = await chromium.launch();
const report = {};
for (const [name, url] of Object.entries(C)) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "en-GB", timezoneId: "Europe/Amsterdam" });
  const p = await ctx.newPage();
  try {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await p.waitForTimeout(3000);
    const consent = await p.$('button:has-text("Accept"), button:has-text("Agree"), #onetrust-accept-btn-handler');
    if (consent) { await consent.click().catch(() => null); await p.waitForTimeout(1500); }
    await p.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => null);
    await p.waitForTimeout(1500);
    const info = await p.evaluate(() => {
      const text = document.body.innerText.replace(/\s+/g, " ");
      const products = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /-p\d+\/?/.test(h)).slice(0, 5);
      const dates = (text.match(/\b\d{1,2}\s(Dec|December)\b|\bDec(ember)?\s\d{1,2}\b/g) || []).slice(0, 4);
      const inputs = [...document.querySelectorAll("input")].map((i) => `${i.name || i.getAttribute("aria-label") || i.placeholder}: ${i.value}`).slice(0, 6);
      return { title: document.title, products, dates, inputs, head: text.slice(0, 300), cookies: document.cookie.slice(0, 200) };
    });
    report[name] = { url, final: p.url(), ...info };
    await p.screenshot({ path: `${out}/${name}.png` });
  } catch (e) { report[name] = { url, error: String(e.message).split("\n")[0] }; }
  await ctx.close();
}
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
await b.close();
