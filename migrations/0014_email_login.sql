-- Log in with email: a 6-digit code sent by email, and an optional password set in You.
-- An account is found by its email (lower-cased) as well as by its Google id, so the same address
-- reaches the same account whichever way the person logs in.
ALTER TABLE users ADD COLUMN email_norm TEXT;
-- "pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>"; NULL = no password set.
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_fails INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN password_locked_until INTEGER;
UPDATE users SET email_norm = lower(trim(email)) WHERE email IS NOT NULL AND trim(email) <> '';
CREATE INDEX users_email_norm ON users (email_norm);

-- One live code per email. Only a hash is kept; the row goes away when the code is used.
CREATE TABLE login_codes (
  email_norm TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL
);

-- Every code email sent, for the limits (per address and per network). Rows older than a day are pruned.
CREATE TABLE login_sends (
  email_norm TEXT NOT NULL,
  ip TEXT NOT NULL,
  sent_at INTEGER NOT NULL
);
CREATE INDEX login_sends_email ON login_sends (email_norm, sent_at);
CREATE INDEX login_sends_ip ON login_sends (ip, sent_at);
