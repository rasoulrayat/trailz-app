// Which Google Hotels links open with the dates and guests filled in? Opens each candidate, reports what the page shows.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
const out = "probe"; mkdirSync(out, { recursive: true });
const enc = encodeURIComponent;
const hotel = "Hotel Avenida Palace, Lisbon, Portugal";
const C = {
  A_nl_hotel: `https://www.google.com/travel/hotels?q=${enc(`${hotel} from 12 November 2026 to 15 November 2026 for 2 adults`)}&hl=en&gl=nl&curr=EUR`,
  B_checkin_params: `https://www.google.com/travel/search?q=${enc(hotel)}&checkin=2026-11-12&checkout=2026-11-15&adults=2&hl=en&gl=nl&curr=EUR`,
  C_current_city: `https://www.google.com/travel/hotels/${enc("Lisbon, Portugal")}?q=${enc("Lisbon, Portugal")}&dates=2026-11-12,2026-11-15&adults=2&curr=EUR`,
  D_dates_param_hotel: `https://www.google.com/travel/hotels?q=${enc(hotel)}&dates=2026-11-12,2026-11-15&adults=2&hl=en&gl=nl&curr=EUR`,
  E_nl_city: `https://www.google.com/travel/hotels?q=${enc("hotels in Lisbon from 12 November 2026 to 15 November 2026 for 2 adults")}&hl=en&gl=nl&curr=EUR`,
  F_nl_search: `https://www.google.com/travel/search?q=${enc(`${hotel} 12 Nov 2026 - 15 Nov 2026 2 adults`)}&hl=en&gl=nl&curr=EUR`,
  G_entity_serpapi_token: `https://www.google.com/travel/hotels/entity/ChoQ5YiTp-rKmO60ARoNL2cvMTFzc2djMTNqcRAC?hl=en&gl=nl&curr=EUR`,
  H_entity_apify: `https://www.google.com/travel/hotels/entity/ChkIhLCQwvjO2IYWGg0vZy8xMXE0bTZieDkyEAE?hl=en&gl=nl&curr=EUR`,
  I_entity_token_q: `https://www.google.com/travel/hotels/entity/ChoQ5YiTp-rKmO60ARoNL2cvMTFzc2djMTNqcRAC?q=${enc("Le Sabot Ubud 12 Nov 2026 to 15 Nov 2026 2 adults")}&hl=en&gl=nl&curr=EUR`,
};
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "en-GB", timezoneId: "Europe/Amsterdam" });
const report = {};
for (const [name, url] of Object.entries(C)) {
  const p = await ctx.newPage();
  try {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await p.waitForTimeout(2500);
    const consent = await p.$('button:has-text("Accept all"), button:has-text("Reject all")');
    if (consent) { await consent.click(); await p.waitForTimeout(2500); }
    await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => null);
    await p.waitForTimeout(2000);
    const info = await p.evaluate(() => {
      const inputs = [...document.querySelectorAll("input")].map((i) => `${i.getAttribute("aria-label") || i.placeholder || i.name}: ${i.value}`).filter((x) => x.trim() !== ":").slice(0, 12);
      const text = document.body.innerText.replace(/\s+/g, " ");
      const guests = (text.match(/\b\d+\s+(adults?|guests?|travell?ers?)\b/gi) || []).slice(0, 4);
      const dates = (text.match(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+\d{1,2}\s+[A-Z][a-z]{2}|\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+[A-Z][a-z]{2}\s+\d{1,2}/g) || []).slice(0, 6);
      return { title: document.title, inputs, guests, dates, h1: [...document.querySelectorAll("h1,h2")].slice(0, 4).map((h) => h.innerText.trim()).filter(Boolean), head: text.slice(0, 400) };
    });
    report[name] = { url, final: p.url(), ...info };
    await p.screenshot({ path: `${out}/${name}.png` });
  } catch (e) { report[name] = { url, error: String(e.message).split("\n")[0] }; }
  await p.close();
}
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1).slice(0, 4000));
await b.close();
