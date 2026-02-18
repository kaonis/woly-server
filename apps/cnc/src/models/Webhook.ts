import { randomUUID } from 'crypto';
import { webhookEventTypeSchema } from '@kaonis/woly-protocol';
import type { WebhookEventType } from '@kaonis/woly-protocol';
import db from '../database/connection';
import logger from '../utils/logger';
import type { WebhookDeliveryLog, WebhookSubscription } from '../types';

type WebhookRow = {
  id: string;
  url: string;
  events: unknown;
  secret: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type WebhookDeliveryLogRow = {
  id: number | string;
  webhookId: string;
  eventType: string;
  attempt: number | string;
  status: string;
  responseStatus: number | string | null;
  error: string | null;
  payload: unknown;
  createdAt: string | Date;
};

export interface CreateWebhookInput {
  url: string;
  events: WebhookEventType[];
  secret?: string;
}

export interface WebhookTarget {
  id: string;
  url: string;
  events: WebhookEventType[];
  secret: string | null;
}

export interface RecordWebhookDeliveryInput {
  webhookId: string;
  eventType: WebhookEventType;
  attempt: number;
  status: 'success' | 'failed';
  responseStatus: number | null;
  error: string | null;
  payload: Record<string, unknown>;
}

const SQLITE_CREATE_WEBHOOKS_TABLE = `
  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    events TEXT NOT NULL,
    secret TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

const POSTGRES_CREATE_WEBHOOKS_TABLE = `
  CREATE TABLE IF NOT EXISTS webhooks (
    id VARCHAR(255) PRIMARY KEY,
    url TEXT NOT NULL,
    events JSONB NOT NULL,
    secret TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`;

const SQLITE_CREATE_WEBHOOK_DELIVERY_LOGS_TABLE = `
  CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    attempt INTEGER NOT NULL CHECK(attempt >= 1),
    status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
    response_status INTEGER,
    error TEXT,
    payload TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
  )
`;

const POSTGRES_CREATE_WEBHOOK_DELIVERY_LOGS_TABLE = `
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
  )
`;

export class WebhookModel {
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
    const isSqlite = db.isSqlite;

    await db.query(isSqlite ? SQLITE_CREATE_WEBHOOKS_TABLE : POSTGRES_CREATE_WEBHOOKS_TABLE);
    await db.query(
      isSqlite ? SQLITE_CREATE_WEBHOOK_DELIVERY_LOGS_TABLE : POSTGRES_CREATE_WEBHOOK_DELIVERY_LOGS_TABLE
    );
    await db.query('CREATE INDEX IF NOT EXISTS idx_webhooks_created_at ON webhooks(created_at)');
    await db.query(
      'CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_webhook_id ON webhook_delivery_logs(webhook_id)'
    );
    await db.query(
      'CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_created_at ON webhook_delivery_logs(created_at)'
    );
  }

  private static parseEvents(value: unknown): WebhookEventType[] {
    let rawValues: unknown[] = [];

    if (Array.isArray(value)) {
      rawValues = value;
    } else if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (Array.isArray(parsed)) {
          rawValues = parsed;
        }
      } catch (error) {
        logger.warn('Failed to parse webhook events JSON', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const events = rawValues
      .map((candidate) => webhookEventTypeSchema.safeParse(candidate))
      .filter((result): result is { success: true; data: WebhookEventType } => result.success)
      .map((result) => result.data);

    return Array.from(new Set(events));
  }

  private static parsePayload(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    if (typeof value !== 'string') {
      return {};
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (error) {
      logger.warn('Failed to parse webhook delivery payload JSON', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {};
  }

  private static normalizeIsoDate(value: string | Date): string {
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }

    return parsed.toISOString();
  }

  private static mapWebhookRow(row: WebhookRow): WebhookSubscription {
    return {
      id: row.id,
      url: row.url,
      events: this.parseEvents(row.events),
      hasSecret: typeof row.secret === 'string' && row.secret.length > 0,
      createdAt: this.normalizeIsoDate(row.createdAt),
      updatedAt: this.normalizeIsoDate(row.updatedAt),
    };
  }

  private static mapWebhookTarget(row: WebhookRow): WebhookTarget {
    return {
      id: row.id,
      url: row.url,
      events: this.parseEvents(row.events),
      secret: row.secret,
    };
  }

  private static mapWebhookDeliveryLogRow(row: WebhookDeliveryLogRow): WebhookDeliveryLog {
    return {
      id: typeof row.id === 'string' ? Number.parseInt(row.id, 10) : row.id,
      webhookId: row.webhookId,
      eventType: webhookEventTypeSchema.parse(row.eventType),
      attempt: typeof row.attempt === 'string' ? Number.parseInt(row.attempt, 10) : row.attempt,
      status: row.status === 'success' ? 'success' : 'failed',
      responseStatus:
        row.responseStatus === null
          ? null
          : typeof row.responseStatus === 'string'
            ? Number.parseInt(row.responseStatus, 10)
            : row.responseStatus,
      error: row.error,
      payload: this.parsePayload(row.payload),
      createdAt: this.normalizeIsoDate(row.createdAt),
    };
  }

  static async create(input: CreateWebhookInput): Promise<WebhookSubscription> {
    await this.ensureTable();

    const id = randomUUID();
    const eventsJson = JSON.stringify(input.events);
    const secret = input.secret ?? null;
    const isSqlite = db.isSqlite;

    const result = await db.query<WebhookRow>(
      isSqlite
        ? `INSERT INTO webhooks (id, url, events, secret)
           VALUES ($1, $2, $3, $4)
           RETURNING id, url, events, secret, created_at as "createdAt", updated_at as "updatedAt"`
        : `INSERT INTO webhooks (id, url, events, secret)
           VALUES ($1, $2, $3::jsonb, $4)
           RETURNING id, url, events, secret, created_at as "createdAt", updated_at as "updatedAt"`,
      [id, input.url, eventsJson, secret],
    );

    return this.mapWebhookRow(result.rows[0]);
  }

  static async list(): Promise<WebhookSubscription[]> {
    await this.ensureTable();

    const result = await db.query<WebhookRow>(
      `SELECT
        id,
        url,
        events,
        secret,
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM webhooks
       ORDER BY created_at DESC`,
    );

    return result.rows.map((row) => this.mapWebhookRow(row));
  }

  static async findById(id: string): Promise<WebhookSubscription | null> {
    await this.ensureTable();

    const result = await db.query<WebhookRow>(
      `SELECT
        id,
        url,
        events,
        secret,
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM webhooks
       WHERE id = $1`,
      [id],
    );

    const row = result.rows[0];
    return row ? this.mapWebhookRow(row) : null;
  }

  static async listTargetsByEvent(eventType: WebhookEventType): Promise<WebhookTarget[]> {
    await this.ensureTable();

    const result = await db.query<WebhookRow>(
      `SELECT
        id,
        url,
        events,
        secret,
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM webhooks`,
    );

    return result.rows
      .map((row) => this.mapWebhookTarget(row))
      .filter((target) => target.events.includes(eventType));
  }

  static async delete(id: string): Promise<boolean> {
    await this.ensureTable();

    const result = await db.query('DELETE FROM webhooks WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  static async recordDelivery(input: RecordWebhookDeliveryInput): Promise<void> {
    await this.ensureTable();

    const payloadJson = JSON.stringify(input.payload);
    const isSqlite = db.isSqlite;

    await db.query(
      isSqlite
        ? `INSERT INTO webhook_delivery_logs
            (webhook_id, event_type, attempt, status, response_status, error, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`
        : `INSERT INTO webhook_delivery_logs
            (webhook_id, event_type, attempt, status, response_status, error, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        input.webhookId,
        input.eventType,
        input.attempt,
        input.status,
        input.responseStatus,
        input.error,
        payloadJson,
      ],
    );
  }

  static async listDeliveries(webhookId: string, limit = 100): Promise<WebhookDeliveryLog[]> {
    await this.ensureTable();

    const normalizedLimit = Math.max(1, Math.min(limit, 500));
    const result = await db.query<WebhookDeliveryLogRow>(
      `SELECT
        id,
        webhook_id as "webhookId",
        event_type as "eventType",
        attempt,
        status,
        response_status as "responseStatus",
        error,
        payload,
        created_at as "createdAt"
       FROM webhook_delivery_logs
       WHERE webhook_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [webhookId, normalizedLimit],
    );

    return result.rows.map((row) => this.mapWebhookDeliveryLogRow(row));
  }
}

export default WebhookModel;
