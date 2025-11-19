import sqlite3 from 'sqlite3';
import * as networkDiscovery from './networkDiscovery';
import { Host, DiscoveredHost } from '../types';

const sqlite = sqlite3.verbose();

/**
 * Database Service
 * Manages host synchronization and updates
 */

class HostDatabase {
  private db: sqlite3.Database;
  private initialized: boolean = false;
  private syncInterval?: NodeJS.Timeout;
  private scanInProgress: boolean = false;
  private lastScanTime: Date | null = null;

  constructor(dbPath: string = './db/woly.db') {
    this.db = new sqlite.Database(dbPath, (err) => {
      if (err) {
        console.error('Database connection error:', err.message);
      } else {
        console.log('Connected to the WoLy database.');
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
        discovered integer DEFAULT 0
      )`,
      callback
    );
  }

  /**
   * Seed initial hosts if table is empty
   */
  seedInitialHosts(callback: () => void): void {
    const hostTable = [
      ['PHANTOM-MBP', '80:6D:97:60:39:08', '192.168.1.147', 'asleep', null, 0],
      ['PHANTOM-NAS', 'BC:07:1D:DD:5B:9C', '192.168.1.5', 'asleep', null, 0],
      ['RASPBERRYPI', 'B8:27:EB:B9:EF:D7', '192.168.1.6', 'asleep', null, 0]
    ];

    this.db.get('SELECT COUNT(*) as count FROM hosts', (err: Error | null, row: any) => {
      if (row && row.count === 0) {
        hostTable.forEach((host) => {
          this.db.run(
            `INSERT INTO hosts(name, mac, ip, status, lastSeen, discovered) 
             VALUES(?,?,?,?,?,?)`,
            host,
            (error: Error | null) => {
              if (error) {
                console.error('Seed error:', error.message);
              } else {
                console.log(`Seeded host: ${host[0]}`);
              }
            }
          );
        });
      }
      callback();
    });
  }

  /**
   * Get all hosts from database
   */
  getAllHosts(): Promise<Host[]> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT name, mac, ip, status, lastSeen, discovered FROM hosts ORDER BY name';
      this.db.all(sql, (err: Error | null, rows: any[]) => {
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
      const sql = 'SELECT name, mac, ip, status, lastSeen, discovered FROM hosts WHERE name = ?';
      this.db.get(sql, [name], (err: Error | null, row: any) => {
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
      const sql = `INSERT INTO hosts(name, mac, ip, status, lastSeen, discovered) 
                   VALUES(?, ?, ?, ?, datetime('now'), 1)`;
      this.db.run(sql, [name, mac, ip, 'asleep'], function(this: any, err: Error | null) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            console.log(`Host ${name} already exists`);
          }
          reject(err);
        } else {
          console.log(`Added host: ${name}`);
          resolve({ 
            name, 
            mac, 
            ip, 
            status: 'asleep', 
            lastSeen: new Date().toISOString(),
            discovered: 1
          });
        }
      });
    });
  }

  /**
   * Update host's last seen time, status, and mark as discovered
   * Throws error if host not found
   */
  updateHostSeen(mac: string, status: 'awake' | 'asleep' = 'awake'): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE hosts SET lastSeen = datetime('now'), discovered = 1, status = ? WHERE mac = ?`;
      this.db.run(sql, [status, mac], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else if (this.changes === 0) {
          // No rows were updated - MAC doesn't exist
          reject(new Error(`Host with MAC ${mac} not found in database`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Update host status
   */
  updateHostStatus(name: string, status: 'awake' | 'asleep'): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE hosts SET status = ? WHERE name = ?';
      this.db.run(sql, [status, name], function(this: any, err: Error | null) {
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
      console.log('Scan already in progress, skipping...');
      return;
    }
    // Set scan flag at the start
    this.scanInProgress = true;
    
    try {
      console.log('Starting network scan...');
      const discoveredHosts = await networkDiscovery.scanNetworkARP();
      
      if (discoveredHosts.length === 0) {
        console.log('No hosts discovered in network scan');
        return;
      }

      console.log(`Discovered ${discoveredHosts.length} hosts on network`);

      let newHostCount = 0;
      let updatedHostCount = 0;
      let awakeCount = 0;

      // Process each discovered host with ping check
      for (const host of discoveredHosts) {
        const formattedMac = networkDiscovery.formatMAC(host.mac);
        
        // Check if host is alive via ICMP ping
        const isAlive = await networkDiscovery.isHostAlive(host.ip);
        const status = isAlive ? 'awake' : 'asleep';
        
        if (isAlive) awakeCount++;
        
        try {
          // Try to update existing host with status
          await this.updateHostSeen(formattedMac, status);
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
            // Update status for newly added host
            await this.updateHostStatus(hostName, status);
            newHostCount++;
          } catch (addErr) {
            // Silently skip if adding fails (might be duplicate MAC/IP)
            console.debug(`Could not add discovered host ${formattedMac}:`, (addErr as Error).message);
          }
        }
      }

      console.log(`Network sync complete: ${updatedHostCount} updated, ${newHostCount} new hosts, ${awakeCount} awake`);
    } catch (error: any) {
      console.error('Network sync error:', error.message);
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
    console.log(`Starting periodic network sync every ${intervalMs / 1000}s`);
    
    if (immediateSync) {
      // Initial scan (blocks startup)
      this.syncWithNetwork();
    } else {
      // Run initial scan in background after short delay
      console.log('Deferring initial network scan to background (5 seconds)');
      setTimeout(() => {
        console.log('Running deferred initial network scan...');
        this.syncWithNetwork();
      }, 5000);
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
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      console.log('Stopped periodic network sync');
    }
  }

  /**
   * Close database connection
   */
  close(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    return new Promise<void>((resolve, reject) => {
      this.db.close((err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          console.log('Database connection closed');
          resolve();
        }
      });
    });
  }
}

export default HostDatabase;
