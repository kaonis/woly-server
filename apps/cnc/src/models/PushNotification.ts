import { randomUUID } from 'crypto';
import {
  notificationPreferencesSchema,
  PUSH_NOTIFICATION_EVENT_TYPES,
  pushNotificationEventTypeSchema,
  pushNotificationPlatformSchema,
} from '@kaonis/woly-protocol';
import db from '../database/connection';
import type {
  DeviceRegistration,
  NotificationPreferences,
  PushNotificationEventType,
  PushNotificationPlatform,
} from '../types';

type PushDeviceRow = {
  id: string;
  userId: string;
  platform: string;
  token: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  lastSeenAt: string | Date;
};

type NotificationPreferenceRow = {
  userId: string;
  enabled: boolean | number;
  events: unknown;
  quietHours: unknown;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  events: [...PUSH_NOTIFICATION_EVENT_TYPES],
  quietHours: null,
};

const SQLITE_CREATE_PUSH_DEVICES_TABLE = `
  CREATE TABLE IF NOT EXISTS push_devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL CHECK(platform IN ('ios', 'android')),
    token TEXT NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

const POSTGRES_CREATE_PUSH_DEVICES_TABLE = `
  CREATE TABLE IF NOT EXISTS push_devices (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('ios', 'android')),
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`;

const SQLITE_CREATE_NOTIFICATION_PREFERENCES_TABLE = `
  CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    events TEXT NOT NULL,
    quiet_hours TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

const POSTGRES_CREATE_NOTIFICATION_PREFERENCES_TABLE = `
  CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id VARCHAR(255) PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    events JSONB NOT NULL,
    quiet_hours JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`;

export type UpsertPushDeviceInput = {
  userId: string;
  platform: PushNotificationPlatform;
  token: string;
};

export class PushNotificationModel {
  private static tableReady: Promise<void> | null = null;

  static async ensureTables(): Promise<void> {
    if (!this.tableReady) {
      this.tableReady = this.createTables().catch((error) => {
        this.tableReady = null;
        throw error;
      });
    }

    await this.tableReady;
  }

  private static async createTables(): Promise<void> {
    const isSqlite = db.isSqlite;
    await db.query(isSqlite ? SQLITE_CREATE_PUSH_DEVICES_TABLE : POSTGRES_CREATE_PUSH_DEVICES_TABLE);
    await db.query(
      isSqlite ? SQLITE_CREATE_NOTIFICATION_PREFERENCES_TABLE : POSTGRES_CREATE_NOTIFICATION_PREFERENCES_TABLE
    );

    await db.query('CREATE INDEX IF NOT EXISTS idx_push_devices_user_id ON push_devices(user_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_push_devices_platform ON push_devices(platform)');
  }

  private static toIsoDate(value: string | Date): string {
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }
    return parsed.toISOString();
  }

  private static parseEvents(raw: unknown): PushNotificationEventType[] {
    let values: unknown[] = [];

    if (Array.isArray(raw)) {
      values = raw;
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          values = parsed;
        }
      } catch {
        return [...DEFAULT_NOTIFICATION_PREFERENCES.events];
      }
    }

    const events = values
      .map((candidate) => pushNotificationEventTypeSchema.safeParse(candidate))
      .filter((result): result is { success: true; data: PushNotificationEventType } => result.success)
      .map((result) => result.data);

    return events.length > 0 ? Array.from(new Set(events)) : [...DEFAULT_NOTIFICATION_PREFERENCES.events];
  }

  private static parseQuietHours(raw: unknown): NotificationPreferences['quietHours'] {
    if (raw === null || raw === undefined) {
      return null;
    }

    const candidate = typeof raw === 'string' ? (() => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    })() : raw;

    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return null;
    }

    const parsed = notificationPreferencesSchema.safeParse({
      enabled: true,
      events: ['host.awake'],
      quietHours: candidate,
    });

    if (!parsed.success) {
      return null;
    }

    return parsed.data.quietHours ?? null;
  }

  private static mapDeviceRow(row: PushDeviceRow): DeviceRegistration {
    return {
      id: row.id,
      userId: row.userId,
      platform: pushNotificationPlatformSchema.parse(row.platform),
      token: row.token,
      createdAt: this.toIsoDate(row.createdAt),
      updatedAt: this.toIsoDate(row.updatedAt),
      lastSeenAt: this.toIsoDate(row.lastSeenAt),
    };
  }

  private static mapPreferenceRow(row: NotificationPreferenceRow): NotificationPreferences {
    return {
      enabled: row.enabled === true || row.enabled === 1,
      events: this.parseEvents(row.events),
      quietHours: this.parseQuietHours(row.quietHours),
    };
  }

  static async upsertDevice(input: UpsertPushDeviceInput): Promise<DeviceRegistration> {
    await this.ensureTables();

    const id = randomUUID();
    const isSqlite = db.isSqlite;

    const result = await db.query<PushDeviceRow>(
      isSqlite
        ? `INSERT INTO push_devices (id, user_id, platform, token)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT(token) DO UPDATE SET
             user_id = excluded.user_id,
             platform = excluded.platform,
             updated_at = CURRENT_TIMESTAMP,
             last_seen_at = CURRENT_TIMESTAMP
           RETURNING
             id,
             user_id as "userId",
             platform,
             token,
             created_at as "createdAt",
             updated_at as "updatedAt",
             last_seen_at as "lastSeenAt"`
        : `INSERT INTO push_devices (id, user_id, platform, token)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT(token) DO UPDATE SET
             user_id = EXCLUDED.user_id,
             platform = EXCLUDED.platform,
             updated_at = NOW(),
             last_seen_at = NOW()
           RETURNING
             id,
             user_id as "userId",
             platform,
             token,
             created_at as "createdAt",
             updated_at as "updatedAt",
             last_seen_at as "lastSeenAt"`,
      [id, input.userId, input.platform, input.token],
    );

    return this.mapDeviceRow(result.rows[0]);
  }

  static async listDevicesByUser(userId: string): Promise<DeviceRegistration[]> {
    await this.ensureTables();

    const result = await db.query<PushDeviceRow>(
      `SELECT
         id,
         user_id as "userId",
         platform,
         token,
         created_at as "createdAt",
         updated_at as "updatedAt",
         last_seen_at as "lastSeenAt"
       FROM push_devices
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId],
    );

    return result.rows.map((row) => this.mapDeviceRow(row));
  }

  static async listAllDevices(): Promise<DeviceRegistration[]> {
    await this.ensureTables();

    const result = await db.query<PushDeviceRow>(
      `SELECT
         id,
         user_id as "userId",
         platform,
         token,
         created_at as "createdAt",
         updated_at as "updatedAt",
         last_seen_at as "lastSeenAt"
       FROM push_devices
       ORDER BY updated_at DESC`,
    );

    return result.rows.map((row) => this.mapDeviceRow(row));
  }

  static async deleteDevice(userId: string, token: string): Promise<boolean> {
    await this.ensureTables();

    const result = await db.query(
      `DELETE FROM push_devices
       WHERE user_id = $1 AND token = $2`,
      [userId, token],
    );

    return (result.rowCount ?? 0) > 0;
  }

  static async deleteDeviceByToken(token: string): Promise<void> {
    await this.ensureTables();
    await db.query('DELETE FROM push_devices WHERE token = $1', [token]);
  }

  static async getPreferences(userId: string): Promise<NotificationPreferences> {
    await this.ensureTables();

    const result = await db.query<NotificationPreferenceRow>(
      `SELECT
         user_id as "userId",
         enabled,
         events,
         quiet_hours as "quietHours"
       FROM notification_preferences
       WHERE user_id = $1`,
      [userId],
    );

    const row = result.rows[0];
    if (!row) {
      return { ...DEFAULT_NOTIFICATION_PREFERENCES };
    }

    return this.mapPreferenceRow(row);
  }

  static async getPreferencesByUsers(userIds: string[]): Promise<Map<string, NotificationPreferences>> {
    await this.ensureTables();

    const uniqueUserIds = Array.from(new Set(userIds.map((value) => value.trim()).filter(Boolean)));
    if (uniqueUserIds.length === 0) {
      return new Map();
    }

    const placeholders = uniqueUserIds.map((_, index) => `$${index + 1}`).join(', ');
    const result = await db.query<NotificationPreferenceRow>(
      `SELECT
         user_id as "userId",
         enabled,
         events,
         quiet_hours as "quietHours"
       FROM notification_preferences
       WHERE user_id IN (${placeholders})`,
      uniqueUserIds,
    );

    const mapped = new Map<string, NotificationPreferences>();
    for (const row of result.rows) {
      mapped.set(row.userId, this.mapPreferenceRow(row));
    }

    return mapped;
  }

  static async upsertPreferences(userId: string, preferences: NotificationPreferences): Promise<NotificationPreferences> {
    await this.ensureTables();

    const sanitized = notificationPreferencesSchema.parse(preferences);
    const isSqlite = db.isSqlite;

    const eventsJson = JSON.stringify(sanitized.events);
    const quietHoursJson = sanitized.quietHours ? JSON.stringify(sanitized.quietHours) : null;
    const enabledValue = isSqlite ? (sanitized.enabled ? 1 : 0) : sanitized.enabled;

    await db.query(
      isSqlite
        ? `INSERT INTO notification_preferences (user_id, enabled, events, quiet_hours)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT(user_id) DO UPDATE SET
             enabled = excluded.enabled,
             events = excluded.events,
             quiet_hours = excluded.quiet_hours,
             updated_at = CURRENT_TIMESTAMP`
        : `INSERT INTO notification_preferences (user_id, enabled, events, quiet_hours)
           VALUES ($1, $2, $3::jsonb, $4::jsonb)
           ON CONFLICT(user_id) DO UPDATE SET
             enabled = EXCLUDED.enabled,
             events = EXCLUDED.events,
             quiet_hours = EXCLUDED.quiet_hours,
             updated_at = NOW()`,
      [userId, enabledValue, eventsJson, quietHoursJson],
    );

    return this.getPreferences(userId);
  }
}

export default PushNotificationModel;
