import db from '../database/connection';
import logger from '../utils/logger';
import type { CommandRecord, CommandState } from '../types';

// Database row shape for commands table
interface CommandRow {
  id: string;
  node_id: string;
  type: string;
  payload: string | unknown;
  idempotency_key: string | null;
  state: CommandState;
  error: string | null;
  retry_count: number;
  created_at: string | Date;
  updated_at: string | Date;
  sent_at: string | Date | null;
  completed_at: string | Date | null;
}

const isSqlite = db.isSqlite;

function serializePayload(payload: unknown): unknown {
  return isSqlite ? JSON.stringify(payload ?? null) : payload ?? null;
}

function deserializePayload(value: unknown): unknown {
  if (!isSqlite) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function rowToRecord(row: CommandRow): CommandRecord {
  return {
    id: String(row.id),
    nodeId: String(row.node_id),
    type: String(row.type),
    payload: deserializePayload(row.payload),
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
    state: row.state as CommandState,
    error: row.error ? String(row.error) : null,
    retryCount: Number(row.retry_count ?? 0),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    sentAt: row.sent_at ? new Date(row.sent_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  };
}

export class CommandModel {
  static async enqueue(params: {
    id: string;
    nodeId: string;
    type: string;
    payload: unknown;
    idempotencyKey?: string | null;
  }): Promise<CommandRecord> {
    const { id, nodeId, type, payload, idempotencyKey } = params;

    const state: CommandState = 'queued';

    try {
      if (isSqlite) {
        // SQLite: Check first, then insert if not exists
        if (idempotencyKey) {
          const existing = await this.findByIdempotencyKey(nodeId, idempotencyKey);
          if (existing) {
            return existing;
          }
        }

        const query = `
          INSERT INTO commands (id, node_id, type, payload, idempotency_key, state)
          VALUES ($1, $2, $3, $4, $5, $6)
        `;

        await db.query(query, [
          id,
          nodeId,
          type,
          serializePayload(payload),
          idempotencyKey ?? null,
          state,
        ]);

        const inserted = await this.findById(id);
        if (!inserted) {
          throw new Error('Failed to insert command');
        }
        return inserted;
      }

      // PostgreSQL: Use ON CONFLICT for atomic idempotency
      const query = idempotencyKey
        ? `
          INSERT INTO commands (id, node_id, type, payload, idempotency_key, state)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (node_id, idempotency_key) WHERE idempotency_key IS NOT NULL
          DO NOTHING
          RETURNING *
        `
        : `
          INSERT INTO commands (id, node_id, type, payload, idempotency_key, state)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `;

      const result = await db.query<CommandRow>(query, [
        id,
        nodeId,
        type,
        serializePayload(payload),
        idempotencyKey ?? null,
        state,
      ]);

      // If ON CONFLICT triggered (no rows returned), fetch the existing record
      if (result.rows.length === 0 && idempotencyKey) {
        const existing = await this.findByIdempotencyKey(nodeId, idempotencyKey);
        if (!existing) {
          throw new Error('Failed to insert or retrieve existing command');
        }
        return existing;
      }

      return rowToRecord(result.rows[0]);
    } catch (error) {
      // Catch SQLite unique constraint violations and return existing record
      if (isSqlite && error instanceof Error && error.message.includes('UNIQUE constraint')) {
        if (idempotencyKey) {
          const existing = await this.findByIdempotencyKey(nodeId, idempotencyKey);
          if (existing) {
            return existing;
          }
        }
      }

      logger.error('Failed to enqueue command', { error, nodeId, id });
      throw error;
    }
  }

  static async markSent(id: string): Promise<void> {
    const query = isSqlite
      ? `
        UPDATE commands
        SET state = ?, sent_at = CURRENT_TIMESTAMP, retry_count = retry_count + 1
        WHERE id = ?
      `
      : `
        UPDATE commands
        SET state = $2, sent_at = NOW(), retry_count = retry_count + 1
        WHERE id = $1
      `;

    await db.query(query, isSqlite ? ['sent', id] : [id, 'sent']);
  }

  static async markAcknowledged(id: string): Promise<void> {
    const query = isSqlite
      ? `
        UPDATE commands
        SET state = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      : `
        UPDATE commands
        SET state = $2, completed_at = NOW()
        WHERE id = $1
      `;

    await db.query(query, isSqlite ? ['acknowledged', id] : [id, 'acknowledged']);
  }

  static async markFailed(id: string, errorMessage: string): Promise<void> {
    const query = isSqlite
      ? `
        UPDATE commands
        SET state = ?, error = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      : `
        UPDATE commands
        SET state = $2, error = $3, completed_at = NOW()
        WHERE id = $1
      `;

    await db.query(query, isSqlite ? ['failed', errorMessage, id] : [id, 'failed', errorMessage]);
  }

  static async markTimedOut(id: string, errorMessage: string): Promise<void> {
    const query = isSqlite
      ? `
        UPDATE commands
        SET state = ?, error = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      : `
        UPDATE commands
        SET state = $2, error = $3, completed_at = NOW()
        WHERE id = $1
      `;

    await db.query(query, isSqlite ? ['timed_out', errorMessage, id] : [id, 'timed_out', errorMessage]);
  }

  static async findById(id: string): Promise<CommandRecord | null> {
    const result = await db.query<CommandRow>('SELECT * FROM commands WHERE id = $1', [id]);
    if (!result.rows.length) {
      return null;
    }
    return rowToRecord(result.rows[0]);
  }

  static async findByIdempotencyKey(nodeId: string, idempotencyKey: string): Promise<CommandRecord | null> {
    const result = await db.query<CommandRow>(
      'SELECT * FROM commands WHERE node_id = $1 AND idempotency_key = $2 ORDER BY created_at DESC LIMIT 1',
      [nodeId, idempotencyKey]
    );
    if (!result.rows.length) {
      return null;
    }
    return rowToRecord(result.rows[0]);
  }

  static async listRecent(params?: { limit?: number; nodeId?: string | null }): Promise<CommandRecord[]> {
    const limit = params?.limit ?? 50;
    const nodeId = params?.nodeId ?? null;

    if (nodeId) {
      const result = await db.query<CommandRow>(
        'SELECT * FROM commands WHERE node_id = $1 ORDER BY created_at DESC LIMIT $2',
        [nodeId, limit]
      );
      return result.rows.map(rowToRecord);
    }

    const result = await db.query<CommandRow>('SELECT * FROM commands ORDER BY created_at DESC LIMIT $1', [limit]);
    return result.rows.map(rowToRecord);
  }

  static async listQueuedByNode(nodeId: string, params?: { limit?: number }): Promise<CommandRecord[]> {
    const limit = params?.limit ?? 200;
    const result = await db.query<CommandRow>(
      'SELECT * FROM commands WHERE node_id = $1 AND state = $2 ORDER BY created_at ASC LIMIT $3',
      [nodeId, 'queued', limit]
    );
    return result.rows.map(rowToRecord);
  }

  static async reconcileStaleInFlight(timeoutMs: number): Promise<number> {
    // Any command still in sent beyond timeout is timed out.
    // Queued commands are intentionally excluded because offline queueing uses a separate TTL.
    // We treat created_at as the baseline so behavior is deterministic across state changes.
    if (timeoutMs <= 0) {
      return 0;
    }

    const query = isSqlite
      ? `
        UPDATE commands
        SET state = 'timed_out',
            error = COALESCE(error, 'Reconciled as timed_out after restart'),
            completed_at = CURRENT_TIMESTAMP
        WHERE state IN ('sent')
          AND datetime(created_at) < datetime('now', '-' || $1 || ' seconds')
      `
      : `
        UPDATE commands
        SET state = 'timed_out',
            error = COALESCE(error, 'Reconciled as timed_out after restart'),
            completed_at = NOW()
        WHERE state IN ('sent')
          AND created_at < NOW() - ($1 || ' seconds')::INTERVAL
      `;

    const timeoutSeconds = Math.floor(timeoutMs / 1000);
    const result = await db.query(query, [timeoutSeconds]);
    return typeof result.rowCount === 'number' ? result.rowCount : 0;
  }

  static async pruneOldCommands(retentionDays: number): Promise<number> {
    // Remove commands older than retentionDays
    if (retentionDays <= 0) {
      return 0;
    }

    const query = isSqlite
      ? `
        DELETE FROM commands
        WHERE datetime(created_at) < datetime('now', '-' || $1 || ' days')
      `
      : `
        DELETE FROM commands
        WHERE created_at < NOW() - ($1 || ' days')::INTERVAL
      `;

    const result = await db.query(query, [retentionDays]);
    return typeof result.rowCount === 'number' ? result.rowCount : 0;
  }
}

export default CommandModel;
