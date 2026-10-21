// Email log-in: one-time codes and passwords. Only hashes are stored.
import { sha256 } from "./auth";

/** A uniformly random 6-digit code ("000000"–"999999"). */
export function newCode(): string {
  const a = new Uint32Array(1);
  // Reject the top sliver so every code is equally likely.
  do crypto.getRandomValues(a);
  while (a[0] >= 4_294_000_000);
  return String(a[0] % 1_000_000).padStart(6, "0");
}

/** Codes are stored hashed with their address, so a code row can't be matched to another email. */
export const hashCode = (emailNorm: string, code: string) => sha256(`login-code:${emailNorm}:${code}`);

// PBKDF2-SHA256: built into Workers (WebCrypto). 100,000 iterations is the most Workers allows.
const ITERATIONS = 100_000;

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return `pbkdf2-sha256$${ITERATIONS}$${toB64(salt)}$${toB64(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored ?? "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") {
    // No (valid) hash: still do the work, so a missing account answers as slowly as a wrong password.
    await derive(password, new Uint8Array(16), ITERATIONS);
    return false;
  }
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS) return false;
  const want = fromB64(parts[3]);
  const got = await derive(password, fromB64(parts[2]), iterations);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

/** Whole minutes until a moment, at least 1 (for "try again in 12 minutes"). */
export const minutesUntil = (at: number, now = Date.now()) => Math.max(1, Math.ceil((at - now) / 60_000));
