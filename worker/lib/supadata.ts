import { EXTRACT_SCHEMA } from "./extract-schema";

const BASE = "https://api.supadata.ai/v1";

export type ExtractJob =
  | { status: "queued" | "active" }
  | { status: "completed"; data: unknown }
  | { status: "failed"; error: string };

export class SupadataError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}

/** Start an Extract job: Supadata fetches the video and fills our JSON schema. */
export async function startExtract(apiKey: string, url: string, fetcher: typeof fetch = fetch): Promise<string> {
  const res = await fetcher(`${BASE}/extract`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      url,
      prompt:
        "You analyze short travel videos for TrailZ, an app that shows young travelers what a place is really like. Identify every real place shown, what the video claims about it, and what it actually shows. Be honest and never invent places.",
      schema: EXTRACT_SCHEMA,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof body.jobId !== "string") {
    throw new SupadataError(String(body.message ?? body.error ?? `Supadata error ${res.status}`), res.status);
  }
  return body.jobId;
}

/** Check a job. Free of charge; results expire 1 hour after completion. */
export async function getExtract(apiKey: string, jobId: string, fetcher: typeof fetch = fetch): Promise<ExtractJob> {
  const res = await fetcher(`${BASE}/extract/${encodeURIComponent(jobId)}`, {
    headers: { "x-api-key": apiKey },
  });
  if (res.status === 404) return { status: "failed", error: "expired" };
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new SupadataError(String(body.message ?? `Supadata error ${res.status}`), res.status);
  if (body.status === "completed") return { status: "completed", data: body.data };
  if (body.status === "failed") return { status: "failed", error: String(body.error ?? "failed") };
  return { status: body.status === "active" ? "active" : "queued" };
}

export interface VideoMetadata {
  title?: string;
  author?: string;
  thumbnailUrl?: string;
}

/**
 * Title, creator and cover image of a post (1 Supadata credit).
 * Used for Instagram, whose free oEmbed needs a Meta app token.
 */
export async function getMetadata(apiKey: string, url: string, fetcher: typeof fetch = fetch): Promise<VideoMetadata> {
  const res = await fetcher(`${BASE}/metadata?url=${encodeURIComponent(url)}`, { headers: { "x-api-key": apiKey } });
  if (!res.ok) throw new SupadataError(`Supadata metadata error ${res.status}`, res.status);
  const b = (await res.json()) as {
    title?: string | null;
    description?: string | null;
    author?: { username?: string; displayName?: string };
    media?: { thumbnailUrl?: string; url?: string; items?: { thumbnailUrl?: string; url?: string }[] };
  };
  const m = b.media;
  const thumb = m?.thumbnailUrl || m?.url || m?.items?.[0]?.thumbnailUrl || m?.items?.[0]?.url;
  const handle = b.author?.username || b.author?.displayName;
  const title = (b.title || b.description || "").trim();
  return {
    title: title ? title.slice(0, 300) : undefined,
    author: handle ? `@${handle.replace(/^@/, "")}` : undefined,
    thumbnailUrl: thumb || undefined,
  };
}
