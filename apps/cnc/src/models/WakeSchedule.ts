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

    const result = await db.query<WakeScheduleRow>(query, [
      scheduleId,
      ownerSub,
      input.hostFqn,
      input.hostName,
      input.hostMac,
      input.scheduledTime,
      input.timezone ?? 'UTC',
      input.frequency,
      asDbBoolean(input.enabled ?? true),
      asDbBoolean(input.notifyOnWake ?? true),
      input.nextTrigger ?? null,
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
    if (updates.nextTrigger !== undefined) setField('next_trigger', updates.nextTrigger);
    if (updates.lastTriggered !== undefined) setField('last_triggered', updates.lastTriggered);

    if (!assignments.length) {
      return this.findById(ownerSub, id);
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
}

export default WakeScheduleModel;
