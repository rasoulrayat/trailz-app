// Round 2: entity pages + a dates/guests "ts" we build ourselves, each in a fresh browser (no remembered dates).
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
const out = "probe2"; mkdirSync(out, { recursive: true });
const enc = encodeURIComponent;
const varint = (n) => { const b = []; while (n > 127) { b.push((n & 127) | 128); n = Math.floor(n / 128); } b.push(n); return b; };
const field = (no, bytes) => [(no << 3) | 2, ...varint(bytes.length), ...bytes];
const num = (no, n) => [(no << 3) | 0, ...varint(n)];
const date = (iso) => { const [y, m, d] = iso.split("-").map(Number); return [...num(1, y), ...num(2, m), ...num(3, d)]; };
const ts = (checkIn, checkOut, guests, currency = "EUR") => {
  const nights = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000);
  const stay = [...field(2, [...field(1, date(checkIn)), ...field(2, date(checkOut))]), ...num(3, nights), ...field(6, num(1, guests))];
  const msg = [...num(1, 1), ...field(3, [...field(1, field(3, [])), ...field(2, stay)]), ...field(5, [...field(1, field(7, [...Buffer.from(currency)])), ...field(3, [])])];
  return Buffer.from(msg).toString("base64url");
};
const E = (tok, extra = "") => `https://www.google.com/travel/hotels/entity/${tok}?hl=en&gl=nl&curr=EUR${extra}`;
const RITZ = "ChkIv_HyiNKHpf6yARoML2cvMXozdGJnZ3BzEAE", H10 = "ChgIjayklaXUgth3GgwvZy8xcHAydF9qdDEQAQ", BROWNS = "ChkIhLCQwvjO2IYWGg0vZy8xMXE0bTZieDkyEAE";
const C = {
  h10_plain: E(H10),
  h10_ts_g2: E(H10, `&ts=${ts("2026-12-03", "2026-12-06", 2)}`),
  h10_ts_g3: E(H10, `&ts=${ts("2026-12-03", "2026-12-06", 3)}`),
  ritz_ts_g4: E(RITZ, `&ts=${ts("2027-02-10", "2027-02-14", 4)}`),
  browns_ts_g3: E(BROWNS, `&ts=${ts("2026-12-03", "2026-12-06", 3)}`),
  browns_ts_g1: E(BROWNS, `&ts=${ts("2026-12-03", "2026-12-05", 1)}`),
  nl_city_g3: `https://www.google.com/travel/search?q=${enc("hotels in Lisbon 3 Dec 2026 - 6 Dec 2026 3 adults")}&hl=en&gl=nl&curr=EUR`,
  nl_hotel_g3: `https://www.google.com/travel/search?q=${enc("Brown's Avenue Hotel, Lisbon 3 Dec 2026 - 6 Dec 2026 3 adults")}&hl=en&gl=nl&curr=EUR`,
};
const b = await chromium.launch();
const report = {};
for (const [name, url] of Object.entries(C)) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "en-GB", timezoneId: "Europe/Amsterdam" });
  const p = await ctx.newPage();
  try {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await p.waitForTimeout(2500);
    const consent = await p.$('button:has-text("Accept all"), button:has-text("Reject all")');
    if (consent) { await consent.click(); await p.waitForTimeout(2500); }
    await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => null);
    await p.waitForTimeout(2500);
    const info = await p.evaluate(() => {
      const inputs = [...document.querySelectorAll("input")].map((i) => `${i.getAttribute("aria-label") || i.placeholder || i.name}: ${i.value}`).filter((x) => /check|guest|adult/i.test(x)).slice(0, 6);
      const guestBits = [...document.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label")).filter((l) => /guest|adult|traveler|traveller|child/i.test(l)).slice(0, 8);
      const text = document.body.innerText.replace(/\s+/g, " ");
      const prices = (text.match(/€\s?\d[\d,.]*/g) || []).slice(0, 6);
      return { title: document.title, inputs, guestBits, prices, head: text.slice(0, 260) };
    });
    report[name] = { url, final: p.url(), ...info };
    await p.screenshot({ path: `${out}/${name}.png` });
  } catch (e) { report[name] = { url, error: String(e.message).split("\n")[0] }; }
  await ctx.close();
}
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1).slice(0, 3000));
await b.close();
