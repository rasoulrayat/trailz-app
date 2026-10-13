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
