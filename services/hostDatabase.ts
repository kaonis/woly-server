import sqlite3 from 'sqlite3';
import { config } from '../config';
import { logger } from '../utils/logger';
import * as networkDiscovery from './networkDiscovery';
import { Host } from '../types';

const sqlite = sqlite3.verbose();

/**
 * Database Service
 * Manages host synchronization and updates
 */

class HostDatabase {
  private db!: sqlite3.Database; // Definite assignment assertion - assigned in connectWithRetry
  private initialized: boolean = false;
  private syncInterval?: NodeJS.Timeout;
  private deferredSyncTimeout?: NodeJS.Timeout;
  private scanInProgress: boolean = false;
  private lastScanTime: Date | null = null;
  private connectionRetries: number = 0;
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // 1 second

  constructor(dbPath: string = './db/woly.db') {
    this.connectWithRetry(dbPath);
  }

  /**
   * Connect to database with retry logic
   */
  private connectWithRetry(dbPath: string, attempt: number = 1): void {
    this.db = new sqlite.Database(dbPath, (err) => {
      if (err) {
        logger.error(`Database connection error (attempt ${attempt}/${this.maxRetries}):`, {
          error: err.message,
        });

        if (attempt < this.maxRetries) {
          logger.info(`Retrying database connection in ${this.retryDelay}ms...`);
          setTimeout(() => {
            this.connectWithRetry(dbPath, attempt + 1);
          }, this.retryDelay * attempt); // Exponential backoff
        } else {
          logger.error('Max database connection retries reached. Application may be unstable.');
          throw new Error('Failed to connect to database after multiple attempts');
        }
      } else {
        logger.info('Connected to the WoLy database.');
        this.connectionRetries = 0;
      }
    });
  }

  /**
   * Initialize database with table and seed data
   */
  async initialize(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.createTable(() => {
        this.seedInitialHosts(() => {
          this.initialized = true;
          resolve();
        });
      });
    });
  }

  /**
   * Create hosts table if not exists
   */
  createTable(callback: () => void): void {
    this.db.run(
      `CREATE TABLE IF NOT EXISTS hosts(
        name text PRIMARY KEY UNIQUE,
        mac text NOT NULL UNIQUE,
        ip text NOT NULL UNIQUE,
        status text NOT NULL,
        lastSeen datetime,
        discovered integer DEFAULT 0,
        pingResponsive integer
      )`,
      () => {
        this.db.run(`ALTER TABLE hosts ADD COLUMN pingResponsive integer`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            logger.warn('Could not add pingResponsive column:', { error: err.message });
          }
          callback();
        });
      }
    );
  }

  /**
   * Seed initial hosts if table is empty
   */
  seedInitialHosts(callback: () => void): void {
    const hostTable = [
      ['PHANTOM-MBP', '80:6D:97:60:39:08', '192.168.1.147', 'asleep', null, 0, null],
      ['PHANTOM-NAS', 'BC:07:1D:DD:5B:9C', '192.168.1.5', 'asleep', null, 0, null],
      ['RASPBERRYPI', 'B8:27:EB:B9:EF:D7', '192.168.1.6', 'asleep', null, 0, null],
    ];

    this.db.get(
      'SELECT COUNT(*) as count FROM hosts',
      (err: Error | null, row: { count: number } | undefined) => {
        if (row && row.count === 0) {
          let completed = 0;
          const total = hostTable.length;

          hostTable.forEach((host) => {
            this.db.run(
              `INSERT INTO hosts(name, mac, ip, status, lastSeen, discovered, pingResponsive)
             VALUES(?,?,?,?,?,?,?)`,
              host,
              (error: Error | null) => {
                if (error) {
                  logger.error('Seed error:', { error: error.message });
                } else {
                  logger.info(`Seeded host: ${host[0]}`);
                }
                completed++;
                if (completed === total) {
                  callback();
                }
              }
            );
          });
        } else {
          callback();
        }
      }
    );
  }

  /**
   * Get all hosts from database
   */
  getAllHosts(): Promise<Host[]> {
    return new Promise((resolve, reject) => {
      const sql =
        'SELECT name, mac, ip, status, lastSeen, discovered, pingResponsive FROM hosts ORDER BY name';
      this.db.all(sql, (err: Error | null, rows: Host[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Check if a network scan is currently in progress
   */
  isScanInProgress(): boolean {
    return this.scanInProgress;
  }

  /**
   * Get the timestamp of the last completed network scan
   */
  getLastScanTime(): string | null {
    return this.lastScanTime ? this.lastScanTime.toISOString() : null;
  }

  /**
   * Get a single host by name
   */
  getHost(name: string): Promise<Host | undefined> {
    return new Promise((resolve, reject) => {
      const sql =
        'SELECT name, mac, ip, status, lastSeen, discovered, pingResponsive FROM hosts WHERE name = ?';
      this.db.get(sql, [name], (err: Error | null, row: Host | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Add a new host to database
   */
  addHost(name: string, mac: string, ip: string): Promise<Host> {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO hosts(name, mac, ip, status, lastSeen, discovered, pingResponsive)
                   VALUES(?, ?, ?, ?, datetime('now'), 1, NULL)`;
      this.db.run(
        sql,
        [name, mac, ip, 'asleep'],
        function (this: sqlite3.RunResult, err: Error | null) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
              logger.warn(`Host ${name} already exists`);
            }
            reject(err);
          } else {
            logger.info(`Added host: ${name}`);
            resolve({
              name,
              mac,
              ip,
              status: 'asleep',
              lastSeen: new Date().toISOString(),
              discovered: 1,
              pingResponsive: undefined,
            });
          }
        }
      );
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
      this.db.run(
        sql,
        [status, pingResponsive, mac],
        function (this: sqlite3.RunResult, err: Error | null) {
          if (err) {
            reject(err);
          } else if (this.changes === 0) {
            // No rows were updated - MAC doesn't exist
            reject(new Error(`Host with MAC ${mac} not found in database`));
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Update host status
   */
  updateHostStatus(name: string, status: 'awake' | 'asleep'): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE hosts SET status = ? WHERE name = ?';
      this.db.run(sql, [status, name], function (this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Synchronize database with discovered network hosts
   */
  async syncWithNetwork() {
    // Prevent concurrent scans
    if (this.scanInProgress) {
      logger.info('Scan already in progress, skipping...');
      return;
    }
    // Set scan flag at the start
    this.scanInProgress = true;

    try {
      logger.info('Starting network scan...');
      const discoveredHosts = await networkDiscovery.scanNetworkARP();

      if (discoveredHosts.length === 0) {
        logger.info('No hosts discovered in network scan');
        return;
      }

      logger.info(`Discovered ${discoveredHosts.length} hosts on network`);

      let newHostCount = 0;
      let updatedHostCount = 0;
      let awakeCount = 0;

      // Process each discovered host
      for (const host of discoveredHosts) {
        const formattedMac = networkDiscovery.formatMAC(host.mac);

        // Determine if host is alive:
        // - If found via ARP, it's responding to network requests (awake by default)
        // - Always check ping responsiveness for additional status information
        let isAlive = true; // ARP discovery means host is awake
        let pingResponsive: number | null = null;

        // Always check ping to track responsiveness
        const pingResult = await networkDiscovery.isHostAlive(host.ip);
        pingResponsive = pingResult ? 1 : 0;

        if (config.network.usePingValidation) {
          // If ping validation is enabled, use it to determine awake status
          // (but this is not recommended as many devices block ping)
          isAlive = pingResult;
          if (!isAlive) {
            logger.debug(
              `Host ${host.ip} found via ARP but did not respond to ping - marking as awake anyway`
            );
            // Even if ping fails, ARP response means it's awake
            isAlive = true;
          }
        }

        const status = isAlive ? 'awake' : 'asleep';

        if (isAlive) awakeCount++;

        try {
          // Try to update existing host with status and ping responsiveness
          await this.updateHostSeen(formattedMac, status, pingResponsive);
          updatedHostCount++;
        } catch (err) {
          // Host not in DB yet, try to add it
          try {
            // Generate hostname: prefer actual hostname, fallback to IP-based name
            let hostName;

            if (host.hostname) {
              // Use actual network hostname if available
              hostName = host.hostname;
            } else {
              // Generate from IP address (e.g., "device-192-168-1-115")
              hostName = `device-${host.ip.replace(/\./g, '-')}`;
            }

            await this.addHost(hostName, formattedMac, host.ip);
            // Update status and ping responsiveness for newly added host
            await this.updateHostStatus(hostName, status);
            await this.updateHostSeen(formattedMac, status, pingResponsive);
            newHostCount++;
          } catch (addErr) {
            // Silently skip if adding fails (might be duplicate MAC/IP)
            logger.debug(`Could not add discovered host ${formattedMac}:`, {
              error: (addErr as Error).message,
            });
          }
        }
      }

      logger.info(
        `Network sync complete: ${updatedHostCount} updated, ${newHostCount} new hosts, ${awakeCount} awake`
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Network sync error:', { error: message });
    } finally {
      // Always clear scan flag and update timestamp, even if scan failed
      this.scanInProgress = false;
      this.lastScanTime = new Date();
    }
  }

  /**
   * Start periodic network scanning
   * @param {number} intervalMs - Scan interval in milliseconds (default: 5 minutes)
   * @param {boolean} immediateSync - Whether to run initial sync (default: false for better startup)
   */
  startPeriodicSync(intervalMs: number = 5 * 60 * 1000, immediateSync: boolean = false): void {
    logger.info(`Starting periodic network sync every ${intervalMs / 1000}s`);

    if (immediateSync) {
      // Initial scan (blocks startup)
      this.syncWithNetwork();
    } else {
      // Run initial scan in background after short delay
      logger.info(
        `Deferring initial network scan to background (${config.network.scanDelay / 1000} seconds)`
      );
      this.deferredSyncTimeout = setTimeout(() => {
        logger.info('Running deferred initial network scan...');
        this.syncWithNetwork();
      }, config.network.scanDelay);
    }

    // Recurring scans
    this.syncInterval = setInterval(() => {
      this.syncWithNetwork();
    }, intervalMs);
  }

  /**
   * Stop periodic network scanning
   */
  stopPeriodicSync() {
    if (this.deferredSyncTimeout) {
      clearTimeout(this.deferredSyncTimeout);
      this.deferredSyncTimeout = undefined;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
      logger.info('Stopped periodic network sync');
    }
  }

  /**
   * Close database connection
   */
  close(): Promise<void> {
    if (this.deferredSyncTimeout) {
      clearTimeout(this.deferredSyncTimeout);
      this.deferredSyncTimeout = undefined;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }
    return new Promise<void>((resolve, reject) => {
      this.db.close((err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          logger.info('Database connection closed');
          resolve();
        }
      });
    });
  }
}

export default HostDatabase;
