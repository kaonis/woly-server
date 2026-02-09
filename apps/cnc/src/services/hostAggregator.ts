/**
 * Host Aggregator Service
 *
 * Processes host events from node agents and maintains the aggregated_hosts table.
 * Handles conflict resolution for duplicate hostnames across nodes.
 */

import { EventEmitter } from 'events';
import db from '../database/connection';
import config from '../config';
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

export class HostAggregator extends EventEmitter {
  private isSqlite = config.dbType === 'sqlite';

  constructor() {
    super();
  }

  // Internal row shape used for reconciliation/deduping. External API types do not expose `id`.
  private async findHostRowByNodeAndName(
    nodeId: string,
    name: string
  ): Promise<(AggregatedHost & { id: number }) | null> {
    const result = await db.query(
      `SELECT
        ah.id,
        ah.node_id as "nodeId",
        ah.name,
        ah.mac,
        ah.ip,
        ah.status,
        ah.last_seen as "lastSeen",
        ah.location,
        ah.fully_qualified_name as "fullyQualifiedName",
        ah.discovered,
        ah.ping_responsive as "pingResponsive",
        ah.created_at as "createdAt",
        ah.updated_at as "updatedAt"
      FROM aggregated_hosts ah
      WHERE ah.node_id = $1 AND ah.name = $2`,
      [nodeId, name]
    );

    return result.rows[0] || null;
  }

  private async findHostRowByNodeAndMac(
    nodeId: string,
    mac: string
  ): Promise<(AggregatedHost & { id: number }) | null> {
    const result = await db.query(
      `SELECT
        ah.id,
        ah.node_id as "nodeId",
        ah.name,
        ah.mac,
        ah.ip,
        ah.status,
        ah.last_seen as "lastSeen",
        ah.location,
        ah.fully_qualified_name as "fullyQualifiedName",
        ah.discovered,
        ah.ping_responsive as "pingResponsive",
        ah.created_at as "createdAt",
        ah.updated_at as "updatedAt"
      FROM aggregated_hosts ah
      WHERE ah.node_id = $1 AND ah.mac = $2
      ORDER BY ah.updated_at DESC, ah.id DESC
      LIMIT 1`,
      [nodeId, mac]
    );

    return result.rows[0] || null;
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

    // Extract extra fields from node agent's Host type (discovered, pingResponsive)
    const hostData = host as any;
    const discovered = hostData.discovered ?? 1;
    const pingResponsive = hostData.pingResponsive ?? null;

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
            updated_at = ${timestamp}
        WHERE id = $10 AND node_id = $11`,
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
        id,
        nodeId,
      ]
    );
  }

  /**
   * Process host-discovered event from a node
   */
  async onHostDiscovered(event: HostDiscoveredEvent): Promise<void> {
    const { nodeId, host, location } = event;
    const fullyQualifiedName = this.buildFQN(host.name, location, nodeId);

    try {
      // Reconcile by stable identifier first (MAC). Names can change due to renames or flaky hostname resolution.
      const existingByMac =
        host.mac && typeof host.mac === 'string'
          ? await this.findHostRowByNodeAndMac(nodeId, host.mac)
          : null;

      if (existingByMac) {
        // If a duplicate row already exists (legacy bug), clean it up after updating.
        // If the target name already exists with the same MAC (duplicate), prefer keeping `existingByMac`.
        if (existingByMac.name !== host.name) {
          const existingByName = await this.findHostRowByNodeAndName(nodeId, host.name);
          if (existingByName && existingByName.mac === host.mac && existingByName.id !== existingByMac.id) {
            await db.query('DELETE FROM aggregated_hosts WHERE id = $1 AND node_id = $2', [
              existingByName.id,
              nodeId,
            ]);
          }
        }

        await this.updateHostRowById(existingByMac.id, nodeId, host, location);
        const deleted = await this.deleteOtherHostsByNodeAndMac(nodeId, host.mac, existingByMac.id);

        logger.info('Host already exists (by MAC), updated', {
          nodeId,
          oldName: existingByMac.name,
          hostName: host.name,
          fullyQualifiedName,
          mac: host.mac,
          newIp: host.ip,
          newStatus: host.status,
          dedupedRows: deleted,
        });

        return;
      }

      // Check if host already exists for this node by name (fallback).
      const existing = await this.findHostRowByNodeAndName(nodeId, host.name);

      if (existing) {
        // Host already exists, update it
        await this.updateHostRowById(existing.id, nodeId, host, location);
        logger.info('Host already exists, updated', {
          nodeId,
          hostName: host.name,
          fullyQualifiedName,
          newIp: host.ip,
          newStatus: host.status,
        });
      } else {
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
      }
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
    const { nodeId, host, location } = event;
    const fullyQualifiedName = this.buildFQN(host.name, location, nodeId);

    try {
      // Prefer MAC-based reconciliation so renames don't create duplicates.
      const existingByMac =
        host.mac && typeof host.mac === 'string'
          ? await this.findHostRowByNodeAndMac(nodeId, host.mac)
          : null;

      if (existingByMac) {
        if (existingByMac.name !== host.name) {
          const existingByName = await this.findHostRowByNodeAndName(nodeId, host.name);
          if (existingByName && existingByName.mac === host.mac && existingByName.id !== existingByMac.id) {
            await db.query('DELETE FROM aggregated_hosts WHERE id = $1 AND node_id = $2', [
              existingByName.id,
              nodeId,
            ]);
          }
        }

        await this.updateHostRowById(existingByMac.id, nodeId, host, location);
        const deleted = await this.deleteOtherHostsByNodeAndMac(nodeId, host.mac, existingByMac.id);

        logger.debug('Host updated in aggregated database', {
          nodeId,
          hostName: host.name,
          fullyQualifiedName,
          status: host.status,
          dedupedRows: deleted,
        });

        this.emit('host-updated', { nodeId, host, fullyQualifiedName });
        return;
      }

      const existing = await this.findHostRowByNodeAndName(nodeId, host.name);

      if (existing) {
        await this.updateHostRowById(existing.id, nodeId, host, location);
        logger.debug('Host updated in aggregated database', {
          nodeId,
          hostName: host.name,
          fullyQualifiedName,
          status: host.status,
        });

        this.emit('host-updated', { nodeId, host, fullyQualifiedName });
      } else {
        // Host doesn't exist yet, treat as discovery
        logger.debug('Received update for unknown host, treating as discovery', {
          nodeId,
          hostName: host.name,
        });
        await this.onHostDiscovered(event);
      }
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
    try {
      const result = await db.query(`
        SELECT
          ah.node_id as "nodeId",
          ah.name,
          ah.mac,
          ah.ip,
          ah.status,
          ah.last_seen as "lastSeen",
          ah.location,
          ah.fully_qualified_name as "fullyQualifiedName",
          ah.discovered,
          ah.ping_responsive as "pingResponsive",
          ah.created_at as "createdAt",
          ah.updated_at as "updatedAt"
        FROM aggregated_hosts ah
        ORDER BY ah.fully_qualified_name
      `);

      return result.rows;
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
    try {
      const result = await db.query(
        `SELECT
          ah.node_id as "nodeId",
          ah.name,
          ah.mac,
          ah.ip,
          ah.status,
          ah.last_seen as "lastSeen",
          ah.location,
          ah.fully_qualified_name as "fullyQualifiedName",
          ah.discovered,
          ah.ping_responsive as "pingResponsive",
          ah.created_at as "createdAt",
          ah.updated_at as "updatedAt"
        FROM aggregated_hosts ah
        WHERE ah.node_id = $1
        ORDER BY ah.name`,
        [nodeId]
      );

      return result.rows;
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
    try {
      const result = await db.query(
        `SELECT
          ah.node_id as "nodeId",
          ah.name,
          ah.mac,
          ah.ip,
          ah.status,
          ah.last_seen as "lastSeen",
          ah.location,
          ah.fully_qualified_name as "fullyQualifiedName",
          ah.discovered,
          ah.ping_responsive as "pingResponsive",
          ah.created_at as "createdAt",
          ah.updated_at as "updatedAt"
        FROM aggregated_hosts ah
        WHERE ah.fully_qualified_name = $1`,
        [fullyQualifiedName]
      );

      return result.rows[0] || null;
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

      const overallResult = await db.query(overallQuery);

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

      const locationResult = await db.query(locationQuery);

      const overall = overallResult.rows[0];
      const byLocation: Record<string, { total: number; awake: number }> = {};

      locationResult.rows.forEach((row: any) => {
        byLocation[row.location] = {
          total: parseInt(row.total, 10),
          awake: parseInt(row.awake || '0', 10),
        };
      });

      return {
        total: parseInt(overall.total, 10),
        awake: parseInt(overall.awake, 10),
        asleep: parseInt(overall.asleep, 10),
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
    // Replace spaces in location with hyphens for cleaner FQN
    const sanitizedLocation = location.replace(/\s+/g, '-');
    return nodeId ? `${name}@${sanitizedLocation}-${nodeId}` : `${name}@${sanitizedLocation}`;
  }

  private async insertHost(
    nodeId: string,
    host: Host,
    location: string,
    fullyQualifiedName: string
  ): Promise<void> {
    // Extract extra fields from node agent's Host type (discovered, pingResponsive)
    const hostData = host as any;
    const discovered = hostData.discovered ?? 1;
    const pingResponsive = hostData.pingResponsive ?? null;

    // Convert lastSeen to ISO string for SQLite compatibility
    const lastSeen = host.lastSeen 
      ? (typeof host.lastSeen === 'string' ? host.lastSeen : new Date(host.lastSeen).toISOString())
      : null;

    await db.query(
      `INSERT INTO aggregated_hosts
        (node_id, name, mac, ip, status, last_seen, location, fully_qualified_name, discovered, ping_responsive)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
      ]
    );
  }
}
