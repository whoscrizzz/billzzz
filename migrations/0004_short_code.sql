ALTER TABLE magic_links ADD COLUMN short_code TEXT;

CREATE INDEX IF NOT EXISTS idx_magic_links_short_code ON magic_links(email, short_code);
