-- The technical reason a check failed (for the team; users see a friendly message).
ALTER TABLE videos ADD COLUMN error_detail TEXT;
