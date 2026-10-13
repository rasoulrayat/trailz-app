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
}

export const isMock = (env: Env) => env.MOCK_AI === "1" || !env.SUPADATA_API_KEY;

/** Where trips start from until users can set a home city (sign-up comes in a later phase). */
export const DEFAULT_ORIGIN = "Amsterdam";
