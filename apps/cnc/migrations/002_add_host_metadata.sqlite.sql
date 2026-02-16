-- Migration 002: Add host metadata columns (notes/tags) to aggregated_hosts
-- Note: SQLite ALTER TABLE ADD COLUMN is not idempotent; run once per database.

ALTER TABLE aggregated_hosts ADD COLUMN notes TEXT;
ALTER TABLE aggregated_hosts ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';

UPDATE aggregated_hosts
SET tags = '[]'
WHERE tags IS NULL;
