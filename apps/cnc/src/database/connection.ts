/**
 * Database connection factory
 * Dynamically chooses PostgreSQL or SQLite based on configuration
 */

import { Pool, PoolClient } from 'pg';
import config from '../config';
import logger from '../utils/logger';
import SqliteDatabase from './sqlite-connection';

// Query result type compatible with both PostgreSQL and SQLite
export interface DatabaseQueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
}

// Database interface for type safety
export interface IDatabase {
  isSqlite: boolean;
  connect(): Promise<void>;
  query<T = unknown>(text: string, params?: unknown[]): Promise<DatabaseQueryResult<T>>;
  getClient(): Promise<PoolClient | { query: IDatabase['query']; release: () => void }>;
  getPool(): Pool | unknown;
  close(): Promise<void>;
}

class PostgresDatabase implements IDatabase {
  public readonly isSqlite = false;
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 20, // Maximum number of clients
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', { error: err.message });
    });
  }

  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      logger.info('PostgreSQL database connected successfully');
      client.release();
    } catch (error) {
      logger.error('Failed to connect to PostgreSQL database', { error });
      throw error;
    }
  }

  async query<T = unknown>(text: string, params?: unknown[]): Promise<DatabaseQueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Executed query', { text, duration, rows: result.rowCount });
      return {
        rows: result.rows as T[],
        rowCount: result.rowCount ?? 0,
      };
    } catch (error) {
      logger.error('Query error', { text, error });
      throw error;
    }
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  getPool(): Pool {
    return this.pool;
  }

  async close(): Promise<void> {
    await this.pool.end();
    logger.info('PostgreSQL database connection closed');
  }
}

// Factory function to create appropriate database instance
function createDatabase(): IDatabase {
  const dbType = config.dbType || 'postgres';

  if (dbType === 'sqlite') {
    logger.info('Using SQLite database');
    return new SqliteDatabase();
  } else {
    logger.info('Using PostgreSQL database');
    return new PostgresDatabase();
  }
}

export const db = createDatabase();
export default db;
