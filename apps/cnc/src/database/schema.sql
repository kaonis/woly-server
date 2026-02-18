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
    secondary_macs TEXT NOT NULL DEFAULT '[]',
    ip VARCHAR(45) NOT NULL,
    status VARCHAR(20) NOT NULL,
    last_seen TIMESTAMP,
    location VARCHAR(255) NOT NULL,
    fully_qualified_name VARCHAR(512) NOT NULL,
    discovered INTEGER NOT NULL DEFAULT 1,
    ping_responsive INTEGER,
    notes TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    power_config TEXT,
    open_ports TEXT NOT NULL DEFAULT '[]',
    ports_scanned_at TIMESTAMP,
    ports_expire_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(node_id, name)
);

-- Host status transition history
CREATE TABLE IF NOT EXISTS host_status_history (
    id SERIAL PRIMARY KEY,
    host_fqn VARCHAR(512) NOT NULL,
    old_status VARCHAR(20) NOT NULL CHECK (old_status IN ('awake', 'asleep')),
    new_status VARCHAR(20) NOT NULL CHECK (new_status IN ('awake', 'asleep')),
    changed_at TIMESTAMP NOT NULL DEFAULT NOW()
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

-- Wake schedules table
CREATE TABLE IF NOT EXISTS wake_schedules (
    id VARCHAR(255) PRIMARY KEY,
    owner_sub VARCHAR(255) NOT NULL,
    host_fqn VARCHAR(512) NOT NULL,
    host_name VARCHAR(255) NOT NULL,
    host_mac VARCHAR(17) NOT NULL,
    scheduled_time TIMESTAMP NOT NULL,
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('once', 'daily', 'weekly', 'weekdays', 'weekends')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    notify_on_wake BOOLEAN NOT NULL DEFAULT TRUE,
    last_triggered TIMESTAMP,
    next_trigger TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wake_schedules_owner_sub ON wake_schedules(owner_sub);
CREATE INDEX IF NOT EXISTS idx_wake_schedules_host_fqn ON wake_schedules(host_fqn);
CREATE INDEX IF NOT EXISTS idx_wake_schedules_owner_host ON wake_schedules(owner_sub, host_fqn);

-- Webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
    id VARCHAR(255) PRIMARY KEY,
    url TEXT NOT NULL,
    events JSONB NOT NULL,
    secret TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Webhook delivery log table
CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
    id BIGSERIAL PRIMARY KEY,
    webhook_id VARCHAR(255) NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    attempt INTEGER NOT NULL CHECK (attempt >= 1),
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
    response_status INTEGER,
    error TEXT,
    payload JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Push notification device tokens
CREATE TABLE IF NOT EXISTS push_devices (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('ios', 'android')),
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Per-user notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id VARCHAR(255) PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    events JSONB NOT NULL,
    quiet_hours JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_last_heartbeat ON nodes(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_aggregated_hosts_node_id ON aggregated_hosts(node_id);
CREATE INDEX IF NOT EXISTS idx_aggregated_hosts_status ON aggregated_hosts(status);
CREATE INDEX IF NOT EXISTS idx_aggregated_hosts_mac ON aggregated_hosts(mac);
CREATE INDEX IF NOT EXISTS idx_aggregated_hosts_location ON aggregated_hosts(location);
CREATE INDEX IF NOT EXISTS idx_aggregated_hosts_fqn ON aggregated_hosts(fully_qualified_name);
CREATE INDEX IF NOT EXISTS idx_host_status_history_host_changed_at ON host_status_history(host_fqn, changed_at);
CREATE INDEX IF NOT EXISTS idx_host_status_history_changed_at ON host_status_history(changed_at);
CREATE INDEX IF NOT EXISTS idx_webhooks_created_at ON webhooks(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_webhook_id ON webhook_delivery_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_created_at ON webhook_delivery_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_push_devices_user_id ON push_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_push_devices_platform ON push_devices(platform);

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

CREATE TRIGGER update_wake_schedules_updated_at
    BEFORE UPDATE ON wake_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at
    BEFORE UPDATE ON webhooks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_push_devices_updated_at
    BEFORE UPDATE ON push_devices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
