-- Multiple due dates per bill (JSON array of YYYY-MM-DD)
ALTER TABLE subscriptions ADD COLUMN due_dates TEXT;
