/**
 * SQLite database connection
 * Provides same interface as PostgreSQL connection for compatibility
 */

import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import config from '../config';
import logger from '../utils/logger';

class SqliteDatabase {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor() {
    // Extract path from DATABASE_URL or use default
    // Format: sqlite://path/to/db.sqlite or just ./db/woly-cnc.db
    const dbUrl = config.databaseUrl || '';
    if (dbUrl.startsWith('sqlite://')) {
      this.dbPath = dbUrl.replace('sqlite://', '');
    } else if (dbUrl.includes('postgresql://')) {
      // Fallback if DATABASE_URL is postgres (shouldn't happen)
      this.dbPath = join(process.cwd(), 'db', 'woly-cnc.db');
    } else {
      this.dbPath = dbUrl || join(process.cwd(), 'db', 'woly-cnc.db');
    }
  }

  async connect(): Promise<void> {
    if (this.db) {
      return;
    }

    try {
      // Ensure parent directory exists
      mkdirSync(dirname(this.dbPath), { recursive: true });

      this.db = new Database(this.dbPath, { verbose: logger.debug.bind(logger) });

      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');

      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');

      // Auto-initialize schema (all statements use IF NOT EXISTS)
      this.initializeSchema();

      logger.info('SQLite database connected successfully', { path: this.dbPath });
    } catch (error) {
      logger.error('Failed to connect to SQLite database', { error });
      throw error;
    }
  }

  private initializeSchema(): void {
    if (!this.db) return;

    try {
      const schemaPath = join(__dirname, 'schema.sqlite.sql');
      const schema = readFileSync(schemaPath, 'utf-8');
      this.db.exec(schema);
      logger.info('SQLite schema initialized');
    } catch (error) {
      logger.warn('Could not auto-initialize SQLite schema', { error });
    }
  }

  async query(text: string, params?: any[]): Promise<any> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const start = Date.now();
    try {
      // Convert PostgreSQL-style placeholders ($1, $2) to SQLite-style (?, ?)
      const sqliteQuery = text.replace(/\$(\d+)/g, '?');

      // Detect query type
      const trimmedQuery = sqliteQuery.trim().toUpperCase();
      const isSelect = trimmedQuery.startsWith('SELECT');
      const isInsert = trimmedQuery.startsWith('INSERT');
      const isUpdate = trimmedQuery.startsWith('UPDATE');
      const isDelete = trimmedQuery.startsWith('DELETE');

      let result: any;

      if (isSelect) {
        // SELECT queries return rows
        const stmt = this.db.prepare(sqliteQuery);
        const rows = params ? stmt.all(...params) : stmt.all();
        result = {
          rows,
          rowCount: rows.length,
        };
      } else if (isInsert) {
        // INSERT queries - check for RETURNING clause
        if (sqliteQuery.includes('RETURNING')) {
          // SQLite doesn't support RETURNING, so we need to get the last insert rowid
          const queryWithoutReturning = sqliteQuery.replace(/RETURNING .*/i, '');
          const stmt = this.db.prepare(queryWithoutReturning);
          const info = params ? stmt.run(...params) : stmt.run();

          // Get the inserted row (assumes primary key is id or rowid)
          const selectStmt = this.db.prepare('SELECT * FROM nodes WHERE rowid = ?');
          const rows = [selectStmt.get(info.lastInsertRowid)];

          result = {
            rows,
            rowCount: info.changes,
          };
        } else {
          const stmt = this.db.prepare(sqliteQuery);
          const info = params ? stmt.run(...params) : stmt.run();
          result = {
            rows: [],
            rowCount: info.changes,
          };
        }
      } else if (isUpdate || isDelete) {
        // UPDATE/DELETE queries
        if (sqliteQuery.includes('RETURNING')) {
          // Handle RETURNING for UPDATE/DELETE
          const queryWithoutReturning = sqliteQuery.replace(/RETURNING .*/i, '');
          const stmt = this.db.prepare(queryWithoutReturning);
          const info = params ? stmt.run(...params) : stmt.run();
          result = {
            rows: [],
            rowCount: info.changes,
          };
        } else {
          const stmt = this.db.prepare(sqliteQuery);
          const info = params ? stmt.run(...params) : stmt.run();
          result = {
            rows: [],
            rowCount: info.changes,
          };
        }
      } else {
        // Other queries (CREATE, DROP, etc.)
        this.db.exec(sqliteQuery);
        result = {
          rows: [],
          rowCount: 0,
        };
      }

      const duration = Date.now() - start;
      logger.debug('Executed query', { text: sqliteQuery, duration, rows: result.rowCount });

      return result;
    } catch (error) {
      logger.error('Query error', { text, error });
      throw error;
    }
  }

  async getClient(): Promise<any> {
    // SQLite doesn't use pooled clients, so return a mock client
    return {
      query: this.query.bind(this),
      release: () => undefined, // no-op for SQLite
    };
  }

  getPool(): any {
    // Return the database instance for compatibility
    return this.db;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('SQLite database connection closed');
    }
  }
}

export default SqliteDatabase;
