-- Small cache for partner lookups (airport codes, cached prices), with an expiry.
CREATE TABLE kv_cache (
  key TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
