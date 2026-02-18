-- Migration 003: Add host power control configuration column to aggregated_hosts

ALTER TABLE aggregated_hosts ADD COLUMN power_config TEXT;
