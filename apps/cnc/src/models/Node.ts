/**
 * Node data model and database operations
 */

import db from '../database/connection';
import config from '../config';
import { Node, NodeRegistration } from '../types';
import logger from '../utils/logger';

export class NodeModel {
  private static isSqlite = config.dbType === 'sqlite';

  /**
   * Register a new node or update existing
   */
  static async register(registration: NodeRegistration): Promise<Node> {
    const { nodeId, name, location, metadata } = registration;

    // SQLite and PostgreSQL have different upsert syntax
    const query = this.isSqlite ? `
      INSERT INTO nodes (id, name, location, status, last_heartbeat, capabilities, metadata)
      VALUES ($1, $2, $3, 'online', CURRENT_TIMESTAMP, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        name = excluded.name,
        location = excluded.location,
        status = 'online',
        last_heartbeat = CURRENT_TIMESTAMP,
        metadata = excluded.metadata,
        updated_at = CURRENT_TIMESTAMP
    ` : `
      INSERT INTO nodes (id, name, location, status, last_heartbeat, capabilities, metadata)
      VALUES ($1, $2, $3, 'online', NOW(), $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        location = EXCLUDED.location,
        status = 'online',
        last_heartbeat = NOW(),
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *
    `;

    const capabilities = this.isSqlite ? '[]' : [];
    const result = await db.query(query, [
      nodeId,
      name,
      location,
      capabilities,
      JSON.stringify(metadata),
    ]);

    logger.info('Node registered', { nodeId, name, location });

    // SQLite doesn't support RETURNING in all cases, so fetch the inserted row
    if (this.isSqlite) {
      return this.findById(nodeId) as Promise<Node>;
    }

    return this.mapRowToNode(result.rows[0]);
  }

  /**
   * Update node heartbeat
   */
  static async updateHeartbeat(nodeId: string): Promise<void> {
    const timestamp = this.isSqlite ? 'CURRENT_TIMESTAMP' : 'NOW()';
    const query = `
      UPDATE nodes
      SET last_heartbeat = ${timestamp}, status = 'online', updated_at = ${timestamp}
      WHERE id = $1
    `;
    await db.query(query, [nodeId]);
  }

  /**
   * Get node by ID
   */
  static async findById(nodeId: string): Promise<Node | null> {
    const query = 'SELECT * FROM nodes WHERE id = $1';
    const result = await db.query(query, [nodeId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToNode(result.rows[0]);
  }

  /**
   * Get all nodes
   */
  static async findAll(): Promise<Node[]> {
    const query = 'SELECT * FROM nodes ORDER BY location, name';
    const result = await db.query(query);
    return result.rows.map(this.mapRowToNode);
  }

  /**
   * Mark nodes as offline if they haven't sent heartbeat
   */
  static async markStaleNodesOffline(timeoutMs: number): Promise<number> {
    const timestamp = this.isSqlite ? 'CURRENT_TIMESTAMP' : 'NOW()';

    // SQLite uses datetime arithmetic differently
    const timeCondition = this.isSqlite
      ? `datetime(last_heartbeat, '+${timeoutMs / 1000} seconds') < datetime('now')`
      : `last_heartbeat < NOW() - INTERVAL '${timeoutMs} milliseconds'`;

    const query = this.isSqlite ? `
      UPDATE nodes
      SET status = 'offline', updated_at = ${timestamp}
      WHERE status = 'online'
        AND ${timeCondition}
    ` : `
      UPDATE nodes
      SET status = 'offline', updated_at = ${timestamp}
      WHERE status = 'online'
        AND ${timeCondition}
      RETURNING id
    `;

    const result = await db.query(query);

    // Get affected node IDs for SQLite (since it doesn't support RETURNING)
    let affectedIds: string[] = [];
    if (this.isSqlite && result.rowCount > 0) {
      const selectResult = await db.query(`SELECT id FROM nodes WHERE status = 'offline'`);
      affectedIds = selectResult.rows.map((r: any) => r.id);
    } else if (result.rows) {
      affectedIds = result.rows.map((r: any) => r.id);
    }

    if (result.rowCount > 0) {
      logger.warn('Marked nodes offline', {
        count: result.rowCount,
        nodeIds: affectedIds
      });
    }

    return result.rowCount;
  }

  /**
   * Delete a node
   */
  static async delete(nodeId: string): Promise<boolean> {
    const query = 'DELETE FROM nodes WHERE id = $1';
    const result = await db.query(query, [nodeId]);

    if (result.rowCount > 0) {
      logger.info('Node deleted', { nodeId });
    }

    return result.rowCount > 0;
  }

  /**
   * Get offline nodes
   */
  static async getOfflineNodes(): Promise<Node[]> {
    const query = 'SELECT * FROM nodes WHERE status = \'offline\'';
    const result = await db.query(query);
    return result.rows.map(this.mapRowToNode);
  }

  /**
   * Get node count by status
   */
  static async getStatusCounts(): Promise<{ online: number; offline: number }> {
    // SQLite doesn't support FILTER, use CASE WHEN instead
    const query = this.isSqlite ? `
      SELECT
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline
      FROM nodes
    ` : `
      SELECT
        COUNT(*) FILTER (WHERE status = 'online') as online,
        COUNT(*) FILTER (WHERE status = 'offline') as offline
      FROM nodes
    `;

    const result = await db.query(query);
    return {
      online: parseInt(result.rows[0].online || '0', 10),
      offline: parseInt(result.rows[0].offline || '0', 10),
    };
  }

  /**
   * Map database row to Node type
   */
  private static mapRowToNode(row: any): Node {
    // SQLite stores JSON as TEXT, PostgreSQL as JSONB
    const metadata = typeof row.metadata === 'string' 
      ? JSON.parse(row.metadata) 
      : row.metadata;
    const capabilities = typeof row.capabilities === 'string'
      ? JSON.parse(row.capabilities)
      : row.capabilities || [];

    return {
      id: row.id,
      name: row.name,
      location: row.location,
      publicUrl: row.public_url,
      status: row.status,
      lastHeartbeat: new Date(row.last_heartbeat),
      capabilities,
      metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export default NodeModel;
