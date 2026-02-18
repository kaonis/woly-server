-- Add push notification device + preference tables (SQLite)

CREATE TABLE IF NOT EXISTS push_devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL CHECK(platform IN ('ios', 'android')),
    token TEXT NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
    events TEXT NOT NULL,
    quiet_hours TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_devices_user_id ON push_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_push_devices_platform ON push_devices(platform);

CREATE TRIGGER IF NOT EXISTS trigger_push_devices_updated_at
    AFTER UPDATE ON push_devices
    FOR EACH ROW
BEGIN
    UPDATE push_devices SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trigger_notification_preferences_updated_at
    AFTER UPDATE ON notification_preferences
    FOR EACH ROW
BEGIN
    UPDATE notification_preferences SET updated_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
END;
