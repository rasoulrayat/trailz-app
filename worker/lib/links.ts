import type { LinkErrorCode, Platform } from "../../shared/types";

/** A link we know how to analyze. */
export interface VideoLink {
  platform: Platform;
  /** Stable id used for caching: the same video always gets the same key. */
  canonicalKey: string;
  /** Clean URL sent to oEmbed and the extractor. */
  url: string;
}

export type ParseResult =
  | { kind: "video"; link: VideoLink }
  | { kind: "short"; url: string } // needs a redirect lookup first
  | { kind: "error"; code: LinkErrorCode };

const URL_IN_TEXT = /(https?:\/\/[^\s<>"']+|(?:www\.|m\.|vm\.|vt\.)?(?:tiktok|instagram|youtube|youtu)\.(?:com|be)\/[^\s<>"']*)/i;

/** Share sheets often send "Look at this! https://…" — pull out the first link. */
export function findUrl(text: string): string | null {
  const match = text.trim().match(URL_IN_TEXT);
  if (!match) return null;
  let raw = match[0].replace(/[),.;!?]+$/, "");
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  return raw;
}

export function parseLink(input: string): ParseResult {
  const raw = findUrl(input);
  if (!raw) return { kind: "error", code: "no_link" };

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { kind: "error", code: "no_link" };
  }
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  const parts = u.pathname.split("/").filter(Boolean);

  // ---- TikTok ----
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") return { kind: "short", url: u.toString() };
  if (host === "tiktok.com") {
    if (parts[0] === "t" && parts[1]) return { kind: "short", url: u.toString() };
    const videoIdx = parts.findIndex((p) => p === "video" || p === "photo");
    if (videoIdx > 0 && /^\d+$/.test(parts[videoIdx + 1] ?? "")) {
      const id = parts[videoIdx + 1];
      // Keep the creator's handle in the URL; drop tracking query parameters.
      const url = `https://www.tiktok.com/${parts.slice(0, videoIdx + 2).join("/")}`;
      return { kind: "video", link: { platform: "tiktok", canonicalKey: `tiktok:${id}`, url } };
    }
    if (parts.length >= 1 && parts[0].startsWith("@")) return { kind: "error", code: "profile_link" };
    return { kind: "error", code: "unsupported_site" };
  }

  // ---- Instagram ----
  if (host === "instagram.com" || host === "instagr.am") {
    const i = parts.findIndex((p) => ["reel", "reels", "p", "tv"].includes(p));
    if (i >= 0 && parts[i + 1]) {
      const code = parts[i + 1];
      return {
        kind: "video",
        link: { platform: "instagram", canonicalKey: `instagram:${code}`, url: `https://www.instagram.com/reel/${code}/` },
      };
    }
    if (parts[0] === "share") return { kind: "short", url: u.toString() };
    if (parts.length === 1 && !["explore", "stories", "direct", "accounts"].includes(parts[0])) {
      return { kind: "error", code: "profile_link" };
    }
    return { kind: "error", code: "unsupported_site" };
  }

  // ---- YouTube ----
  const yt = (id: string): ParseResult =>
    /^[\w-]{6,}$/.test(id)
      ? {
          kind: "video",
          link: { platform: "youtube", canonicalKey: `youtube:${id}`, url: `https://www.youtube.com/watch?v=${id}` },
        }
      : { kind: "error", code: "unsupported_site" };
  if (host === "youtu.be" && parts[0]) return yt(parts[0]);
  if (host === "youtube.com" || host === "music.youtube.com") {
    if (parts[0] === "shorts" && parts[1]) return yt(parts[1]);
    if (parts[0] === "watch" && u.searchParams.get("v")) return yt(u.searchParams.get("v")!);
    if (parts[0] === "live" && parts[1]) return yt(parts[1]);
    if (parts[0]?.startsWith("@") || ["channel", "c", "user"].includes(parts[0] ?? "")) {
      return { kind: "error", code: "profile_link" };
    }
    return { kind: "error", code: "unsupported_site" };
  }

  return { kind: "error", code: "unsupported_site" };
}

/** Follow a short link (vm.tiktok.com/…, instagram.com/share/…) to the real video URL. */
export async function resolveShortLink(url: string, fetcher: typeof fetch = fetch): Promise<ParseResult> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetcher(current, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (compatible; TrailZBot/1.0)" },
    });
    const location = res.headers.get("location");
    if (!location) break;
    current = new URL(location, current).toString();
    const parsed = parseLink(current);
    if (parsed.kind !== "short") return parsed;
  }
  return { kind: "error", code: "unavailable" };
}
