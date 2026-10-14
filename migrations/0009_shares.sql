-- Share links for a Reality Card or a trip, and friends' votes on them (no account needed).
CREATE TABLE shares (
  token TEXT PRIMARY KEY,
  kind TEXT NOT NULL,          -- check | trip
  ref_id TEXT NOT NULL,
  device_id TEXT NOT NULL,     -- who shared
  place_name TEXT,             -- for check shares inside many-places reels (optional)
  created_at INTEGER NOT NULL
);
CREATE INDEX shares_ref ON shares (kind, ref_id, device_id);

CREATE TABLE votes (
  share_token TEXT NOT NULL REFERENCES shares(token),
  device_id TEXT NOT NULL,
  vote TEXT NOT NULL,          -- in | out
  name TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (share_token, device_id)
);
CREATE INDEX videos_explore ON videos (status, updated_at);
