/**
 * Links that open Google Hotels with the trip filled in.
 *
 * A hotel's page is /travel/hotels/entity/<property_token> (SerpApi's property_token is Google's entity id).
 * Its dates and guests ride in "ts": base64url of a small protobuf, the same one Google writes into the
 * address bar after you pick dates. Plain ?dates= or ?checkin= parameters are ignored by Google, so we build
 * ts ourselves (checked in a real browser, Oct 2026: dates, travelers and EUR prices all show). Without a token,
 * the town's hotel search takes the same ts.
 */

const varint = (n: number): number[] => {
  const out: number[] = [];
  while (n > 127) {
    out.push((n & 127) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
};
const bytesField = (no: number, bytes: number[]) => [(no << 3) | 2, ...varint(bytes.length), ...bytes];
const numField = (no: number, n: number) => [(no << 3) | 0, ...varint(n)];
const dateMsg = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return [...numField(1, y), ...numField(2, m), ...numField(3, d)];
};

const base64url = (bytes: number[]) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const nightsBetween = (a: string, b: string) => Math.max(1, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000));

/**
 * Google's "ts" for a stay, as Google itself writes it: field 2 lists the travelers (one entry per adult,
 * {1: 3}) and the room count; field 3 holds check-in, check-out and nights; field 5 the currency.
 */
export function googleHotelsTs(checkIn: string, checkOut: string, adults: number, currency = "EUR"): string {
  const n = Math.min(9, Math.max(1, Math.round(adults) || 1));
  const travelers = [...Array.from({ length: n }, () => bytesField(1, numField(1, 3))).flat(), ...numField(2, 1)];
  const dates = [...bytesField(1, dateMsg(checkIn)), ...bytesField(2, dateMsg(checkOut)), ...numField(3, nightsBetween(checkIn, checkOut))];
  const stay = [...bytesField(2, dates), ...bytesField(6, numField(1, 2))];
  const money = [...bytesField(1, bytesField(7, [...currency].map((c) => c.charCodeAt(0)))), ...bytesField(3, [])];
  return base64url([...numField(1, 1), ...bytesField(2, travelers), ...bytesField(3, [...bytesField(1, bytesField(3, [])), ...bytesField(2, stay)]), ...bytesField(5, money)]);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** One hotel on Google Hotels with its dates and guests; the town's hotel list, same dates, when there's no token. */
export function googleHotelsLink(o: { token?: string | null; place: string; checkIn: string; checkOut: string; adults: number }): string {
  const datesOk = ISO.test(o.checkIn) && ISO.test(o.checkOut) && o.checkOut > o.checkIn;
  const ts = datesOk ? `&ts=${googleHotelsTs(o.checkIn, o.checkOut, o.adults)}` : "";
  if (o.token && /^[A-Za-z0-9_-]{10,200}$/.test(o.token)) return `https://www.google.com/travel/hotels/entity/${o.token}?hl=en&curr=EUR${ts}`;
  return `https://www.google.com/travel/search?q=${encodeURIComponent(`hotels in ${o.place}`)}&hl=en&curr=EUR${ts}`;
}
