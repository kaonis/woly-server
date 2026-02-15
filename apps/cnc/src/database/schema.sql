-- WoLy C&C Backend Database Schema

-- Nodes table
CREATE TABLE IF NOT EXISTS nodes (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    public_url VARCHAR(512),
    status VARCHAR(20) NOT NULL DEFAULT 'offline',
    last_heartbeat TIMESTAMP NOT NULL DEFAULT NOW(),
    capabilities TEXT[] DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Aggregated hosts table
CREATE TABLE IF NOT EXISTS aggregated_hosts (
    id SERIAL PRIMARY KEY,
    node_id VARCHAR(255) NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    mac VARCHAR(17) NOT NULL,
    ip VARCHAR(45) NOT NULL,
    status VARCHAR(20) NOT NULL,
    last_seen TIMESTAMP,
    location VARCHAR(255) NOT NULL,
    fully_qualified_name VARCHAR(512) NOT NULL,
    discovered INTEGER NOT NULL DEFAULT 1,
    ping_responsive INTEGER,
    notes TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(node_id, name)
);

-- Durable command lifecycle table
CREATE TABLE IF NOT EXISTS commands (
    id VARCHAR(255) PRIMARY KEY,
    node_id VARCHAR(255) NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    idempotency_key VARCHAR(255),
    state VARCHAR(20) NOT NULL CHECK (state IN ('queued', 'sent', 'acknowledged', 'failed', 'timed_out')),
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commands_idempotency_key
    ON commands(node_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commands_node_state ON commands(node_id, state);
CREATE INDEX IF NOT EXISTS idx_commands_created_at ON commands(created_at);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_last_heartbeat ON nodes(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_aggregated_hosts_node_id ON aggregated_hosts(node_id);
CREATE INDEX IF NOT EXISTS idx_aggregated_hosts_status ON aggregated_hosts(status);
CREATE INDEX IF NOT EXISTS idx_aggregated_hosts_mac ON aggregated_hosts(mac);
CREATE INDEX IF NOT EXISTS idx_aggregated_hosts_location ON aggregated_hosts(location);
CREATE INDEX IF NOT EXISTS idx_aggregated_hosts_fqn ON aggregated_hosts(fully_qualified_name);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_nodes_updated_at
    BEFORE UPDATE ON nodes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_aggregated_hosts_updated_at
    BEFORE UPDATE ON aggregated_hosts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_commands_updated_at
    BEFORE UPDATE ON commands
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
