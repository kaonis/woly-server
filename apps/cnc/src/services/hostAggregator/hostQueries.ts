import db from '../../database/connection';
import { logger } from '../../utils/logger';
import type {
  AggregatedHost,
  Host,
  HostStatusHistoryEntry,
  HostUptimeSummary,
} from '../../types';

type HostStatus = Host['status'];

type HostStatusHistoryRow = {
  hostFqn: string;
  oldStatus: HostStatus;
  newStatus: HostStatus;
  changedAt: string | Date;
};

type AggregatedHostRowRaw = AggregatedHost & {
  secondaryMacs?: unknown;
  tags?: unknown;
  powerControl?: unknown;
  openPorts?: unknown;
  portsScannedAt?: unknown;
  portsExpireAt?: unknown;
};

type HostPort = NonNullable<Host['openPorts']>[number];

export interface HostQueriesContext {
  isSqlite: boolean;
  historyLimitDefault: number;
  historyLimitMax: number;
  portScanCacheTtlMs: number;
  hostSelectColumns: string;
  ensureHostMetadataColumns: () => Promise<void>;
  normalizeHost: (row: AggregatedHostRowRaw) => AggregatedHost;
  normalizeDateValue: (value: unknown) => string | null;
  mapStatusHistoryRow: (row: HostStatusHistoryRow) => HostStatusHistoryEntry | null;
  parsePeriodToMs: (rawPeriod: string) => number | null;
  getHostByFQN: (fullyQualifiedName: string) => Promise<AggregatedHost | null>;
  getHostStatusHistory: (
    fullyQualifiedName: string,
    options?: { from?: string; to?: string; limit?: number },
  ) => Promise<HostStatusHistoryEntry[]>;
  serializeOpenPorts: (openPorts: HostPort[] | undefined) => string;
}

export async function getAllHosts(context: HostQueriesContext): Promise<AggregatedHost[]> {
  await context.ensureHostMetadataColumns();
  try {
    const result = await db.query<AggregatedHost>(`
      SELECT
${context.hostSelectColumns}
      FROM aggregated_hosts ah
      ORDER BY ah.fully_qualified_name
    `);

    return result.rows.map((row) => context.normalizeHost(row as AggregatedHostRowRaw));
  } catch (error) {
    logger.error('Failed to get all hosts', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function getHostsByNode(
  context: HostQueriesContext,
  nodeId: string,
): Promise<AggregatedHost[]> {
  await context.ensureHostMetadataColumns();
  try {
    const result = await db.query<AggregatedHost>(
      `SELECT
${context.hostSelectColumns}
      FROM aggregated_hosts ah
      WHERE ah.node_id = $1
      ORDER BY ah.name`,
      [nodeId],
    );

    return result.rows.map((row) => context.normalizeHost(row as AggregatedHostRowRaw));
  } catch (error) {
    logger.error('Failed to get hosts by node', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function getHostByFQN(
  context: HostQueriesContext,
  fullyQualifiedName: string,
): Promise<AggregatedHost | null> {
  await context.ensureHostMetadataColumns();
  try {
    const result = await db.query<AggregatedHost>(
      `SELECT
${context.hostSelectColumns}
      FROM aggregated_hosts ah
      WHERE ah.fully_qualified_name = $1`,
      [fullyQualifiedName],
    );

    const row = result.rows[0];
    return row ? context.normalizeHost(row as AggregatedHostRowRaw) : null;
  } catch (error) {
    logger.error('Failed to get host by FQN', {
      fullyQualifiedName,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function getHostStatusHistory(
  context: HostQueriesContext,
  fullyQualifiedName: string,
  options?: { from?: string; to?: string; limit?: number },
): Promise<HostStatusHistoryEntry[]> {
  await context.ensureHostMetadataColumns();

  const whereClauses = ['host_fqn = $1'];
  const params: unknown[] = [fullyQualifiedName];

  const from = options?.from ? context.normalizeDateValue(options.from) : null;
  const to = options?.to ? context.normalizeDateValue(options.to) : null;

  if (from) {
    params.push(from);
    whereClauses.push(`changed_at >= $${params.length}`);
  }

  if (to) {
    params.push(to);
    whereClauses.push(`changed_at <= $${params.length}`);
  }

  const limitRaw = options?.limit ?? context.historyLimitDefault;
  const limit = Math.max(1, Math.min(limitRaw, context.historyLimitMax));
  params.push(limit);

  try {
    const result = await db.query<HostStatusHistoryRow>(
      `SELECT
        host_fqn as "hostFqn",
        old_status as "oldStatus",
        new_status as "newStatus",
        changed_at as "changedAt"
       FROM host_status_history
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY changed_at ASC
       LIMIT $${params.length}`,
      params,
    );

    return result.rows
      .map((row) => context.mapStatusHistoryRow(row))
      .filter((row): row is HostStatusHistoryEntry => row !== null);
  } catch (error) {
    logger.error('Failed to get host status history', {
      fullyQualifiedName,
      from,
      to,
      limit,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function getHostUptime(
  context: HostQueriesContext,
  fullyQualifiedName: string,
  options?: { period?: string; now?: Date },
): Promise<HostUptimeSummary> {
  await context.ensureHostMetadataColumns();

  const host = await context.getHostByFQN(fullyQualifiedName);
  if (!host) {
    throw new Error(`Host ${fullyQualifiedName} not found`);
  }

  const period = (options?.period ?? '7d').trim().toLowerCase();
  const periodMs = context.parsePeriodToMs(period);
  if (!periodMs) {
    throw new Error(`Invalid period "${period}". Expected format like 7d, 24h, or 30m.`);
  }

  const now = options?.now ?? new Date();
  const to = now.toISOString();
  const fromDate = new Date(now.getTime() - periodMs);
  const from = fromDate.toISOString();

  const history = await context.getHostStatusHistory(fullyQualifiedName, {
    from,
    to,
    limit: context.historyLimitMax,
  });

  const beforeWindowResult = await db.query<HostStatusHistoryRow>(
    `SELECT
      host_fqn as "hostFqn",
      old_status as "oldStatus",
      new_status as "newStatus",
      changed_at as "changedAt"
     FROM host_status_history
     WHERE host_fqn = $1 AND changed_at < $2
     ORDER BY changed_at DESC
     LIMIT 1`,
    [fullyQualifiedName, from],
  );

  const beforeWindow = beforeWindowResult.rows[0]
    ? context.mapStatusHistoryRow(beforeWindowResult.rows[0])
    : null;

  let cursor = fromDate.getTime();
  let statusAtCursor: HostStatus = beforeWindow?.newStatus ?? history[0]?.oldStatus ?? host.status;
  let awakeMs = 0;

  for (const transition of history) {
    const changedAtMs = new Date(transition.changedAt).getTime();
    if (!Number.isFinite(changedAtMs)) {
      continue;
    }

    const boundedChangedAtMs = Math.min(Math.max(changedAtMs, cursor), now.getTime());
    if (statusAtCursor === 'awake') {
      awakeMs += Math.max(0, boundedChangedAtMs - cursor);
    }
    cursor = boundedChangedAtMs;
    statusAtCursor = transition.newStatus;
  }

  if (statusAtCursor === 'awake') {
    awakeMs += Math.max(0, now.getTime() - cursor);
  }

  const totalMs = Math.max(periodMs, 1);
  const asleepMs = Math.max(0, totalMs - awakeMs);
  const uptimePercentage = Number(((awakeMs / totalMs) * 100).toFixed(2));

  return {
    hostFqn: fullyQualifiedName,
    period,
    from,
    to,
    uptimePercentage,
    awakeMs,
    asleepMs,
    transitions: history.length,
    currentStatus: host.status,
  };
}

export async function pruneHostStatusHistory(
  context: HostQueriesContext,
  retentionDays: number,
): Promise<number> {
  await context.ensureHostMetadataColumns();
  if (retentionDays <= 0) {
    return 0;
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const result = await db.query('DELETE FROM host_status_history WHERE changed_at < $1', [cutoff]);
    return result.rowCount || 0;
  } catch (error) {
    logger.error('Failed to prune host status history', {
      retentionDays,
      cutoff,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function saveHostPortScanSnapshot(
  context: HostQueriesContext,
  fullyQualifiedName: string,
  scan: { scannedAt: string; openPorts: HostPort[] },
): Promise<boolean> {
  await context.ensureHostMetadataColumns();
  const scannedAt = context.normalizeDateValue(scan.scannedAt) ?? new Date().toISOString();
  const expiresAt = new Date(new Date(scannedAt).getTime() + context.portScanCacheTtlMs).toISOString();
  const openPorts = context.serializeOpenPorts(scan.openPorts);

  try {
    const result = await db.query(
      `UPDATE aggregated_hosts
       SET open_ports = $1,
           ports_scanned_at = $2,
           ports_expire_at = $3
       WHERE fully_qualified_name = $4`,
      [openPorts, scannedAt, expiresAt, fullyQualifiedName],
    );

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    logger.error('Failed to persist host port scan snapshot', {
      fullyQualifiedName,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function getStats(context: HostQueriesContext): Promise<{
  total: number;
  awake: number;
  asleep: number;
  byLocation: Record<string, { total: number; awake: number }>;
}> {
  await context.ensureHostMetadataColumns();

  try {
    const overallQuery = context.isSqlite
      ? `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'awake' THEN 1 ELSE 0 END) as awake,
          SUM(CASE WHEN status = 'asleep' THEN 1 ELSE 0 END) as asleep
        FROM aggregated_hosts
      `
      : `
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'awake') as awake,
          COUNT(*) FILTER (WHERE status = 'asleep') as asleep
        FROM aggregated_hosts
      `;

    interface OverallStatsRow {
      total: string | number;
      awake: string | number;
      asleep: string | number;
    }

    const overallResult = await db.query<OverallStatsRow>(overallQuery);

    const locationQuery = context.isSqlite
      ? `
        SELECT
          location,
          COUNT(*) as total,
          SUM(CASE WHEN status = 'awake' THEN 1 ELSE 0 END) as awake
        FROM aggregated_hosts
        GROUP BY location
        ORDER BY location
      `
      : `
        SELECT
          location,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'awake') as awake
        FROM aggregated_hosts
        GROUP BY location
        ORDER BY location
      `;

    interface LocationStatsRow {
      location: string;
      total: string | number;
      awake: string | number;
    }

    const locationResult = await db.query<LocationStatsRow>(locationQuery);

    const overall = overallResult.rows[0];
    const byLocation: Record<string, { total: number; awake: number }> = {};
    const parseCount = (value: string | number | null | undefined): number => {
      const parsed = Number.parseInt(String(value ?? '0'), 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    locationResult.rows.forEach((row) => {
      byLocation[row.location] = {
        total: parseCount(row.total),
        awake: parseCount(row.awake),
      };
    });

    if (!overall) {
      return {
        total: 0,
        awake: 0,
        asleep: 0,
        byLocation,
      };
    }

    return {
      total: parseCount(overall.total),
      awake: parseCount(overall.awake),
      asleep: parseCount(overall.asleep),
      byLocation,
    };
  } catch (error) {
    logger.error('Failed to get host stats', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
