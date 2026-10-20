export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  MOCK_AI: string;
  DAILY_LIMIT: string;
  GEMINI_MODEL: string;
  GEMINI_BASE_URL: string;
  GEOCODER_CONTACT: string;
  /** Shown on the privacy page. */
  CONTACT_EMAIL?: string;
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
  /** Secret: Travelpayouts API token (profile → API token). Enables prices before the hand-off. */
  TP_TOKEN?: string;
  /** Secret: SerpApi key (Google Flights / Google Hotels live prices). */
  SERPAPI_KEY?: string;
  /** Secret. Viator Partner API key (affiliate): activity prices, ratings and tracked product links. */
  VIATOR_API_KEY?: string;
  /** Searches per month we allow ourselves on SerpApi (free plan: 250). */
  SERPAPI_MONTHLY_LIMIT?: string;
  /** Secret: Duffel access token (live airline fares + hosted checkout). */
  DUFFEL_TOKEN?: string;
  /** Our markup on Duffel bookings, e.g. "0.03" = 3 %. */
  DUFFEL_MARKUP_RATE?: string;
  /** "1" shows Duffel's sandbox airline to users (testing the checkout flow only). */
  DUFFEL_ALLOW_TEST?: string;
  /** Google sign-in: OAuth client id (public) and secret (Cloudflare secret). */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TP_TRS?: string;
  TP_KIWI_P?: string;
  TP_BOOKING_P?: string;
  TP_GYG_P?: string;
  TP_OMIO_P?: string;
}

export const isMock = (env: Env) => env.MOCK_AI === "1" || !env.SUPADATA_API_KEY;

/** Where trips start from until users can set a home city (sign-up comes in a later phase). */
export const DEFAULT_ORIGIN = "Amsterdam";
