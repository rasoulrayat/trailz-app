/**
 * Travelpayouts Partner Links API: turns any page of a brand TrailZ joined on Travelpayouts (Tiqets, …) into a
 * tracked link, so a deep link to the exact ticket still earns commission (a fixed short link only goes to the
 * brand's home page). Results are cached for 30 days; failures for a day, and then the plain URL is used.
 * https://support.travelpayouts.com/hc/en-us/articles/25289759198226
 */

import { noteFail, noteSkip } from "./ops";

export type TpLinkKeys = { token?: string; marker?: string; trs?: string };

const KEY = (url: string) => `tpl1:${url}`;
const OK_TTL = 30 * 24 * 3600_000;
const FAIL_TTL = 24 * 3600_000;

export async function trackedLinks(db: D1Database, keys: TpLinkKeys, urls: string[], subId = "trailz", fetcher: typeof fetch = fetch): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(urls.filter(Boolean))];
  if (!unique.length) return out;
  if (!keys.token || !keys.marker || !keys.trs) return noteSkip("TP_TOKEN, TP_MARKER or TP_TRS not set"), out;

  // What's cached already ("" = this link can't be tracked; use it plain).
  const now = Date.now();
  const missing: string[] = [];
  for (const url of unique) {
    const row = await db.prepare("SELECT json FROM kv_cache WHERE key = ? AND expires_at > ?").bind(KEY(url), now).first<{ json: string }>();
    if (!row) missing.push(url);
    else {
      const v = JSON.parse(row.json) as string;
      if (v) out.set(url, v);
    }
  }

  for (let i = 0; i < missing.length; i += 10) {
    const batch = missing.slice(i, i + 10);
    try {
      const res = await fetcher("https://api.travelpayouts.com/links/v1/create", {
        method: "POST",
        headers: { "content-type": "application/json", "X-Access-Token": keys.token },
        body: JSON.stringify({ trs: Number(keys.trs), marker: Number(keys.marker), shorten: false, links: batch.map((url) => ({ url, sub_id: subId })) }),
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`links ${res.status}`); // token, marker or project problem: not cached as "can't track"
      const body = (await res.json()) as { result?: { links?: { url: string; code: string; partner_url?: string; message?: string }[] } };
      const links = body.result?.links ?? [];
      for (const url of batch) {
        const hit = links.find((l) => l.url === url) ?? links[batch.indexOf(url)];
        const tracked = hit?.code === "success" && hit.partner_url ? hit.partner_url : "";
        if (!tracked) noteFail(`Travelpayouts: ${hit?.message || "no tracked link"}`);
        if (tracked) out.set(url, tracked);
        await db.prepare("INSERT OR REPLACE INTO kv_cache (key, json, expires_at) VALUES (?, ?, ?)").bind(KEY(url), JSON.stringify(tracked), now + (tracked ? OK_TTL : FAIL_TTL)).run();
      }
    } catch (e) {
      noteFail(String(e));
      // Network or API trouble: plain links this time, try again next time.
    }
  }
  return out;
}

/** One link's result, for /api/health: the code and message Travelpayouts gives (no secrets). */
export async function checkTrackedLink(keys: TpLinkKeys, url: string, fetcher: typeof fetch = fetch) {
  if (!keys.token || !keys.marker || !keys.trs) return { ok: false, error: "TP_TOKEN, TP_MARKER or TP_TRS not set" };
  try {
    const res = await fetcher("https://api.travelpayouts.com/links/v1/create", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Access-Token": keys.token },
      body: JSON.stringify({ trs: Number(keys.trs), marker: Number(keys.marker), shorten: false, links: [{ url, sub_id: "health" }] }),
      signal: AbortSignal.timeout(6000),
    });
    const body = (await res.json().catch(() => ({}))) as { result?: { links?: { code: string; message?: string; partner_url?: string }[] }; error?: string; code?: string };
    const l = body.result?.links?.[0];
    return { ok: l?.code === "success", status: res.status, code: l?.code ?? body.code, message: l?.message ?? body.error, sample: l?.partner_url ? `${l.partner_url.slice(0, 48)}…` : null };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
