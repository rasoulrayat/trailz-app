-- Accounts: Google sign-in on top of the anonymous device id.
-- A logged-in user's rows (checks, saves, trips, shares, votes) are keyed by owner id "u:<user id>";
-- on login the device's rows move to that owner, so every device the user logs in on sees the same things.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- Onboarding answers (vibes, crew, budget, home city), for a device or an account.
CREATE TABLE profiles (
  owner_id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
