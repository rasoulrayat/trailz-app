export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  MOCK_AI: string;
  DAILY_LIMIT: string;
  GEMINI_MODEL: string;
  GEMINI_BASE_URL: string;
  GEOCODER_CONTACT: string;
  SUPADATA_API_KEY?: string;
  GEMINI_API_KEY?: string;
  /** Cloudflare Workers AI: backup when Gemini is overloaded. */
  AI?: { run(model: string, input: unknown): Promise<unknown> };
  FALLBACK_MODEL?: string;
  /** Partner affiliate ids (optional until the partner programs are approved). */
  KIWI_AFFILIATE_ID?: string;
  BOOKING_AFFILIATE_ID?: string;
  GYG_PARTNER_ID?: string;
  OMIO_PARTNER_ID?: string;
  /** Travelpayouts tracking: marker (partner id), trs (project id), and each brand's campaign id ("p" in their links). */
  TP_MARKER?: string;
  TP_TRS?: string;
  TP_KIWI_P?: string;
  TP_BOOKING_P?: string;
  TP_GYG_P?: string;
  TP_OMIO_P?: string;
}

export const isMock = (env: Env) => env.MOCK_AI === "1" || !env.SUPADATA_API_KEY;

/** Where trips start from until users can set a home city (sign-up comes in a later phase). */
export const DEFAULT_ORIGIN = "Amsterdam";
