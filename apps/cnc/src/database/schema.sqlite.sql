-- WoLy C&C Backend Database Schema (SQLite)

-- Nodes table
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    public_url TEXT,
    status TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('online', 'offline')),
    last_heartbeat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    capabilities TEXT DEFAULT '[]',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Aggregated hosts table
CREATE TABLE IF NOT EXISTS aggregated_hosts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    name TEXT NOT NULL,
    mac TEXT NOT NULL,
    ip TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('awake', 'asleep')),
    last_seen DATETIME,
    location TEXT NOT NULL,
    fully_qualified_name TEXT NOT NULL,
    discovered INTEGER NOT NULL DEFAULT 1,
    ping_responsive INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, name)
);

-- Durable command lifecycle table
CREATE TABLE IF NOT EXISTS commands (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    idempotency_key TEXT,
    state TEXT NOT NULL CHECK(state IN ('queued', 'sent', 'acknowledged', 'failed', 'timed_out')),
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME,
    completed_at DATETIME,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, idempotency_key)
);

-- Wake schedules table
CREATE TABLE IF NOT EXISTS wake_schedules (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    host_fqn TEXT NOT NULL,
    host_name TEXT NOT NULL,
    host_mac TEXT NOT NULL,
    scheduled_time DATETIME NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    frequency TEXT NOT NULL CHECK(frequency IN ('once', 'daily', 'weekly', 'weekdays', 'weekends')),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
    notify_on_wake INTEGER NOT NULL DEFAULT 1 CHECK(notify_on_wake IN (0, 1)),
    last_triggered DATETIME,
    next_trigger DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_last_heartbeat ON nodes(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_aggregated_hosts_node_id ON aggregated_hosts(node_id);
CREATE INDEX IF NOT EXISTS idx_aggregated_hosts_status ON aggregated_hosts(status);
CREATE INDEX IF NOT EXISTS idx_aggregated_hosts_mac ON aggregated_hosts(mac);
CREATE INDEX IF NOT EXISTS idx_aggregated_hosts_location ON aggregated_hosts(location);
CREATE INDEX IF NOT EXISTS idx_aggregated_hosts_fqn ON aggregated_hosts(fully_qualified_name);
CREATE INDEX IF NOT EXISTS idx_commands_node_state ON commands(node_id, state);
CREATE INDEX IF NOT EXISTS idx_commands_created_at ON commands(created_at);
CREATE INDEX IF NOT EXISTS idx_wake_schedules_owner_sub ON wake_schedules(owner_sub);
CREATE INDEX IF NOT EXISTS idx_wake_schedules_host_fqn ON wake_schedules(host_fqn);
CREATE INDEX IF NOT EXISTS idx_wake_schedules_owner_host ON wake_schedules(owner_sub, host_fqn);

-- Triggers for updated_at (SQLite version)
CREATE TRIGGER IF NOT EXISTS update_nodes_updated_at
    AFTER UPDATE ON nodes
    FOR EACH ROW
BEGIN
    UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_aggregated_hosts_updated_at
    AFTER UPDATE ON aggregated_hosts
    FOR EACH ROW
BEGIN
    UPDATE aggregated_hosts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_commands_updated_at
    AFTER UPDATE ON commands
    FOR EACH ROW
BEGIN
    UPDATE commands SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_wake_schedules_updated_at
    AFTER UPDATE ON wake_schedules
    FOR EACH ROW
BEGIN
    UPDATE wake_schedules SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
