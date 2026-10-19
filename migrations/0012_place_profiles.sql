-- The stable part of a Reality Card (months, cost, timing, practical, city guide, gems) per place,
-- written once and reused by every reel that shows the place. The reel-specific verdict
-- (authenticity, summary, comparisons) is generated per reel on top of it.
CREATE TABLE place_profiles (
  place_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT,
  json TEXT NOT NULL,
  backup INTEGER NOT NULL DEFAULT 0, -- 1 = written by the backup model (upgrade later)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
