import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import * as networkDiscovery from './networkDiscovery';
import { Host } from '../types';

/**
 * Database Service
 * Manages host synchronization and updates
 */

class HostDatabase extends EventEmitter {
  private db!: Database.Database; // Definite assignment assertion - assigned in connectWithRetry
  private syncInterval?: NodeJS.Timeout;
  private deferredSyncTimeout?: NodeJS.Timeout;
  private scanInProgress: boolean = false;
  private lastScanTime: Date | null = null;
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
   * Initialize database with table and seed data
   */
  async initialize(): Promise<void> {
    // Wait for database connection to be ready
    await this.ready;

    this.createTable();
    this.seedInitialHosts();
    // Database is ready
  }

  /**
   * Create hosts table if not exists
   */
  createTable(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS hosts(
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
      this.db.exec(`ALTER TABLE hosts ADD COLUMN pingResponsive integer`);
    } catch (err) {
      const error = err as Error;
      if (!error.message.includes('duplicate column')) {
        logger.warn('Could not add pingResponsive column:', { error: error.message });
      }
    }
  }

  /**
   * Seed initial hosts if table is empty
   */
  seedInitialHosts(): void {
    const hostTable = [
      ['PHANTOM-MBP', '80:6D:97:60:39:08', '192.168.1.147', 'asleep', null, 0, null],
      ['PHANTOM-NAS', 'BC:07:1D:DD:5B:9C', '192.168.1.5', 'asleep', null, 0, null],
      ['RASPBERRYPI', 'B8:27:EB:B9:EF:D7', '192.168.1.6', 'asleep', null, 0, null],
    ];

    const countRow = this.db.prepare('SELECT COUNT(*) as count FROM hosts').get() as {
      count: number;
    };

    if (countRow.count === 0) {
      const insert = this.db.prepare(
        `INSERT INTO hosts(name, mac, ip, status, lastSeen, discovered, pingResponsive)
         VALUES(?,?,?,?,?,?,?)`
      );

      for (const host of hostTable) {
        try {
          insert.run(host);
          logger.info(`Seeded host: ${host[0]}`);
        } catch (error) {
          logger.error('Seed error:', { error: (error as Error).message });
        }
      }
    }
  }

  /**
   * Get all hosts from database
   */
  async getAllHosts(): Promise<Host[]> {
    try {
      return this.db
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
  async getHost(name: string): Promise<Host | undefined> {
    try {
      return this.db
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
      const formattedMac = networkDiscovery.formatMAC(mac);
      return this.db
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
        const formattedMac = networkDiscovery.formatMAC(mac);
        this.db.prepare(sql).run(name, formattedMac, ip, 'asleep');
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
        const formattedMac = networkDiscovery.formatMAC(mac);
        const info = this.db.prepare(sql).run(status, pingResponsive, formattedMac);
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
        const info = this.db.prepare(sql).run(values);
        if (info.changes === 0) {
          // Check if host exists
          const exists = this.db.prepare('SELECT 1 FROM hosts WHERE name = ?').get(name);
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
        const info = this.db.prepare(sql).run(name);
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
        this.db.prepare(sql).run(status, name);
        resolve();
      } catch (err) {
        reject(err);
      }
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

      // Ping all hosts in parallel with concurrency limiting
      const pingConcurrency = config.network.pingConcurrency;
      const hostsWithPingResults: Array<{
        host: typeof discoveredHosts[0];
        pingResponsive: number | null;
        status: 'awake' | 'asleep';
      }> = [];

      // Process hosts in batches for concurrent pinging
      for (let i = 0; i < discoveredHosts.length; i += pingConcurrency) {
        const batch = discoveredHosts.slice(i, i + pingConcurrency);

        const batchResults = await Promise.all(
          batch.map(async (host) => {
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

            const status: 'awake' | 'asleep' = isAlive ? 'awake' : 'asleep';

            return { host, pingResponsive, status };
          })
        );

        hostsWithPingResults.push(...batchResults);
      }

      // Process database operations sequentially to avoid race conditions
      for (const { host, pingResponsive, status } of hostsWithPingResults) {
        const formattedMac = networkDiscovery.formatMAC(host.mac);

        if (status === 'awake') awakeCount++;

        try {
          // Try to update existing host with status and ping responsiveness
          await this.updateHostSeen(formattedMac, status, pingResponsive);
          updatedHostCount++;

          // Emit host-updated event for agent mode
          // Get host by MAC to emit event
          const hostByMac = await this.getHostByMAC(formattedMac);
          if (hostByMac) {
            this.emit('host-updated', hostByMac);
          }
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

            // Emit host-discovered event for agent mode
            const newHost = await this.getHost(hostName);
            if (newHost) {
              this.emit('host-discovered', newHost);
            }
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

      // Emit scan-complete event for agent mode
      const allHosts = await this.getAllHosts();
      this.emit('scan-complete', allHosts.length);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Network sync error: ${message}`);
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
      try {
        this.db.close();
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
