-- What works and what doesn't: every step of the app's workflows (reading a reel, the AI analysis, a trip plan,
-- each price provider, partner links, sign-in, the cron) records its outcome.
--   op_stats:  counts per hour and step (ok = worked, empty = worked but found nothing, fail = error, skip = not
--              configured or over a limit), plus total milliseconds for the average time. Kept 90 days.
--   op_events: one row per step that did NOT simply work (empty, fail, skip), with what happened. Kept 14 days.
CREATE TABLE IF NOT EXISTS op_stats (
  hour INTEGER NOT NULL,          -- unix time / 3600
  op TEXT NOT NULL,               -- e.g. "check.analysis", "prices.google-flights"
  ok INTEGER NOT NULL DEFAULT 0,
  empty INTEGER NOT NULL DEFAULT 0,
  fail INTEGER NOT NULL DEFAULT 0,
  skip INTEGER NOT NULL DEFAULT 0,
  ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hour, op)
);

CREATE TABLE IF NOT EXISTS op_events (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  op TEXT NOT NULL,
  outcome TEXT NOT NULL,          -- empty | fail | skip
  ms INTEGER,
  ref TEXT,                       -- what it was about: a reel id, a trip id, a route (no personal data)
  detail TEXT                     -- what happened, e.g. "HTTP 429", "monthly limit reached"
);
CREATE INDEX IF NOT EXISTS op_events_at ON op_events (at);
CREATE INDEX IF NOT EXISTS op_events_op ON op_events (op, at);
