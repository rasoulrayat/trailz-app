-- Several openly licensed photos per place (Wikipedia + Wikimedia Commons), cached as JSON.
CREATE TABLE place_galleries (
  query TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
DROP TABLE IF EXISTS place_photos;
