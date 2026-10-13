-- Server errors the team can read without the Cloudflare dashboard (newest first).
CREATE TABLE error_log (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  route TEXT NOT NULL,     -- e.g. "place-card", "analysis"
  ref TEXT,                -- video id or place name
  detail TEXT NOT NULL
);
CREATE INDEX error_log_at ON error_log (at);
