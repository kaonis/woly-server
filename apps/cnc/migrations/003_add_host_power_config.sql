-- Migration 003: Add host power control configuration column to aggregated_hosts

ALTER TABLE aggregated_hosts
  ADD COLUMN IF NOT EXISTS power_config TEXT;
