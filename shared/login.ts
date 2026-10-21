// Email log-in rules shared by the app and the worker, so both say the same thing.

/** Lower-cased and trimmed: the key an account is found by. */
export const normalizeEmail = (s: string) => s.trim().toLowerCase();

/** A plain "something@domain.tld" check. The code email is the real test. */
export const looksLikeEmail = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(s);

// Mailbox providers people in Europe (and elsewhere) actually use; a near miss of one is likely a typo.
const DOMAINS = [
  "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com", "msn.com", "yahoo.com", "icloud.com", "me.com", "aol.com",
  "proton.me", "protonmail.com", "gmx.de", "gmx.net", "gmx.at", "web.de", "t-online.de", "outlook.de", "hotmail.de", "yahoo.de",
  "orange.fr", "free.fr", "wanadoo.fr", "hotmail.fr", "yahoo.fr", "laposte.net", "sfr.fr", "libero.it", "virgilio.it", "tiscali.it",
  "hotmail.it", "yahoo.it", "hotmail.co.uk", "yahoo.co.uk", "btinternet.com", "ziggo.nl", "kpnmail.nl", "hotmail.nl", "telenet.be",
  "skynet.be", "seznam.cz", "wp.pl", "o2.pl", "onet.pl", "interia.pl", "hotmail.es", "yahoo.es", "telefonica.net", "sapo.pt", "bluewin.ch",
];

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** "emma@gmial.com" → "emma@gmail.com"; null when the domain is known or nothing is close. */
export function suggestEmail(raw: string): string | null {
  const email = normalizeEmail(raw);
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const domain = email.slice(at + 1);
  if (!/\.[a-z]{2,}$/.test(domain) || DOMAINS.includes(domain)) return null;
  const [name, tld] = [domain.slice(0, domain.lastIndexOf(".")), domain.slice(domain.lastIndexOf(".") + 1)];
  let best: string | null = null;
  let bestD = 3;
  for (const d of DOMAINS) {
    // Same provider in another country (hotmail.be vs hotmail.de) is real, not a typo.
    if (tld.length === 2 && d.slice(0, d.lastIndexOf(".")) === name) continue;
    const n = distance(domain, d);
    if (n > 0 && n < bestD) {
      best = d;
      bestD = n;
    }
  }
  // One slip in a short domain, up to two in a longer one ("hotmial.con").
  if (!best || bestD > (domain.length <= 8 ? 1 : 2)) return null;
  return `${email.slice(0, at)}@${best}`;
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

// The passwords tried first by anyone guessing (plus their obvious variants, caught by the rules below).
const COMMON = new Set([
  "password", "password1", "password12", "password123", "passwort", "motdepasse", "wachtwoord", "contraseña", "iloveyou", "sunshine",
  "princess", "football", "baseball", "superman", "trustno1", "welcome1", "letmein1", "qwertyui", "qwertyuiop", "azertyui", "qwertzui",
  "asdfghjk", "zxcvbnm1", "abcd1234", "1q2w3e4r", "1qaz2wsx", "trailz123", "travel123",
]);

/** Which of the two rules a new password meets (the Set a password checklist). */
export function passwordRules(pw: string, email?: string | null): { long: boolean; notEasy: boolean } {
  const length = [...pw].length;
  const lower = pw.toLowerCase();
  const local = email ? normalizeEmail(email).split("@")[0] : "";
  const sameChar = /^(.)\1*$/.test(pw);
  const digitsRun = /^\d+$/.test(pw) && ("01234567890123456789".includes(pw) || "98765432109876543210".includes(pw));
  const easy =
    COMMON.has(lower) ||
    sameChar ||
    digitsRun ||
    (!!email && lower === normalizeEmail(email)) ||
    (local.length >= 3 && lower.includes(local));
  return { long: length >= PASSWORD_MIN && length <= PASSWORD_MAX, notEasy: length > 0 && !easy };
}

export const passwordOk = (pw: string, email?: string | null) => {
  const r = passwordRules(pw, email);
  return r.long && r.notEasy;
};

/** Codes: 6 digits, 15 minutes, 5 tries; a new one after 60 s, at most 5 an hour per address. */
export const CODE_TTL_MS = 15 * 60_000;
export const CODE_MAX_TRIES = 5;
export const RESEND_AFTER_S = 60;
export const CODES_PER_HOUR = 5;
