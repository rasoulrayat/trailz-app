import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
const out = "viator"; mkdirSync(out, { recursive: true });
const q = encodeURIComponent;
const C = {
  search: `https://www.viator.com/searchResults/all?text=${q("Picnic Barceloneta beach Barcelona")}&pid=P00327013&mcid=42383&medium=link`,
  search_simple: `https://www.viator.com/searchResults/all?text=${q("Flamenco Granada")}&pid=P00327013&mcid=42383&medium=link`,
  search_dates: `https://www.viator.com/searchResults/all?text=${q("Flamenco Granada")}&startDate=2026-11-17&endDate=2026-11-17&pid=P00327013&mcid=42383&medium=link`,
};
const b = await chromium.launch();
const report = {};
for (const [name, url] of Object.entries(C)) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "en-GB", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  const p = await ctx.newPage();
  try {
    const res = await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await p.waitForTimeout(5000);
    const info = await p.evaluate(() => ({ title: document.title, head: document.body.innerText.replace(/\s+/g, " ").slice(0, 400), products: [...document.querySelectorAll("a[href*='/tours/']")].slice(0, 4).map((a) => a.getAttribute("href")) }));
    report[name] = { url, status: res?.status(), final: p.url(), ...info };
    await p.screenshot({ path: `${out}/${name}.png` });
  } catch (e) { report[name] = { url, error: String(e.message).split("\n")[0] }; }
  await ctx.close();
}
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
await b.close();
