import { hostPowerControlSchema } from '@kaonis/woly-protocol';
import db from '../../database/connection';
import { logger } from '../../utils/logger';
import type { Host, AggregatedHost, HostStatusHistoryEntry } from '../../types';

export type HostPort = NonNullable<Host['openPorts']>[number];
export type HostStatus = Host['status'];
export type AggregatedHostRow = AggregatedHost & { id: number };
export type AggregatedHostRowRaw = AggregatedHost & {
  secondaryMacs?: unknown;
  tags?: unknown;
  powerControl?: unknown;
  openPorts?: unknown;
  portsScannedAt?: unknown;
  portsExpireAt?: unknown;
};
export type HostStatusHistoryRow = {
  hostFqn: string;
  oldStatus: HostStatus;
  newStatus: HostStatus;
  changedAt: string | Date;
};

export const PORT_SCAN_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
export const HISTORY_LIMIT_DEFAULT = 500;
export const HISTORY_LIMIT_MAX = 5_000;

export const HOST_SELECT_COLUMNS = `
        ah.node_id as "nodeId",
        ah.name,
        ah.mac,
        ah.secondary_macs as "secondaryMacs",
        ah.ip,
        ah.status,
        ah.last_seen as "lastSeen",
        ah.notes,
        ah.tags,
        ah.power_config as "powerControl",
        ah.open_ports as "openPorts",
        ah.ports_scanned_at as "portsScannedAt",
        ah.ports_expire_at as "portsExpireAt",
        ah.location,
        ah.fully_qualified_name as "fullyQualifiedName",
        ah.discovered,
        ah.ping_responsive as "pingResponsive",
        ah.created_at as "createdAt",
        ah.updated_at as "updatedAt"
`;

const HOST_SELECT_COLUMNS_WITH_ID = `
        ah.id,${HOST_SELECT_COLUMNS}
`;

export class HostStore {
  public readonly isSqlite = db.isSqlite;
  private metadataColumnsReady: Promise<void> | null = null;

  constructor(
    private readonly emitEvent: (eventName: string, payload: Record<string, unknown>) => void,
  ) {}

  private parseTags(value: unknown, hostName: string): string[] {
    if (Array.isArray(value)) {
      return value.filter((tag): tag is string => typeof tag === 'string');
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((tag): tag is string => typeof tag === 'string');
      }
    } catch (error) {
      logger.warn('Failed to parse aggregated host tags; defaulting to empty list', {
        hostName,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return [];
  }

  private serializeTags(tags: string[] | undefined): string {
    if (!tags || tags.length === 0) {
      return '[]';
    }

    return JSON.stringify(tags);
  }

  private parsePowerControl(value: unknown, hostName: string): Host['powerControl'] | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    let parsed: unknown = value;
    if (typeof value === 'string') {
      if (value.trim().length === 0) {
        return undefined;
      }
      try {
        parsed = JSON.parse(value) as unknown;
      } catch (error) {
        logger.warn('Failed to parse aggregated host power control metadata; defaulting to undefined', {
          hostName,
          error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      }
    }

    if (parsed === null) {
      return null;
    }

    const validation = hostPowerControlSchema.safeParse(parsed);
    if (!validation.success) {
      logger.warn('Aggregated host power control metadata failed validation; defaulting to undefined', {
        hostName,
      });
      return undefined;
    }

    return validation.data;
  }

  private serializePowerControl(value: Host['powerControl'] | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    return JSON.stringify(value);
  }

  private parseSecondaryMacs(value: unknown, hostName: string, primaryMac: string): string[] {
    if (Array.isArray(value)) {
      return this.normalizeSecondaryMacs(
        value.filter((entry): entry is string => typeof entry === 'string'),
        primaryMac,
      );
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return this.normalizeSecondaryMacs(
          parsed.filter((entry): entry is string => typeof entry === 'string'),
          primaryMac,
        );
      }
    } catch (error) {
      logger.warn('Failed to parse aggregated host secondary MACs; defaulting to empty list', {
        hostName,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return [];
  }

  private normalizeSecondaryMacs(secondaryMacs: string[] | undefined, primaryMac: string): string[] {
    if (!secondaryMacs || secondaryMacs.length === 0) {
      return [];
    }

    const normalizedPrimary = primaryMac.trim().toUpperCase().replace(/-/g, ':');
    const deduped = new Set<string>();
    for (const candidate of secondaryMacs) {
      if (typeof candidate !== 'string' || candidate.trim().length === 0) {
        continue;
      }
      const normalized = candidate.trim().toUpperCase().replace(/-/g, ':');
      if (normalized !== normalizedPrimary) {
        deduped.add(normalized);
      }
    }

    return Array.from(deduped);
  }

  private serializeSecondaryMacs(secondaryMacs: string[] | undefined, primaryMac: string): string {
    return JSON.stringify(this.normalizeSecondaryMacs(secondaryMacs, primaryMac));
  }

  private parseOpenPorts(value: unknown, hostName: string): HostPort[] {
    const normalizePortEntries = (entries: unknown[]): HostPort[] =>
      entries
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const candidate = entry as { port?: unknown; protocol?: unknown; service?: unknown };
          if (typeof candidate.port !== 'number' || !Number.isInteger(candidate.port)) {
            return null;
          }

          const port = candidate.port;
          if (port < 1 || port > 65535) {
            return null;
          }
          if (candidate.protocol !== 'tcp') {
            return null;
          }
          if (typeof candidate.service !== 'string' || candidate.service.trim().length === 0) {
            return null;
          }

          return {
            port,
            protocol: 'tcp' as const,
            service: candidate.service,
          };
        })
        .filter((entry): entry is HostPort => entry !== null);

    if (Array.isArray(value)) {
      return normalizePortEntries(value);
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return normalizePortEntries(parsed);
      }
    } catch (error) {
      logger.warn('Failed to parse aggregated host open ports; defaulting to empty list', {
        hostName,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return [];
  }

  public serializeOpenPorts(openPorts: HostPort[] | undefined): string {
    if (!openPorts || openPorts.length === 0) {
      return '[]';
    }

    return JSON.stringify(openPorts);
  }

  public normalizeDateValue(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      return null;
    }

    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString();
  }

  private isPortScanStillFresh(portsExpireAt: string | null): boolean {
    if (!portsExpireAt) {
      return false;
    }

    const expiresAt = new Date(portsExpireAt).getTime();
    if (Number.isNaN(expiresAt)) {
      return false;
    }

    return expiresAt > Date.now();
  }

  public normalizeHost(row: AggregatedHostRowRaw): AggregatedHost {
    const { secondaryMacs: rawSecondaryMacs, powerControl: rawPowerControl, ...base } = row;
    const openPorts = this.parseOpenPorts(base.openPorts, base.name);
    const portsScannedAt = this.normalizeDateValue(base.portsScannedAt);
    const portsExpireAt = this.normalizeDateValue(base.portsExpireAt);
    const hasFreshPortScan = this.isPortScanStillFresh(portsExpireAt);
    const secondaryMacs = this.parseSecondaryMacs(rawSecondaryMacs, base.name, base.mac);
    const powerControl = this.parsePowerControl(rawPowerControl, base.name);

    return {
      ...base,
      ...(secondaryMacs.length > 0 ? { secondaryMacs } : {}),
      notes: base.notes ?? null,
      tags: this.parseTags(base.tags, base.name),
      ...(powerControl !== undefined ? { powerControl } : {}),
      openPorts: hasFreshPortScan ? openPorts : undefined,
      portsScannedAt: hasFreshPortScan ? portsScannedAt : null,
      portsExpireAt: hasFreshPortScan ? portsExpireAt : null,
    };
  }

  private normalizeHostStatus(value: unknown): HostStatus | null {
    return value === 'awake' || value === 'asleep' ? value : null;
  }

  private normalizeChangedAt(value: unknown): string {
    const normalized = this.normalizeDateValue(value);
    return normalized ?? new Date().toISOString();
  }

  public mapStatusHistoryRow(row: HostStatusHistoryRow): HostStatusHistoryEntry | null {
    const oldStatus = this.normalizeHostStatus(row.oldStatus);
    const newStatus = this.normalizeHostStatus(row.newStatus);
    if (!oldStatus || !newStatus) {
      return null;
    }

    return {
      hostFqn: row.hostFqn,
      oldStatus,
      newStatus,
      changedAt: this.normalizeChangedAt(row.changedAt),
    };
  }

  public parsePeriodToMs(rawPeriod: string): number | null {
    const match = /^(\d+)([dhm])$/.exec(rawPeriod.trim().toLowerCase());
    if (!match) {
      return null;
    }

    const amount = Number.parseInt(match[1], 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    const unit = match[2];
    if (unit === 'd') {
      return amount * 24 * 60 * 60 * 1000;
    }
    if (unit === 'h') {
      return amount * 60 * 60 * 1000;
    }
    if (unit === 'm') {
      return amount * 60 * 1000;
    }
    return null;
  }

  private isDuplicateColumnError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const maybeCode = (error as { code?: unknown }).code;
    if (maybeCode === '42701') {
      return true;
    }

    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return message.includes('duplicate column') || message.includes('already exists');
  }

  public async ensureHostMetadataColumns(): Promise<void> {
    if (!this.metadataColumnsReady) {
      this.metadataColumnsReady = this.applyHostMetadataMigrations().catch((error) => {
        this.metadataColumnsReady = null;
        throw error;
      });
    }

    await this.metadataColumnsReady;
  }

  private async applyHostMetadataMigrations(): Promise<void> {
    const existingColumns = await this.getExistingHostColumns();
    const migrationStatements: Array<{ column: string; statement: string }> = [
      { column: 'notes', statement: 'ALTER TABLE aggregated_hosts ADD COLUMN notes TEXT' },
      { column: 'tags', statement: "ALTER TABLE aggregated_hosts ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'" },
      {
        column: 'secondary_macs',
        statement: "ALTER TABLE aggregated_hosts ADD COLUMN secondary_macs TEXT NOT NULL DEFAULT '[]'",
      },
      {
        column: 'open_ports',
        statement: "ALTER TABLE aggregated_hosts ADD COLUMN open_ports TEXT NOT NULL DEFAULT '[]'",
      },
      {
        column: 'ports_scanned_at',
        statement: 'ALTER TABLE aggregated_hosts ADD COLUMN ports_scanned_at TIMESTAMP',
      },
      {
        column: 'ports_expire_at',
        statement: 'ALTER TABLE aggregated_hosts ADD COLUMN ports_expire_at TIMESTAMP',
      },
      {
        column: 'power_config',
        statement: 'ALTER TABLE aggregated_hosts ADD COLUMN power_config TEXT',
      },
    ];

    for (const migration of migrationStatements) {
      if (existingColumns.has(migration.column)) {
        continue;
      }

      try {
        await db.query(migration.statement);
      } catch (error) {
        if (!this.isDuplicateColumnError(error)) {
          logger.error('Failed to apply aggregated host metadata migration', {
            statement: migration.statement,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }
    }

    await db.query("UPDATE aggregated_hosts SET tags = '[]' WHERE tags IS NULL");
    await db.query("UPDATE aggregated_hosts SET secondary_macs = '[]' WHERE secondary_macs IS NULL");
    await db.query("UPDATE aggregated_hosts SET open_ports = '[]' WHERE open_ports IS NULL");
    await this.ensureHostStatusHistoryTable();
  }

  private async getExistingHostColumns(): Promise<Set<string>> {
    if (this.isSqlite) {
      const result = await db.query<{ name: string }>("SELECT name FROM pragma_table_info('aggregated_hosts')");
      return new Set(result.rows.map((row) => row.name));
    }

    const result = await db.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'aggregated_hosts' AND table_schema = 'public'`,
    );
    return new Set(result.rows.map((row) => row.column_name));
  }

  private async ensureHostStatusHistoryTable(): Promise<void> {
    const createTableStatement = this.isSqlite
      ? `CREATE TABLE IF NOT EXISTS host_status_history (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           host_fqn TEXT NOT NULL,
           old_status TEXT NOT NULL CHECK(old_status IN ('awake', 'asleep')),
           new_status TEXT NOT NULL CHECK(new_status IN ('awake', 'asleep')),
           changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
         )`
      : `CREATE TABLE IF NOT EXISTS host_status_history (
           id SERIAL PRIMARY KEY,
           host_fqn VARCHAR(512) NOT NULL,
           old_status VARCHAR(20) NOT NULL CHECK(old_status IN ('awake', 'asleep')),
           new_status VARCHAR(20) NOT NULL CHECK(new_status IN ('awake', 'asleep')),
           changed_at TIMESTAMP NOT NULL DEFAULT NOW()
         )`;

    await db.query(createTableStatement);
    await db.query(
      'CREATE INDEX IF NOT EXISTS idx_host_status_history_host_changed_at ON host_status_history(host_fqn, changed_at)',
    );
    await db.query(
      'CREATE INDEX IF NOT EXISTS idx_host_status_history_changed_at ON host_status_history(changed_at)',
    );
  }

  public async recordHostStatusTransition(
    hostFqn: string,
    oldStatusCandidate: unknown,
    newStatusCandidate: unknown,
    changedAtCandidate?: unknown,
  ): Promise<void> {
    const oldStatus = this.normalizeHostStatus(oldStatusCandidate);
    const newStatus = this.normalizeHostStatus(newStatusCandidate);

    if (!oldStatus || !newStatus || oldStatus === newStatus) {
      return;
    }

    const changedAt = this.normalizeChangedAt(changedAtCandidate ?? new Date().toISOString());

    try {
      await db.query(
        `INSERT INTO host_status_history (host_fqn, old_status, new_status, changed_at)
         VALUES ($1, $2, $3, $4)`,
        [hostFqn, oldStatus, newStatus, changedAt],
      );
    } catch (error) {
      logger.warn('Failed to record host status transition history', {
        hostFqn,
        oldStatus,
        newStatus,
        changedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.emitEvent('host-status-transition', {
      hostFqn,
      oldStatus,
      newStatus,
      changedAt,
    });
  }

  public async findHostRowByNodeAndName(nodeId: string, name: string): Promise<AggregatedHostRow | null> {
    const result = await db.query<AggregatedHostRow>(
      `SELECT
${HOST_SELECT_COLUMNS_WITH_ID}
      FROM aggregated_hosts ah
      WHERE ah.node_id = $1 AND ah.name = $2`,
      [nodeId, name],
    );

    const row = result.rows[0];
    return row ? (this.normalizeHost(row as AggregatedHostRowRaw) as AggregatedHostRow) : null;
  }

  private async findHostRowByNodeAndAnyMac(nodeId: string, mac: string): Promise<AggregatedHostRow | null> {
    const normalizedMac = mac.trim().toUpperCase().replace(/-/g, ':');
    const result = await db.query<AggregatedHostRow>(
      `SELECT
${HOST_SELECT_COLUMNS_WITH_ID}
      FROM aggregated_hosts ah
      WHERE ah.node_id = $1
      ORDER BY ah.updated_at DESC, ah.id DESC`,
      [nodeId],
    );

    for (const row of result.rows) {
      const normalized = this.normalizeHost(row as AggregatedHostRowRaw) as AggregatedHostRow;
      const knownMacs = new Set<string>([normalized.mac, ...(normalized.secondaryMacs ?? [])]);
      if (knownMacs.has(normalizedMac)) {
        return normalized;
      }
    }

    return null;
  }

  private hostsShareAnyMac(
    first: { mac: string; secondaryMacs?: string[] },
    second: { mac: string; secondaryMacs?: string[] },
  ): boolean {
    const firstKnown = new Set<string>([first.mac, ...(first.secondaryMacs ?? [])]);
    const secondKnown = new Set<string>([second.mac, ...(second.secondaryMacs ?? [])]);
    for (const candidate of firstKnown) {
      if (secondKnown.has(candidate)) {
        return true;
      }
    }
    return false;
  }

  private async deleteOtherHostsByNodeAndMac(nodeId: string, mac: string, keepId: number): Promise<number> {
    const result = await db.query(
      `DELETE FROM aggregated_hosts
       WHERE node_id = $1 AND mac = $2 AND id <> $3`,
      [nodeId, mac, keepId],
    );
    return result.rowCount || 0;
  }

  private async updateHostRowById(id: number, nodeId: string, host: Host, location: string): Promise<void> {
    const fullyQualifiedName = this.buildFQN(host.name, location, nodeId);
    const timestamp = this.isSqlite ? 'CURRENT_TIMESTAMP' : 'NOW()';

    const discovered = host.discovered ?? 1;
    const pingResponsive = host.pingResponsive ?? null;
    const notes = host.notes ?? null;
    const tags = this.serializeTags(host.tags);
    const secondaryMacs = this.serializeSecondaryMacs(host.secondaryMacs, host.mac);
    const powerControl = this.serializePowerControl(host.powerControl);

    const lastSeen = host.lastSeen
      ? typeof host.lastSeen === 'string'
        ? host.lastSeen
        : new Date(host.lastSeen).toISOString()
      : null;

    await db.query(
      `UPDATE aggregated_hosts
        SET name = $1,
            mac = $2,
            ip = $3,
            status = $4,
            last_seen = $5,
            location = $6,
            fully_qualified_name = $7,
            discovered = $8,
            ping_responsive = $9,
            notes = $10,
            tags = $11,
            secondary_macs = $12,
            power_config = $13,
            updated_at = ${timestamp}
        WHERE id = $14 AND node_id = $15`,
      [
        host.name,
        host.mac,
        host.ip,
        host.status,
        lastSeen,
        location,
        fullyQualifiedName,
        discovered,
        pingResponsive,
        notes,
        tags,
        secondaryMacs,
        powerControl,
        id,
        nodeId,
      ],
    );
  }

  public hasMeaningfulHostStateChange(previous: AggregatedHostRow, next: Host, location: string): boolean {
    if (previous.name !== next.name) {
      return true;
    }

    if (previous.mac !== next.mac) {
      return true;
    }

    if (JSON.stringify(previous.secondaryMacs ?? []) !== JSON.stringify(next.secondaryMacs ?? [])) {
      return true;
    }

    if (previous.ip !== next.ip) {
      return true;
    }

    if (previous.status !== next.status) {
      return true;
    }

    if ((previous.discovered ?? 0) !== (next.discovered ?? 1)) {
      return true;
    }

    if ((previous.pingResponsive ?? null) !== (next.pingResponsive ?? null)) {
      return true;
    }

    if ((previous.notes ?? null) !== (next.notes ?? null)) {
      return true;
    }

    if (JSON.stringify(previous.powerControl ?? null) !== JSON.stringify(next.powerControl ?? null)) {
      return true;
    }

    if (previous.location !== location) {
      return true;
    }

    const previousTags = previous.tags ?? [];
    const nextTags = next.tags ?? [];
    return JSON.stringify(previousTags) !== JSON.stringify(nextTags);
  }

  public async reconcileHostByMac(
    nodeId: string,
    host: Host,
    location: string,
  ): Promise<{ reconciled: boolean; wasRenamed: boolean; previousHost: AggregatedHostRow | null }> {
    const existingByMac =
      host.mac && typeof host.mac === 'string'
        ? await this.findHostRowByNodeAndAnyMac(nodeId, host.mac)
        : null;

    if (existingByMac) {
      const wasRenamed = existingByMac.name !== host.name;
      if (wasRenamed) {
        const existingByName = await this.findHostRowByNodeAndName(nodeId, host.name);
        if (
          existingByName &&
          this.hostsShareAnyMac(existingByName, host) &&
          existingByName.id !== existingByMac.id
        ) {
          await db.query('DELETE FROM aggregated_hosts WHERE id = $1 AND node_id = $2', [
            existingByName.id,
            nodeId,
          ]);
        }
      }

      await this.updateHostRowById(existingByMac.id, nodeId, host, location);
      await this.deleteOtherHostsByNodeAndMac(nodeId, host.mac, existingByMac.id);

      return { reconciled: true, wasRenamed, previousHost: existingByMac };
    }

    const existingByName = await this.findHostRowByNodeAndName(nodeId, host.name);
    if (existingByName) {
      await this.updateHostRowById(existingByName.id, nodeId, host, location);
      return { reconciled: true, wasRenamed: false, previousHost: existingByName };
    }

    return { reconciled: false, wasRenamed: false, previousHost: null };
  }

  public buildFQN(name: string, location: string, nodeId?: string): string {
    const encodedLocation = encodeURIComponent(location);
    return nodeId ? `${name}@${encodedLocation}-${nodeId}` : `${name}@${encodedLocation}`;
  }

  public async insertHost(
    nodeId: string,
    host: Host,
    location: string,
    fullyQualifiedName: string,
  ): Promise<void> {
    const discovered = host.discovered ?? 1;
    const pingResponsive = host.pingResponsive ?? null;
    const notes = host.notes ?? null;
    const tags = this.serializeTags(host.tags);
    const secondaryMacs = this.serializeSecondaryMacs(host.secondaryMacs, host.mac);
    const powerControl = this.serializePowerControl(host.powerControl);

    const lastSeen = host.lastSeen
      ? typeof host.lastSeen === 'string'
        ? host.lastSeen
        : new Date(host.lastSeen).toISOString()
      : null;

    await db.query(
      `INSERT INTO aggregated_hosts
        (node_id, name, mac, secondary_macs, ip, status, last_seen, location, fully_qualified_name, discovered, ping_responsive, notes, tags, power_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        nodeId,
        host.name,
        host.mac,
        secondaryMacs,
        host.ip,
        host.status,
        lastSeen,
        location,
        fullyQualifiedName,
        discovered,
        pingResponsive,
        notes,
        tags,
        powerControl,
      ],
    );
  }
}
