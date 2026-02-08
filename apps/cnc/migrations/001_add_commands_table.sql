-- Migration: Add commands table for Phase 4 (Durable Command Lifecycle)
-- Date: 2026-02-07
-- Description: Adds the commands table with lifecycle states and idempotency support

-- PostgreSQL version
-- Run this if you are using PostgreSQL and already have an existing database

-- Create commands table
CREATE TABLE IF NOT EXISTS commands (
    id VARCHAR(255) PRIMARY KEY,
    node_id VARCHAR(255) NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    idempotency_key VARCHAR(255),
    state VARCHAR(20) NOT NULL CHECK (state IN ('queued', 'sent', 'acknowledged', 'failed', 'timed_out')),
    error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- Create unique index for idempotency keys
CREATE UNIQUE INDEX IF NOT EXISTS idx_commands_idempotency_key
    ON commands(node_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_commands_node_state ON commands(node_id, state);
CREATE INDEX IF NOT EXISTS idx_commands_created_at ON commands(created_at);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_commands_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_commands_updated_at
    BEFORE UPDATE ON commands
    FOR EACH ROW
    EXECUTE FUNCTION update_commands_updated_at();
