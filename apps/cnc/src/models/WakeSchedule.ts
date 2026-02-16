import { randomUUID } from 'crypto';
import type {
  CreateWakeScheduleRequest,
  UpdateWakeScheduleRequest,
  WakeSchedule,
  ScheduleFrequency,
} from '@kaonis/woly-protocol';
import db from '../database/connection';
import logger from '../utils/logger';

interface WakeScheduleRow {
  id: string;
  owner_sub: string;
  host_fqn: string;
  host_name: string;
  host_mac: string;
  scheduled_time: string | Date;
  timezone: string;
  frequency: ScheduleFrequency;
  enabled: boolean | number;
  notify_on_wake: boolean | number;
  created_at: string | Date;
  updated_at: string | Date;
  last_triggered: string | Date | null;
  next_trigger: string | Date | null;
}

const isSqlite = db.isSqlite;

function computeNextTrigger(
  scheduledTimeIso: string,
  frequency: ScheduleFrequency,
  enabled: boolean,
  referenceNow: Date = new Date(),
): string | null {
  if (!enabled) {
    return null;
  }

  const scheduledTime = new Date(scheduledTimeIso);
  if (Number.isNaN(scheduledTime.getTime())) {
    return null;
  }

  if (frequency === 'once') {
    return scheduledTime > referenceNow ? scheduledTime.toISOString() : null;
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

  const today = new Date(referenceNow);
  today.setUTCHours(0, 0, 0, 0);

  if (frequency === 'daily') {
    const candidate = buildCandidate(today);
    if (candidate <= referenceNow) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    return candidate.toISOString();
  }

  if (frequency === 'weekly') {
    const targetDay = scheduledTime.getUTCDay();
    const candidate = buildCandidate(today);
    const currentDay = candidate.getUTCDay();
    let deltaDays = (targetDay - currentDay + 7) % 7;
    if (deltaDays === 0 && candidate <= referenceNow) {
      deltaDays = 7;
    }
    candidate.setUTCDate(candidate.getUTCDate() + deltaDays);
    return candidate.toISOString();
  }

  const daySet = frequency === 'weekdays'
    ? new Set([1, 2, 3, 4, 5])
    : new Set([0, 6]);

  const candidate = buildCandidate(today);
  for (let i = 0; i < 8; i += 1) {
    if (daySet.has(candidate.getUTCDay()) && candidate > referenceNow) {
      return candidate.toISOString();
    }
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }

  return null;
}

function toBoolean(value: boolean | number): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return value !== 0;
}

function toIsoString(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid timestamp from database: ${String(value)}`);
  }
  return parsed.toISOString();
}

function toNullableIsoString(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }
  return toIsoString(value);
}

function asDbBoolean(value: boolean): boolean | number {
  return isSqlite ? (value ? 1 : 0) : value;
}

function rowToRecord(row: WakeScheduleRow): WakeSchedule {
  return {
    id: String(row.id),
    hostName: String(row.host_name),
    hostMac: String(row.host_mac),
    hostFqn: String(row.host_fqn),
    scheduledTime: toIsoString(row.scheduled_time),
    timezone: String(row.timezone),
    frequency: row.frequency,
    enabled: toBoolean(row.enabled),
    notifyOnWake: toBoolean(row.notify_on_wake),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    lastTriggered: toNullableIsoString(row.last_triggered),
    nextTrigger: toNullableIsoString(row.next_trigger),
  };
}

export class WakeScheduleModel {
  static async create(ownerSub: string, input: CreateWakeScheduleRequest): Promise<WakeSchedule> {
    const query = `
      INSERT INTO wake_schedules (
        id,
        owner_sub,
        host_fqn,
        host_name,
        host_mac,
        scheduled_time,
        timezone,
        frequency,
        enabled,
        notify_on_wake,
        next_trigger
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const scheduleId = randomUUID();

    const enabled = input.enabled ?? true;
    const nextTrigger = input.nextTrigger ?? computeNextTrigger(
      input.scheduledTime,
      input.frequency,
      enabled,
    );

    const result = await db.query<WakeScheduleRow>(query, [
      scheduleId,
      ownerSub,
      input.hostFqn,
      input.hostName,
      input.hostMac,
      input.scheduledTime,
      input.timezone ?? 'UTC',
      input.frequency,
      asDbBoolean(enabled),
      asDbBoolean(input.notifyOnWake ?? true),
      nextTrigger,
    ]);

    if (!result.rows.length) {
      throw new Error('Failed to create wake schedule');
    }

    return rowToRecord(result.rows[0]);
  }

  static async list(ownerSub: string, hostFqn?: string): Promise<WakeSchedule[]> {
    const result = hostFqn
      ? await db.query<WakeScheduleRow>(
          `
            SELECT *
            FROM wake_schedules
            WHERE owner_sub = $1 AND host_fqn = $2
            ORDER BY created_at DESC
          `,
          [ownerSub, hostFqn],
        )
      : await db.query<WakeScheduleRow>(
          `
            SELECT *
            FROM wake_schedules
            WHERE owner_sub = $1
            ORDER BY created_at DESC
          `,
          [ownerSub],
        );

    return result.rows.map(rowToRecord);
  }

  static async findById(ownerSub: string, id: string): Promise<WakeSchedule | null> {
    const result = await db.query<WakeScheduleRow>(
      `
        SELECT *
        FROM wake_schedules
        WHERE owner_sub = $1 AND id = $2
        LIMIT 1
      `,
      [ownerSub, id],
    );

    if (!result.rows.length) {
      return null;
    }

    return rowToRecord(result.rows[0]);
  }

  static async update(
    ownerSub: string,
    id: string,
    updates: UpdateWakeScheduleRequest,
  ): Promise<WakeSchedule | null> {
    const existing = await this.findById(ownerSub, id);
    if (!existing) {
      return null;
    }

    const nextEnabled = updates.enabled ?? existing.enabled;
    const nextScheduledTime = updates.scheduledTime ?? existing.scheduledTime;
    const nextFrequency = updates.frequency ?? existing.frequency;
    const nextTrigger = updates.nextTrigger !== undefined
      ? updates.nextTrigger
      : (
        updates.enabled !== undefined ||
        updates.scheduledTime !== undefined ||
        updates.frequency !== undefined
      )
        ? computeNextTrigger(nextScheduledTime, nextFrequency, nextEnabled)
        : undefined;

    const assignments: string[] = [];
    const params: unknown[] = [];
    let index = 1;

    const setField = (column: string, value: unknown): void => {
      assignments.push(`${column} = $${index}`);
      params.push(value);
      index += 1;
    };

    if (updates.hostFqn !== undefined) setField('host_fqn', updates.hostFqn);
    if (updates.hostName !== undefined) setField('host_name', updates.hostName);
    if (updates.hostMac !== undefined) setField('host_mac', updates.hostMac);
    if (updates.scheduledTime !== undefined) setField('scheduled_time', updates.scheduledTime);
    if (updates.timezone !== undefined) setField('timezone', updates.timezone);
    if (updates.frequency !== undefined) setField('frequency', updates.frequency);
    if (updates.enabled !== undefined) setField('enabled', asDbBoolean(updates.enabled));
    if (updates.notifyOnWake !== undefined) {
      setField('notify_on_wake', asDbBoolean(updates.notifyOnWake));
    }
    if (nextTrigger !== undefined) setField('next_trigger', nextTrigger);
    if (updates.lastTriggered !== undefined) setField('last_triggered', updates.lastTriggered);

    if (!assignments.length) {
      return existing;
    }

    assignments.push(`updated_at = ${isSqlite ? 'CURRENT_TIMESTAMP' : 'NOW()'}`);
    const ownerSubPlaceholder = `$${index}`;
    params.push(ownerSub);
    index += 1;
    const idPlaceholder = `$${index}`;
    params.push(id);

    if (isSqlite) {
      const updateQuery = `
        UPDATE wake_schedules
        SET ${assignments.join(', ')}
        WHERE owner_sub = ${ownerSubPlaceholder} AND id = ${idPlaceholder}
      `;

      const updateResult = await db.query(updateQuery, params);
      if (updateResult.rowCount === 0) {
        return null;
      }

      return this.findById(ownerSub, id);
    }

    const query = `
      UPDATE wake_schedules
      SET ${assignments.join(', ')}
      WHERE owner_sub = ${ownerSubPlaceholder} AND id = ${idPlaceholder}
      RETURNING *
    `;

    const result = await db.query<WakeScheduleRow>(query, params);

    if (!result.rows.length) {
      return null;
    }

    return rowToRecord(result.rows[0]);
  }

  static async delete(ownerSub: string, id: string): Promise<boolean> {
    const result = await db.query(
      `
        DELETE FROM wake_schedules
        WHERE owner_sub = $1 AND id = $2
      `,
      [ownerSub, id],
    );

    if (result.rowCount > 0) {
      logger.info('Wake schedule deleted', { ownerSub, scheduleId: id });
    }

    return result.rowCount > 0;
  }

  static async listDue(limit = 25, nowIso = new Date().toISOString()): Promise<WakeSchedule[]> {
    const enabledPredicate = isSqlite ? 'enabled = 1' : 'enabled = true';
    const result = await db.query<WakeScheduleRow>(
      `
        SELECT *
        FROM wake_schedules
        WHERE ${enabledPredicate}
          AND next_trigger IS NOT NULL
          AND next_trigger <= $1
        ORDER BY next_trigger ASC
        LIMIT $2
      `,
      [nowIso, limit],
    );

    return result.rows.map(rowToRecord);
  }

  static async recordExecutionAttempt(
    id: string,
    attemptedAtIso = new Date().toISOString(),
  ): Promise<WakeSchedule | null> {
    const current = await this.findByIdByScheduleId(id);
    if (!current) {
      return null;
    }

    const shouldRemainEnabled = current.enabled && current.frequency !== 'once';
    const referenceNow = new Date(attemptedAtIso);
    const nextTrigger = shouldRemainEnabled
      ? computeNextTrigger(
        current.scheduledTime,
        current.frequency,
        true,
        Number.isNaN(referenceNow.getTime()) ? new Date() : referenceNow,
      )
      : null;

    if (isSqlite) {
      await db.query(
        `
          UPDATE wake_schedules
          SET enabled = $1,
              last_triggered = $2,
              next_trigger = $3,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
        `,
        [shouldRemainEnabled ? 1 : 0, attemptedAtIso, nextTrigger, id],
      );
    } else {
      await db.query(
        `
          UPDATE wake_schedules
          SET enabled = $1,
              last_triggered = $2,
              next_trigger = $3,
              updated_at = NOW()
          WHERE id = $4
        `,
        [shouldRemainEnabled, attemptedAtIso, nextTrigger, id],
      );
    }

    return this.findByIdByScheduleId(id);
  }

  private static async findByIdByScheduleId(id: string): Promise<WakeSchedule | null> {
    const result = await db.query<WakeScheduleRow>(
      `
        SELECT *
        FROM wake_schedules
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    if (!result.rows.length) {
      return null;
    }

    return rowToRecord(result.rows[0]);
  }
}

export default WakeScheduleModel;
