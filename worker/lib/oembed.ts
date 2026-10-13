import type { VideoLink } from "./links";

export interface OEmbedInfo {
  available: boolean;
  title?: string;
  author?: string;
  thumbnailUrl?: string;
}

/**
 * Free, official check that a post exists and is public, plus caption and creator.
 * TikTok and YouTube have open oEmbed endpoints. Instagram's needs a Meta app token,
 * so for Instagram we skip this step and let the extractor report unavailable posts.
 */
export async function lookupOEmbed(link: VideoLink, fetcher: typeof fetch = fetch): Promise<OEmbedInfo> {
  let endpoint: string | null = null;
  if (link.platform === "tiktok") endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(link.url)}`;
  if (link.platform === "youtube") {
    endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link.url)}`;
  }
  if (!endpoint) return { available: true };

  try {
    const res = await fetcher(endpoint, { headers: { accept: "application/json" } });
    // 400/401/403/404: private, deleted or embedding disabled.
    if (res.status >= 400 && res.status < 500) return { available: false };
    if (!res.ok) return { available: true }; // their outage is not the user's problem
    const data = (await res.json()) as Record<string, unknown>;
    const author =
      (typeof data.author_unique_id === "string" && data.author_unique_id) ||
      (typeof data.author_name === "string" && data.author_name) ||
      undefined;
    return {
      available: true,
      title: typeof data.title === "string" ? data.title.slice(0, 300) : undefined,
      author: author ? String(author).replace(/^@?/, "@") : undefined,
      thumbnailUrl: typeof data.thumbnail_url === "string" ? data.thumbnail_url : undefined,
    };
  } catch {
    return { available: true };
  }
}
