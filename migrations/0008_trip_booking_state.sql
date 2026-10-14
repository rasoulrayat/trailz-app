-- Which parts of a trip the person has booked, and the best months for its places (quick date picks).
ALTER TABLE trips ADD COLUMN booked_json TEXT;
ALTER TABLE trips ADD COLUMN months_json TEXT;
