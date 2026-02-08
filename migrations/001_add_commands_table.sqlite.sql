-- Migration: Add commands table for Phase 4 (Durable Command Lifecycle)
-- Date: 2026-02-07
-- Description: Adds the commands table with lifecycle states and idempotency support
-- Database: SQLite

-- Create commands table
CREATE TABLE IF NOT EXISTS commands (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    idempotency_key TEXT,
    state TEXT NOT NULL CHECK(state IN ('queued', 'sent', 'acknowledged', 'failed', 'timed_out')),
    error TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME,
    completed_at DATETIME,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, idempotency_key)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_commands_node_state ON commands(node_id, state);
CREATE INDEX IF NOT EXISTS idx_commands_created_at ON commands(created_at);

-- Add trigger for updated_at
CREATE TRIGGER IF NOT EXISTS trigger_commands_updated_at
    AFTER UPDATE ON commands
    FOR EACH ROW
BEGIN
    UPDATE commands SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
