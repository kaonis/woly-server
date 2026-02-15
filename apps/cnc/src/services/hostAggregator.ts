/**
 * Host Aggregator Service
 *
 * Processes host events from node agents and maintains the aggregated_hosts table.
 * Handles conflict resolution for duplicate hostnames across nodes.
 */

import { EventEmitter } from 'events';
import db from '../database/connection';
import { logger } from '../utils/logger';
import { Host, AggregatedHost } from '../types';

interface HostDiscoveredEvent {
  nodeId: string;
  host: Host;
  location: string;
}

interface HostUpdatedEvent {
  nodeId: string;
  host: Host;
  location: string;
}

interface HostRemovedEvent {
  nodeId: string;
  name: string;
}

// Internal row type including database ID
type AggregatedHostRow = AggregatedHost & { id: number };

const HOST_SELECT_COLUMNS = `
        ah.node_id as "nodeId",
        ah.name,
        ah.mac,
        ah.ip,
        ah.status,
        ah.last_seen as "lastSeen",
        ah.notes,
        ah.tags,
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

export class HostAggregator extends EventEmitter {
  private readonly isSqlite = db.isSqlite;
  private metadataColumnsReady: Promise<void> | null = null;

  constructor() {
    super();
  }

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

  private normalizeHost(row: AggregatedHost & { tags?: unknown }): AggregatedHost {
    return {
      ...row,
      notes: row.notes ?? null,
      tags: this.parseTags(row.tags, row.name),
    };
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

  private async ensureHostMetadataColumns(): Promise<void> {
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
  }

  private async getExistingHostColumns(): Promise<Set<string>> {
    if (this.isSqlite) {
      const result = await db.query<{ name: string }>(
        "SELECT name FROM pragma_table_info('aggregated_hosts')"
      );
      return new Set(result.rows.map((row) => row.name));
    }

    const result = await db.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'aggregated_hosts' AND table_schema = 'public'`
    );
    return new Set(result.rows.map((row) => row.column_name));
  }

  // Internal row shape used for reconciliation/deduping. External API types do not expose `id`.
  private async findHostRowByNodeAndName(
    nodeId: string,
    name: string
  ): Promise<AggregatedHostRow | null> {
    const result = await db.query<AggregatedHostRow>(
      `SELECT
${HOST_SELECT_COLUMNS_WITH_ID}
      FROM aggregated_hosts ah
      WHERE ah.node_id = $1 AND ah.name = $2`,
      [nodeId, name]
    );

    const row = result.rows[0];
    return row ? (this.normalizeHost(row as AggregatedHost & { tags?: unknown }) as AggregatedHostRow) : null;
  }

  private async findHostRowByNodeAndMac(
    nodeId: string,
    mac: string
  ): Promise<AggregatedHostRow | null> {
    const result = await db.query<AggregatedHostRow>(
      `SELECT
${HOST_SELECT_COLUMNS_WITH_ID}
      FROM aggregated_hosts ah
      WHERE ah.node_id = $1 AND ah.mac = $2
      ORDER BY ah.updated_at DESC, ah.id DESC
      LIMIT 1`,
      [nodeId, mac]
    );

    const row = result.rows[0];
    return row ? (this.normalizeHost(row as AggregatedHost & { tags?: unknown }) as AggregatedHostRow) : null;
  }

  private async deleteOtherHostsByNodeAndMac(
    nodeId: string,
    mac: string,
    keepId: number
  ): Promise<number> {
    const result = await db.query(
      `DELETE FROM aggregated_hosts
       WHERE node_id = $1 AND mac = $2 AND id <> $3`,
      [nodeId, mac, keepId]
    );
    return result.rowCount || 0;
  }

  private async updateHostRowById(
    id: number,
    nodeId: string,
    host: Host,
    location: string
  ): Promise<void> {
    const fullyQualifiedName = this.buildFQN(host.name, location, nodeId);
    const timestamp = this.isSqlite ? 'CURRENT_TIMESTAMP' : 'NOW()';

    const discovered = host.discovered ?? 1;
    const pingResponsive = host.pingResponsive ?? null;
    const notes = host.notes ?? null;
    const tags = this.serializeTags(host.tags);

    // Convert lastSeen to ISO string for SQLite compatibility
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
            updated_at = ${timestamp}
        WHERE id = $12 AND node_id = $13`,
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
        id,
        nodeId,
      ]
    );
  }

  /**
   * Reconcile and update/insert a host using MAC-first reconciliation.
   * Returns true if host was reconciled by MAC or name, false if it's a new host.
   */
  private async reconcileHostByMac(
    nodeId: string,
    host: Host,
    location: string
  ): Promise<{ reconciled: boolean; wasRenamed: boolean }> {
    // Reconcile by stable identifier first (MAC). Names can change due to renames or flaky hostname resolution.
    const existingByMac =
      host.mac && typeof host.mac === 'string'
        ? await this.findHostRowByNodeAndMac(nodeId, host.mac)
        : null;

    if (existingByMac) {
      // If a duplicate row already exists (legacy bug), clean it up after updating.
      // If the target name already exists with the same MAC (duplicate), prefer keeping `existingByMac`.
      const wasRenamed = existingByMac.name !== host.name;
      if (wasRenamed) {
        const existingByName = await this.findHostRowByNodeAndName(nodeId, host.name);
        if (existingByName && existingByName.mac === host.mac && existingByName.id !== existingByMac.id) {
          await db.query('DELETE FROM aggregated_hosts WHERE id = $1 AND node_id = $2', [
            existingByName.id,
            nodeId,
          ]);
        }
      }

      await this.updateHostRowById(existingByMac.id, nodeId, host, location);
      await this.deleteOtherHostsByNodeAndMac(nodeId, host.mac, existingByMac.id);

      return { reconciled: true, wasRenamed };
    }

    // Check if host already exists for this node by name (fallback).
    const existingByName = await this.findHostRowByNodeAndName(nodeId, host.name);
    if (existingByName) {
      await this.updateHostRowById(existingByName.id, nodeId, host, location);
      return { reconciled: true, wasRenamed: false };
    }

    return { reconciled: false, wasRenamed: false };
  }

  /**
   * Process host-discovered event from a node
   */
  async onHostDiscovered(event: HostDiscoveredEvent): Promise<void> {
    await this.ensureHostMetadataColumns();
    const { nodeId, host, location } = event;
    const fullyQualifiedName = this.buildFQN(host.name, location, nodeId);

    try {
      const { reconciled, wasRenamed } = await this.reconcileHostByMac(nodeId, host, location);

      if (reconciled) {
        const method = wasRenamed ? 'MAC (renamed)' : 'MAC or name';
        logger.info('Host already exists, updated', {
          nodeId,
          hostName: host.name,
          fullyQualifiedName,
          mac: host.mac,
          newIp: host.ip,
          newStatus: host.status,
          reconciledBy: method,
        });
        return;
      }

      // New host, insert it
      await this.insertHost(nodeId, host, location, fullyQualifiedName);
      logger.info('Host discovered and added to aggregated database', {
        nodeId,
        hostName: host.name,
        fullyQualifiedName,
        mac: host.mac,
        ip: host.ip,
        status: host.status,
      });

      this.emit('host-added', { nodeId, host, fullyQualifiedName });
    } catch (error) {
      logger.error('Failed to process host-discovered event', {
        nodeId,
        hostName: host.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Process host-updated event from a node
   */
  async onHostUpdated(event: HostUpdatedEvent): Promise<void> {
    await this.ensureHostMetadataColumns();
    const { nodeId, host, location } = event;
    const fullyQualifiedName = this.buildFQN(host.name, location, nodeId);

    try {
      const { reconciled } = await this.reconcileHostByMac(nodeId, host, location);

      if (reconciled) {
        logger.debug('Host updated in aggregated database', {
          nodeId,
          hostName: host.name,
          fullyQualifiedName,
          status: host.status,
        });

        this.emit('host-updated', { nodeId, host, fullyQualifiedName });
        return;
      }

      // Host doesn't exist yet, treat as discovery
      logger.debug('Received update for unknown host, treating as discovery', {
        nodeId,
        hostName: host.name,
      });
      await this.onHostDiscovered(event);
    } catch (error) {
      logger.error('Failed to process host-updated event', {
        nodeId,
        hostName: host.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Process host-removed event from a node
   */
  async onHostRemoved(event: HostRemovedEvent): Promise<void> {
    await this.ensureHostMetadataColumns();
    const { nodeId, name } = event;

    try {
      // Best-effort: if we can resolve MAC for the removed name, delete all rows for that MAC.
      // This cleans up legacy duplicates where the same device existed under multiple names.
      const existing = await this.findHostRowByNodeAndName(nodeId, name);
      const result = await db.query(
        'DELETE FROM aggregated_hosts WHERE node_id = $1 AND name = $2 RETURNING *',
        [nodeId, name]
      );

      if (existing?.mac) {
        await db.query('DELETE FROM aggregated_hosts WHERE node_id = $1 AND mac = $2', [
          nodeId,
          existing.mac,
        ]);
      }

      if (result.rowCount && result.rowCount > 0) {
        logger.info('Host removed from aggregated database', {
          nodeId,
          hostName: name,
        });

        this.emit('host-removed', { nodeId, name });
      } else {
        logger.debug('Host removal request for non-existent host', {
          nodeId,
          hostName: name,
        });
      }
    } catch (error) {
      logger.error('Failed to process host-removed event', {
        nodeId,
        hostName: name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Mark all hosts for a node as unreachable when node goes offline
   */
  async markNodeHostsUnreachable(nodeId: string): Promise<void> {
    await this.ensureHostMetadataColumns();
    try {
      const timestamp = this.isSqlite ? 'CURRENT_TIMESTAMP' : 'NOW()';
      const query = this.isSqlite
        ? `UPDATE aggregated_hosts
           SET status = 'asleep', updated_at = ${timestamp}
           WHERE node_id = $1 AND status = 'awake'`
        : `UPDATE aggregated_hosts
           SET status = 'asleep', updated_at = ${timestamp}
           WHERE node_id = $1 AND status = 'awake'
           RETURNING name`;

      const result = await db.query(query, [nodeId]);

      const count = result.rowCount || 0;
      if (count > 0) {
        logger.info('Marked node hosts as unreachable', {
          nodeId,
          hostsAffected: count,
        });

        this.emit('node-hosts-unreachable', { nodeId, count });
      }
    } catch (error) {
      logger.error('Failed to mark node hosts as unreachable', {
        nodeId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Remove all hosts for a node (when node is deregistered)
   */
  async removeNodeHosts(nodeId: string): Promise<void> {
    await this.ensureHostMetadataColumns();
    try {
      const result = await db.query(
        'DELETE FROM aggregated_hosts WHERE node_id = $1 RETURNING name',
        [nodeId]
      );

      const count = result.rowCount || 0;
      logger.info('Removed all hosts for node', {
        nodeId,
        hostsRemoved: count,
      });

      this.emit('node-hosts-removed', { nodeId, count });
    } catch (error) {
      logger.error('Failed to remove node hosts', {
        nodeId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get all aggregated hosts
   */
  async getAllHosts(): Promise<AggregatedHost[]> {
    await this.ensureHostMetadataColumns();
    try {
      const result = await db.query<AggregatedHost>(`
        SELECT
${HOST_SELECT_COLUMNS}
        FROM aggregated_hosts ah
        ORDER BY ah.fully_qualified_name
      `);

      return result.rows.map((row) => this.normalizeHost(row as AggregatedHost & { tags?: unknown }));
    } catch (error) {
      logger.error('Failed to get all hosts', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get hosts for a specific node
   */
  async getHostsByNode(nodeId: string): Promise<AggregatedHost[]> {
    await this.ensureHostMetadataColumns();
    try {
      const result = await db.query<AggregatedHost>(
        `SELECT
${HOST_SELECT_COLUMNS}
        FROM aggregated_hosts ah
        WHERE ah.node_id = $1
        ORDER BY ah.name`,
        [nodeId]
      );

      return result.rows.map((row) => this.normalizeHost(row as AggregatedHost & { tags?: unknown }));
    } catch (error) {
      logger.error('Failed to get hosts by node', {
        nodeId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get a specific host by fully qualified name
   */
  async getHostByFQN(fullyQualifiedName: string): Promise<AggregatedHost | null> {
    await this.ensureHostMetadataColumns();
    try {
      const result = await db.query<AggregatedHost>(
        `SELECT
${HOST_SELECT_COLUMNS}
        FROM aggregated_hosts ah
        WHERE ah.fully_qualified_name = $1`,
        [fullyQualifiedName]
      );

      const row = result.rows[0];
      return row ? this.normalizeHost(row as AggregatedHost & { tags?: unknown }) : null;
    } catch (error) {
      logger.error('Failed to get host by FQN', {
        fullyQualifiedName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get aggregated statistics
   */
  async getStats(): Promise<{
    total: number;
    awake: number;
    asleep: number;
    byLocation: Record<string, { total: number; awake: number }>;
  }> {
    await this.ensureHostMetadataColumns();
    try {
      // Get overall stats (database-specific)
      const overallQuery = this.isSqlite ? `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'awake' THEN 1 ELSE 0 END) as awake,
          SUM(CASE WHEN status = 'asleep' THEN 1 ELSE 0 END) as asleep
        FROM aggregated_hosts
      ` : `
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

      // Get stats by location (database-specific)
      const locationQuery = this.isSqlite ? `
        SELECT
          location,
          COUNT(*) as total,
          SUM(CASE WHEN status = 'awake' THEN 1 ELSE 0 END) as awake
        FROM aggregated_hosts
        GROUP BY location
        ORDER BY location
      ` : `
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

      // Handle empty table case
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

  // Private helper methods

  private buildFQN(name: string, location: string, nodeId?: string): string {
    // Format: hostname@location-nodeId (nodeId ensures uniqueness when same hostname exists on multiple nodes)
    // URL-encode location to preserve natural hyphens and special characters
    const encodedLocation = encodeURIComponent(location);
    return nodeId ? `${name}@${encodedLocation}-${nodeId}` : `${name}@${encodedLocation}`;
  }

  private async insertHost(
    nodeId: string,
    host: Host,
    location: string,
    fullyQualifiedName: string
  ): Promise<void> {
    const discovered = host.discovered ?? 1;
    const pingResponsive = host.pingResponsive ?? null;
    const notes = host.notes ?? null;
    const tags = this.serializeTags(host.tags);

    // Convert lastSeen to ISO string for SQLite compatibility
    const lastSeen = host.lastSeen 
      ? (typeof host.lastSeen === 'string' ? host.lastSeen : new Date(host.lastSeen).toISOString())
      : null;

    await db.query(
      `INSERT INTO aggregated_hosts
        (node_id, name, mac, ip, status, last_seen, location, fully_qualified_name, discovered, ping_responsive, notes, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        nodeId,
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
      ]
    );
  }
}
