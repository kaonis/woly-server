/**
 * SQLite database connection
 * Provides same interface as PostgreSQL connection for compatibility
 */

import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import config from '../config';
import logger from '../utils/logger';
import type { DatabaseQueryResult } from './connection';

class SqliteDatabase {
  public readonly isSqlite = true;
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
      this.runCompatibilityMigrations();
      logger.info('SQLite schema initialized');
    } catch (error) {
      logger.warn('Could not auto-initialize SQLite schema', { error });
    }
  }

  private runCompatibilityMigrations(): void {
    if (!this.db) {
      return;
    }

    if (this.tableExists('commands') && !this.tableHasColumn('commands', 'retry_count')) {
      this.db.exec('ALTER TABLE commands ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0');
      logger.warn('Applied SQLite compatibility migration', {
        migration: 'commands.retry_count',
      });
    }
  }

  private tableExists(tableName: string): boolean {
    if (!this.db) {
      return false;
    }

    const stmt = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
    );
    const row = stmt.get(tableName) as { name?: string } | undefined;
    return row !== undefined;
  }

  private tableHasColumn(tableName: string, columnName: string): boolean {
    if (!this.db || !this.tableExists(tableName)) {
      return false;
    }

    const pragmaStmt = this.db.prepare(`PRAGMA table_info(${tableName})`);
    const rows = pragmaStmt.all() as Array<{ name?: unknown }>;
    return rows.some((row) => row.name === columnName);
  }

  async query<T = unknown>(text: string, params?: unknown[]): Promise<DatabaseQueryResult<T>> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const start = Date.now();
    try {
      // Convert PostgreSQL-style placeholders ($1, $2) to SQLite-style (?, ?)
      const placeholderOrder: number[] = [];
      const sqliteQuery = text.replace(/\$(\d+)/g, (_match, rawIndex: string) => {
        placeholderOrder.push(Number.parseInt(rawIndex, 10));
        return '?';
      });
      const sqliteParams = params && placeholderOrder.length > 0
        ? placeholderOrder.map((position) => params[position - 1])
        : (params ?? []);

      // Detect query type
      const trimmedQuery = sqliteQuery.trim().toUpperCase();
      const isSelect = trimmedQuery.startsWith('SELECT');
      const isInsert = trimmedQuery.startsWith('INSERT');
      const isUpdate = trimmedQuery.startsWith('UPDATE');
      const isDelete = trimmedQuery.startsWith('DELETE');

      let result: DatabaseQueryResult<T>;

      if (isSelect) {
        // SELECT queries return rows
        const stmt = this.db.prepare(sqliteQuery);
        const rows = sqliteParams.length > 0 ? stmt.all(...sqliteParams) : stmt.all();
        result = {
          rows: rows as T[],
          rowCount: rows.length,
        };
      } else if (isInsert) {
        // INSERT queries - check for RETURNING clause
        if (sqliteQuery.includes('RETURNING')) {
          // SQLite 3.35+ (included in better-sqlite3 v9.4+) supports RETURNING natively
          // better-sqlite3 v12.6.2 includes SQLite 3.47.2, so we can use RETURNING directly
          // Use .all() for RETURNING queries as .run() doesn't return rows
          const stmt = this.db.prepare(sqliteQuery);
          const rows = sqliteParams.length > 0 ? stmt.all(...sqliteParams) : stmt.all();

          result = {
            rows: rows as T[],
            rowCount: rows.length,
          };
        } else {
          const stmt = this.db.prepare(sqliteQuery);
          const info = sqliteParams.length > 0 ? stmt.run(...sqliteParams) : stmt.run();
          result = {
            rows: [] as T[],
            rowCount: info.changes,
          };
        }
      } else if (isUpdate || isDelete) {
        // UPDATE/DELETE queries - SQLite 3.35+ supports RETURNING natively
        const stmt = this.db.prepare(sqliteQuery);
        if (sqliteQuery.includes('RETURNING')) {
          // Use native RETURNING support
          const rows = sqliteParams.length > 0 ? stmt.all(...sqliteParams) : stmt.all();
          result = {
            rows: rows as T[],
            rowCount: rows.length,
          };
        } else {
          const info = sqliteParams.length > 0 ? stmt.run(...sqliteParams) : stmt.run();
          result = {
            rows: [] as T[],
            rowCount: info.changes,
          };
        }
      } else {
        // Other queries (CREATE, DROP, etc.)
        this.db.exec(sqliteQuery);
        result = {
          rows: [] as T[],
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

  async getClient(): Promise<{ query: SqliteDatabase['query']; release: () => void }> {
    // SQLite doesn't use pooled clients, so return a mock client
    return {
      query: this.query.bind(this),
      release: () => undefined, // no-op for SQLite
    };
  }

  getPool(): Database.Database | null {
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
