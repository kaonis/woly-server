-- Migration 002: Add host metadata columns (notes/tags) to aggregated_hosts

BEGIN;

ALTER TABLE aggregated_hosts
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE aggregated_hosts
  ADD COLUMN IF NOT EXISTS tags TEXT NOT NULL DEFAULT '[]';

UPDATE aggregated_hosts
SET tags = '[]'
WHERE tags IS NULL;

COMMIT;
