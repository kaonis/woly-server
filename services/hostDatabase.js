const sqlite3 = require('sqlite3').verbose();
const networkDiscovery = require('./networkDiscovery');

/**
 * Database Service
 * Manages host synchronization and updates
 */

class HostDatabase {
  constructor(dbPath = './db/woly.db') {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Database connection error:', err.message);
      } else {
        console.log('Connected to the WoLy database.');
      }
    });
    
    this.initialized = false;
  }

  /**
   * Initialize database with table and seed data
   */
  async initialize() {
    return new Promise((resolve) => {
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
  createTable(callback) {
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
  seedInitialHosts(callback) {
    const hostTable = [
      ['whitehead', '50:E5:49:55:4A:8C', '192.168.1.10', 'asleep', null, 0],
      ['phantom-senior', '00:24:8C:23:D6:3E', '192.168.1.7', 'asleep', null, 0],
      ['phantom qualcomm', '40:8D:5C:53:90:91', '192.168.1.100', 'asleep', null, 0],
      ['phantom intel', '40:8D:5C:53:90:93', '192.168.1.101', 'asleep', null, 0],
      ['giota-pc', '74:2F:68:C8:BD:C5', '192.168.1.8', 'asleep', null, 0],
      ['jb-ng', '50:E5:49:EF:26:DA', '192.168.1.49', 'asleep', null, 0],
      ['jb-pc', '50:E5:49:56:4A:8C', '192.168.1.50', 'asleep', null, 0]
    ];

    this.db.get('SELECT COUNT(*) as count FROM hosts', (err, row) => {
      if (row && row.count === 0) {
        hostTable.forEach((host) => {
          this.db.run(
            `INSERT INTO hosts(name, mac, ip, status, lastSeen, discovered) 
             VALUES(?,?,?,?,?,?)`,
            host,
            (error) => {
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
  getAllHosts() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT name, mac, ip, status, lastSeen, discovered FROM hosts ORDER BY name';
      this.db.all(sql, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Get a single host by name
   */
  getHost(name) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT name, mac, ip, status, lastSeen, discovered FROM hosts WHERE name = ?';
      this.db.get(sql, [name], (err, row) => {
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
  addHost(name, mac, ip) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO hosts(name, mac, ip, status, lastSeen, discovered) 
                   VALUES(?, ?, ?, ?, datetime('now'), 1)`;
      this.db.run(sql, [name, mac, ip, 'asleep'], function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            console.log(`Host ${name} already exists`);
          }
          reject(err);
        } else {
          console.log(`Added host: ${name}`);
          resolve({ name, mac, ip, status: 'asleep' });
        }
      });
    });
  }

  /**
   * Update host's last seen time and mark as discovered
   */
  updateHostSeen(mac) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE hosts SET lastSeen = datetime('now'), discovered = 1 WHERE mac = ?`;
      this.db.run(sql, [mac], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Update host status
   */
  updateHostStatus(name, status) {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE hosts SET status = ? WHERE name = ?';
      this.db.run(sql, [status, name], function(err) {
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
    try {
      console.log('Starting network scan...');
      const discoveredHosts = await networkDiscovery.scanNetworkARP();
      
      if (discoveredHosts.length === 0) {
        console.log('No hosts discovered in network scan');
        return;
      }

      console.log(`Discovered ${discoveredHosts.length} hosts on network`);

      // Update lastSeen for hosts that were discovered
      for (const host of discoveredHosts) {
        try {
          await this.updateHostSeen(networkDiscovery.formatMAC(host.mac));
        } catch (err) {
          // Host not in DB yet, could add it if needed
        }
      }

      console.log('Network sync complete');
    } catch (error) {
      console.error('Network sync error:', error.message);
    }
  }

  /**
   * Start periodic network scanning
   * @param {number} intervalMs - Scan interval in milliseconds (default: 5 minutes)
   */
  startPeriodicSync(intervalMs = 5 * 60 * 1000) {
    console.log(`Starting periodic network sync every ${intervalMs / 1000}s`);
    
    // Initial scan
    this.syncWithNetwork();
    
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
  close() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
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

module.exports = HostDatabase;
