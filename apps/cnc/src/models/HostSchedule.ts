import { randomUUID } from 'crypto';
import db from '../database/connection';
import type { HostWakeSchedule, ScheduleFrequency } from '../types';

interface HostScheduleRow {
  id: string;
  host_fqn: string;
  host_name: string;
  host_mac: string;
  scheduled_time: string | Date;
  frequency: ScheduleFrequency;
  enabled: boolean | number;
  notify_on_wake: boolean | number;
  timezone: string;
  last_triggered: string | Date | null;
  next_trigger: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface CreateHostScheduleInput {
  hostFqn: string;
  hostName: string;
  hostMac: string;
  scheduledTime: string;
  frequency: ScheduleFrequency;
  enabled: boolean;
  notifyOnWake: boolean;
  timezone: string;
}

interface UpdateHostScheduleInput {
  scheduledTime?: string;
  frequency?: ScheduleFrequency;
  enabled?: boolean;
  notifyOnWake?: boolean;
  timezone?: string;
}

const isSqlite = db.isSqlite;

const SQLITE_CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS host_wake_schedules (
    id TEXT PRIMARY KEY,
    host_fqn TEXT NOT NULL,
    host_name TEXT NOT NULL,
    host_mac TEXT NOT NULL,
    scheduled_time DATETIME NOT NULL,
    frequency TEXT NOT NULL CHECK(frequency IN ('once', 'daily', 'weekly', 'weekdays', 'weekends')),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
    notify_on_wake INTEGER NOT NULL DEFAULT 1 CHECK(notify_on_wake IN (0, 1)),
    timezone TEXT NOT NULL DEFAULT 'UTC',
    last_triggered DATETIME,
    next_trigger DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

const POSTGRES_CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS host_wake_schedules (
    id VARCHAR(64) PRIMARY KEY,
    host_fqn VARCHAR(512) NOT NULL,
    host_name VARCHAR(255) NOT NULL,
    host_mac VARCHAR(17) NOT NULL,
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    frequency VARCHAR(16) NOT NULL CHECK(frequency IN ('once', 'daily', 'weekly', 'weekdays', 'weekends')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    notify_on_wake BOOLEAN NOT NULL DEFAULT true,
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    last_triggered TIMESTAMP WITH TIME ZONE,
    next_trigger TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  )
`;

const CREATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_host_wake_schedules_host_fqn ON host_wake_schedules(host_fqn)',
  'CREATE INDEX IF NOT EXISTS idx_host_wake_schedules_next_trigger ON host_wake_schedules(next_trigger)',
  'CREATE INDEX IF NOT EXISTS idx_host_wake_schedules_enabled ON host_wake_schedules(enabled)',
];

function toIsoString(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function toBoolean(value: boolean | number): boolean {
  if (typeof value === 'boolean') return value;
  return value === 1;
}

function mapRow(row: HostScheduleRow): HostWakeSchedule {
  return {
    id: row.id,
    hostFqn: row.host_fqn,
    hostName: row.host_name,
    hostMac: row.host_mac,
    scheduledTime: toIsoString(row.scheduled_time) ?? new Date(row.scheduled_time).toISOString(),
    frequency: row.frequency,
    enabled: toBoolean(row.enabled),
    notifyOnWake: toBoolean(row.notify_on_wake),
    timezone: row.timezone,
    createdAt: toIsoString(row.created_at) ?? new Date(row.created_at).toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date(row.updated_at).toISOString(),
    ...(toIsoString(row.last_triggered) ? { lastTriggered: toIsoString(row.last_triggered) } : {}),
    ...(toIsoString(row.next_trigger) ? { nextTrigger: toIsoString(row.next_trigger) } : {}),
  };
}

function normalizeFrequency(raw: string): ScheduleFrequency {
  return raw as ScheduleFrequency;
}

function computeNextTrigger(
  scheduledTimeIso: string,
  frequency: ScheduleFrequency,
  enabled: boolean,
): string | null {
  if (!enabled) return null;

  const scheduledTime = new Date(scheduledTimeIso);
  if (Number.isNaN(scheduledTime.getTime())) {
    return null;
  }

  const now = new Date();

  if (frequency === 'once') {
    return scheduledTime > now ? scheduledTime.toISOString() : null;
  }

  const buildCandidate = (base: Date): Date => {
    const candidate = new Date(base);
    candidate.setUTCHours(
      scheduledTime.getUTCHours(),
      scheduledTime.getUTCMinutes(),
      scheduledTime.getUTCSeconds(),
      0,
    );
    return candidate;
  };

  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  if (frequency === 'daily') {
    const candidate = buildCandidate(today);
    if (candidate <= now) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    return candidate.toISOString();
  }

  if (frequency === 'weekly') {
    const targetDay = scheduledTime.getUTCDay();
    const candidate = buildCandidate(today);
    const currentDay = candidate.getUTCDay();
    let deltaDays = (targetDay - currentDay + 7) % 7;
    if (deltaDays === 0 && candidate <= now) {
      deltaDays = 7;
    }
    candidate.setUTCDate(candidate.getUTCDate() + deltaDays);
    return candidate.toISOString();
  }

  const weekdaySet = frequency === 'weekdays'
    ? new Set([1, 2, 3, 4, 5])
    : new Set([0, 6]);

  const candidate = buildCandidate(today);
  for (let i = 0; i < 8; i += 1) {
    const day = candidate.getUTCDay();
    const isTargetDay = weekdaySet.has(day);
    if (isTargetDay && candidate > now) {
      return candidate.toISOString();
    }
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }

  return null;
}

export class HostScheduleModel {
  private static tableReady: Promise<void> | null = null;

  static async ensureTable(): Promise<void> {
    if (!this.tableReady) {
      this.tableReady = this.createTable().catch((error) => {
        this.tableReady = null;
        throw error;
      });
    }

    await this.tableReady;
  }

  private static async createTable(): Promise<void> {
    const createTableStatement = isSqlite ? SQLITE_CREATE_TABLE : POSTGRES_CREATE_TABLE;
    await db.query(createTableStatement);

    for (const statement of CREATE_INDEXES) {
      await db.query(statement);
    }
  }

  static async listByHostFqn(hostFqn: string): Promise<HostWakeSchedule[]> {
    await this.ensureTable();
    const result = await db.query<HostScheduleRow>(
      `SELECT *
       FROM host_wake_schedules
       WHERE host_fqn = $1
       ORDER BY created_at DESC`,
      [hostFqn],
    );

    return result.rows.map(mapRow);
  }

  static async findById(id: string): Promise<HostWakeSchedule | null> {
    await this.ensureTable();
    const result = await db.query<HostScheduleRow>(
      'SELECT * FROM host_wake_schedules WHERE id = $1',
      [id],
    );

    if (!result.rows.length) {
      return null;
    }

    return mapRow(result.rows[0]);
  }

  static async create(input: CreateHostScheduleInput): Promise<HostWakeSchedule> {
    await this.ensureTable();

    const id = randomUUID();
    const frequency = normalizeFrequency(input.frequency);
    const nextTrigger = computeNextTrigger(input.scheduledTime, frequency, input.enabled);

    if (isSqlite) {
      await db.query(
        `INSERT INTO host_wake_schedules
          (id, host_fqn, host_name, host_mac, scheduled_time, frequency, enabled, notify_on_wake, timezone, next_trigger)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          input.hostFqn,
          input.hostName,
          input.hostMac,
          input.scheduledTime,
          frequency,
          input.enabled ? 1 : 0,
          input.notifyOnWake ? 1 : 0,
          input.timezone,
          nextTrigger,
        ],
      );
    } else {
      await db.query(
        `INSERT INTO host_wake_schedules
          (id, host_fqn, host_name, host_mac, scheduled_time, frequency, enabled, notify_on_wake, timezone, next_trigger)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          input.hostFqn,
          input.hostName,
          input.hostMac,
          input.scheduledTime,
          frequency,
          input.enabled,
          input.notifyOnWake,
          input.timezone,
          nextTrigger,
        ],
      );
    }

    const created = await this.findById(id);
    if (!created) {
      throw new Error('Failed to create schedule');
    }

    return created;
  }

  static async update(id: string, updates: UpdateHostScheduleInput): Promise<HostWakeSchedule | null> {
    await this.ensureTable();

    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const nextValues = {
      scheduledTime: updates.scheduledTime ?? existing.scheduledTime,
      frequency: updates.frequency ?? existing.frequency,
      enabled: updates.enabled ?? existing.enabled,
      notifyOnWake: updates.notifyOnWake ?? existing.notifyOnWake,
      timezone: updates.timezone ?? existing.timezone,
    };

    const nextTrigger = computeNextTrigger(
      nextValues.scheduledTime,
      nextValues.frequency,
      nextValues.enabled,
    );

    if (isSqlite) {
      await db.query(
        `UPDATE host_wake_schedules
         SET scheduled_time = $2,
             frequency = $3,
             enabled = $4,
             notify_on_wake = $5,
             timezone = $6,
             next_trigger = $7,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [
          id,
          nextValues.scheduledTime,
          nextValues.frequency,
          nextValues.enabled ? 1 : 0,
          nextValues.notifyOnWake ? 1 : 0,
          nextValues.timezone,
          nextTrigger,
        ],
      );
    } else {
      await db.query(
        `UPDATE host_wake_schedules
         SET scheduled_time = $2,
             frequency = $3,
             enabled = $4,
             notify_on_wake = $5,
             timezone = $6,
             next_trigger = $7,
             updated_at = NOW()
         WHERE id = $1`,
        [
          id,
          nextValues.scheduledTime,
          nextValues.frequency,
          nextValues.enabled,
          nextValues.notifyOnWake,
          nextValues.timezone,
          nextTrigger,
        ],
      );
    }

    return this.findById(id);
  }

  static async delete(id: string): Promise<boolean> {
    await this.ensureTable();
    const result = await db.query('DELETE FROM host_wake_schedules WHERE id = $1', [id]);
    return result.rowCount > 0;
  }
}

export default HostScheduleModel;
