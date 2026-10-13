-- Video cover images, copied once (Instagram/TikTok image links expire after a few days).
CREATE TABLE images (
  key TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  bytes BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

-- Place photos found on Wikipedia (url NULL = no good photo found).
CREATE TABLE place_photos (
  query TEXT PRIMARY KEY,
  url TEXT,
  page_url TEXT,
  title TEXT,
  created_at INTEGER NOT NULL
);
