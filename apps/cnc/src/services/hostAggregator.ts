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

  /**
   * Process host-discovered event from a node
   */
  async onHostDiscovered(event: HostDiscoveredEvent): Promise<void> {
    const { nodeId, host, location } = event;
    const fullyQualifiedName = this.buildFQN(host.name, location, nodeId);

    try {
      // Check if host already exists for this node
      const existing = await this.findHostByNodeAndName(nodeId, host.name);

      if (existing) {
        // Host already exists, update it
        await this.updateHost(nodeId, host, location);
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
      const existing = await this.findHostByNodeAndName(nodeId, host.name);

      if (existing) {
        await this.updateHost(nodeId, host, location);
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
      const result = await db.query(
        'DELETE FROM aggregated_hosts WHERE node_id = $1 AND name = $2 RETURNING *',
        [nodeId, name]
      );

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

  private async findHostByNodeAndName(
    nodeId: string,
    name: string
  ): Promise<AggregatedHost | null> {
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
      WHERE ah.node_id = $1 AND ah.name = $2`,
      [nodeId, name]
    );

    return result.rows[0] || null;
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

  private async updateHost(
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
      ? (typeof host.lastSeen === 'string' ? host.lastSeen : new Date(host.lastSeen).toISOString())
      : null;

    const result = await db.query(
      `UPDATE aggregated_hosts
        SET mac = $1,
            ip = $2,
            status = $3,
            last_seen = $4,
            location = $5,
            fully_qualified_name = $6,
            discovered = $7,
            ping_responsive = $8,
           updated_at = ${timestamp}
        WHERE node_id = $9 AND name = $10`,
      [
        host.mac,
        host.ip,
        host.status,
        lastSeen,
        location,
        fullyQualifiedName,
        discovered,
        pingResponsive,
        nodeId,
        host.name,
      ]
    );

    logger.debug('Host UPDATE executed', {
      nodeId,
      hostName: host.name,
      ip: host.ip,
      status: host.status,
      rowsAffected: result.rowCount,
    });
  }
}

