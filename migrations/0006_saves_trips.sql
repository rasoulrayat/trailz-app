-- Hearted places (per device until accounts exist) and AI trip plans.
CREATE TABLE saves (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  place_key TEXT NOT NULL,
  name TEXT NOT NULL,
  region TEXT,
  country TEXT,
  lat REAL,
  lng REAL,
  vibe_json TEXT NOT NULL DEFAULT '[]',
  check_id TEXT,
  authenticity INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (device_id, place_key)
);
CREATE INDEX saves_device ON saves (device_id, created_at);

CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL,              -- draft | saved
  mood TEXT NOT NULL,
  budget_mode INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL,
  travelers INTEGER NOT NULL DEFAULT 1,
  start_date TEXT,
  places_json TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX trips_device ON trips (device_id, updated_at);
