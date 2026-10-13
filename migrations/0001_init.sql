-- TrailZ core loop: one row per unique video, one row per user check.

CREATE TABLE videos (
  id TEXT PRIMARY KEY,                -- our id (short random)
  canonical_key TEXT NOT NULL UNIQUE, -- e.g. "tiktok:7301234567890"
  platform TEXT NOT NULL,             -- tiktok | instagram | youtube
  url TEXT NOT NULL,                  -- canonical URL sent to the extractor
  title TEXT,                         -- caption / title from oEmbed
  author TEXT,                        -- creator handle
  thumbnail_url TEXT,
  status TEXT NOT NULL,               -- extracting | analyzing | ready | failed
  job_id TEXT,                        -- Supadata extract job id
  extract_json TEXT,                  -- raw video text record (training data later)
  outcome TEXT,                       -- single | multi | pick | vibe | not_travel
  result_json TEXT,                   -- what the result screen renders
  error TEXT,
  last_polled_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE checks (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  video_id TEXT NOT NULL REFERENCES videos(id),
  billable INTEGER NOT NULL DEFAULT 0, -- 1 when this check started a new AI job
  created_at INTEGER NOT NULL
);
CREATE INDEX checks_device_time ON checks (device_id, created_at);

-- Reality Cards for a place in a reel that is not the main result: places inside
-- multi-place reels (generated only when tapped) and places a user picks or types.
CREATE TABLE place_cards (
  video_id TEXT NOT NULL REFERENCES videos(id),
  place_key TEXT NOT NULL,            -- normalized place name
  card_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (video_id, place_key)
);

-- User answers: "it's this place", "we got this wrong". Feeds the AI review queue.
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id),
  device_id TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- picked_place | typed_place | wrong_result
  value TEXT,
  created_at INTEGER NOT NULL
);

-- Geocoder cache so the same place name is looked up once.
CREATE TABLE geocode_cache (
  query TEXT PRIMARY KEY,
  result_json TEXT,                   -- null = not found
  created_at INTEGER NOT NULL
);
