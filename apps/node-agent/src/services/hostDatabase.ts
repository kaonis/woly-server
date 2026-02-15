import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { logger } from '../utils/logger';
import * as networkDiscovery from './networkDiscovery';
import { Host } from '../types';

/**
 * Database Service
 * Manages host synchronization and updates
 */

class HostDatabase extends EventEmitter {
  private db: Database.Database | null = null;
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // 1 second
  private ready: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;

  constructor(dbPath: string = './db/woly.db') {
    super();
    this.ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.connectWithRetry(dbPath);
  }

  private assertReady(): Database.Database {
    if (!this.db) {
      throw new Error('Database is not connected');
    }

    return this.db;
  }

  /**
   * Connect to database with retry logic
   */
  private connectWithRetry(dbPath: string, attempt: number = 1): void {
    try {
      // Ensure parent directory exists
      const dir = dirname(dbPath);
      const created = mkdirSync(dir, { recursive: true });
      if (created) {
        logger.info(`Created database directory: ${dir}`);
      }

      this.db = new Database(dbPath);
      logger.info('Connected to the WoLy database.');
      this.readyResolve();
    } catch (err) {
      const error = err as Error;
      logger.error(`Database connection error (attempt ${attempt}/${this.maxRetries}):`, {
        error: error.message,
      });

      if (attempt < this.maxRetries) {
        logger.info(`Retrying database connection in ${this.retryDelay}ms...`);
        setTimeout(() => {
          this.connectWithRetry(dbPath, attempt + 1);
        }, this.retryDelay * attempt); // Exponential backoff
      } else {
        const fatalError = new Error('Failed to connect to database after multiple attempts');
        logger.error('Max database connection retries reached.');
        this.readyReject(fatalError);
      }
    }
  }

  /**
   * Initialize database with table
   */
  async initialize(): Promise<void> {
    // Wait for database connection to be ready
    await this.ready;

    this.createTable();
    // Database is ready
  }

  /**
   * Create hosts table if not exists
   */
  createTable(): void {
    const db = this.assertReady();
    db.exec(`CREATE TABLE IF NOT EXISTS hosts(
      name text PRIMARY KEY UNIQUE,
      mac text NOT NULL UNIQUE,
      ip text NOT NULL UNIQUE,
      status text NOT NULL,
      lastSeen datetime,
      discovered integer DEFAULT 0,
      pingResponsive integer
    )`);

    // Try to add pingResponsive column if it doesn't exist
    try {
      db.exec(`ALTER TABLE hosts ADD COLUMN pingResponsive integer`);
    } catch (err) {
      const error = err as Error;
      if (!error.message.includes('duplicate column')) {
        logger.warn('Could not add pingResponsive column:', { error: error.message });
      }
    }
  }

  /**
   * Get all hosts from database
   */
  async getAllHosts(): Promise<Host[]> {
    try {
      const db = this.assertReady();
      return db
        .prepare(
          'SELECT name, mac, ip, status, lastSeen, discovered, pingResponsive FROM hosts ORDER BY name'
        )
        .all() as Host[];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get all hosts:', { error: message });
      throw error;
    }
  }

  /**
   * Get a single host by name
   */
  async getHost(name: string): Promise<Host | undefined> {
    try {
      const db = this.assertReady();
      return db
        .prepare(
          'SELECT name, mac, ip, status, lastSeen, discovered, pingResponsive FROM hosts WHERE name = ?'
        )
        .get(name) as Host | undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to get host ${name}:`, { error: message });
      throw error;
    }
  }

  /**
   * Get a single host by MAC address
   */
  async getHostByMAC(mac: string): Promise<Host | undefined> {
    try {
      const db = this.assertReady();
      const formattedMac = networkDiscovery.formatMAC(mac);
      return db
        .prepare(
          'SELECT name, mac, ip, status, lastSeen, discovered, pingResponsive FROM hosts WHERE mac = ?'
        )
        .get(formattedMac) as Host | undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to get host by MAC ${mac}:`, { error: message });
      throw error;
    }
  }

  /**
   * Add a new host to database
   */
  addHost(name: string, mac: string, ip: string): Promise<Host> {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO hosts(name, mac, ip, status, lastSeen, discovered, pingResponsive)
                   VALUES(?, ?, ?, ?, datetime('now'), 0, NULL)`;
      try {
        const db = this.assertReady();
        const formattedMac = networkDiscovery.formatMAC(mac);
        db.prepare(sql).run(name, formattedMac, ip, 'asleep');
        logger.info(`Added host: ${name}`);
        resolve({
          name,
          mac: formattedMac,
          ip,
          status: 'asleep',
          lastSeen: new Date().toISOString(),
          discovered: 0,
          pingResponsive: null,
        });
      } catch (err) {
        const error = err as Error;
        if (error.message.includes('UNIQUE constraint failed')) {
          logger.warn(`Host ${name} already exists`);
        }
        reject(error);
      }
    });
  }

  /**
   * Update host's last seen time, status, and mark as discovered
   * Throws error if host not found
   */
  updateHostSeen(
    mac: string,
    status: 'awake' | 'asleep' = 'awake',
    pingResponsive: number | null = null
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE hosts SET lastSeen = datetime('now'), discovered = 1, status = ?, pingResponsive = ? WHERE mac = ?`;
      try {
        const db = this.assertReady();
        const formattedMac = networkDiscovery.formatMAC(mac);
        const info = db.prepare(sql).run(status, pingResponsive, formattedMac);
        if (info.changes === 0) {
          // No rows were updated - MAC doesn't exist
          reject(new Error(`Host with MAC ${formattedMac} not found in database`));
        } else {
          resolve();
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Update host properties by name
   */
  updateHost(
    name: string,
    updates: Partial<Pick<Host, 'name' | 'mac' | 'ip' | 'status'>>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let db: Database.Database;
      try {
        db = this.assertReady();
      } catch (err) {
        reject(err);
        return;
      }
      const fields: string[] = [];
      const values: Array<string> = [];

      if (updates.name !== undefined) {
        fields.push('name = ?');
        values.push(updates.name);
      }
      if (updates.mac !== undefined) {
        fields.push('mac = ?');
        values.push(networkDiscovery.formatMAC(updates.mac));
      }
      if (updates.ip !== undefined) {
        fields.push('ip = ?');
        values.push(updates.ip);
      }
      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }

      if (fields.length === 0) {
        resolve();
        return;
      }

      values.push(name);

      const sql = `UPDATE hosts SET ${fields.join(', ')} WHERE name = ?`;
      try {
        const info = db.prepare(sql).run(values);
        if (info.changes === 0) {
          // Check if host exists
          const exists = db.prepare('SELECT 1 FROM hosts WHERE name = ?').get(name);
          if (exists) {
            resolve(); // Host exists but no changes needed
          } else {
            reject(new Error(`Host ${name} not found`));
          }
        } else {
          resolve();
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Delete host by name
   */
  deleteHost(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM hosts WHERE name = ?';
      try {
        const db = this.assertReady();
        const info = db.prepare(sql).run(name);
        if (info.changes === 0) {
          reject(new Error(`Host ${name} not found`));
        } else {
          resolve();
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Update host status
   */
  updateHostStatus(name: string, status: 'awake' | 'asleep'): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE hosts SET status = ? WHERE name = ?';
      try {
        const db = this.assertReady();
        db.prepare(sql).run(status, name);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Close database connection
   */
  close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        if (!this.db) {
          logger.info('Database connection already closed');
          resolve();
          return;
        }
        this.db.close();
        this.db = null;
        logger.info('Database connection closed');
        resolve();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to close database connection:', { error: message });
        reject(error);
      }
    });
  }
}

export default HostDatabase;
