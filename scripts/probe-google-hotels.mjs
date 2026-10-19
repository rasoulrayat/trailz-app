// Round 4: change the number of travelers in Google's own UI and read how the address bar encodes it.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
const out = "probe4"; mkdirSync(out, { recursive: true });
const url = "https://www.google.com/travel/hotels/entity/ChkIhLCQwvjO2IYWGg0vZy8xMXE0bTZieDkyEAE?hl=en&gl=nl&curr=EUR&ts=CAEaIAoCGgASGhIUCgcI6g8QDBgDEgcI6g8QDBgGGAMyAggCKgkKBToDRVVSGgA";
const b = await chromium.launch();
const report = {};
for (const [name, clicks] of [["adults3", ["Add adult"]], ["adults4", ["Add adult", "Add adult"]], ["adults1", ["Remove adult"]], ["adults2_child1", ["Add child"]]]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-GB", timezoneId: "Europe/Amsterdam" });
  const p = await ctx.newPage();
  const urls = [];
  p.on("framenavigated", (f) => { if (f === p.mainFrame()) urls.push(f.url()); });
  try {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => null);
    await p.waitForTimeout(2500);
    await p.locator('[aria-label^="Number of travelers"]').first().click();
    await p.waitForTimeout(800);
    for (const c of clicks) { await p.locator(`[aria-label="${c}"]`).first().click(); await p.waitForTimeout(500); }
    if (name === "adults2_child1") { const sel = p.locator("select").first(); if (await sel.count()) await sel.selectOption({ index: 5 }).catch(() => null); await p.waitForTimeout(400); }
    const done = p.locator('button:has-text("Done")').first();
    if (await done.count()) await done.click();
    await p.waitForTimeout(3500);
    const label = await p.locator('[aria-label^="Number of travelers"]').first().getAttribute("aria-label").catch(() => null);
    report[name] = { final: p.url(), label, history: urls.slice(-3), href: await p.evaluate(() => location.href) };
    await p.screenshot({ path: `${out}/${name}.png` });
  } catch (e) { report[name] = { error: String(e.message).split("\n")[0], final: p.url() }; }
  await ctx.close();
}
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1).slice(0, 3000));
await b.close();
