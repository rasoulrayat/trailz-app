-- The physical device that made a check, kept even after the row moves to an account on login,
-- so the daily free-check limit can't be reset by logging in and out.
ALTER TABLE checks ADD COLUMN origin_device TEXT;
CREATE INDEX IF NOT EXISTS checks_origin ON checks (origin_device, created_at);
-- Explore counts checks and saves per video: index them instead of scanning.
CREATE INDEX IF NOT EXISTS checks_video ON checks (video_id, created_at);
CREATE INDEX IF NOT EXISTS saves_check ON saves (check_id);
-- Rows made before this column existed were keyed by the device that made them.
UPDATE checks SET origin_device = device_id WHERE origin_device IS NULL AND device_id NOT LIKE 'u:%';
