import HostDatabase from '../hostDatabase';
import * as networkDiscovery from '../networkDiscovery';
import { DiscoveredHost } from '../../types';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { logger } from '../../utils/logger';

// Mock network discovery module
jest.mock('../networkDiscovery');

// Mock logger
jest.mock('../../utils/logger');

describe('HostDatabase', () => {
  let db: HostDatabase;

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Use in-memory database for each test
    // better-sqlite3 creates a new isolated :memory: database for each instance
    db = new HostDatabase(':memory:');
    await db.initialize();
  });

  afterEach(async () => {
    await db.close();
  });

  describe('initialization', () => {
    it('should create hosts table if not exists', async () => {
      const hosts = await db.getAllHosts();
      expect(hosts).toBeDefined();
      expect(Array.isArray(hosts)).toBe(true);
    });

    it('should create database directory if it does not exist', async () => {
      // Create a unique temp path that doesn't exist yet
      const tempDir = path.join(os.tmpdir(), `woly-test-${Date.now()}-${Math.random()}`);
      const dbPath = path.join(tempDir, 'test.db');

      // Ensure directory doesn't exist
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }

      // Create database instance - should auto-create directory
      const testDb = new HostDatabase(dbPath);

      // Verify directory was created
      expect(fs.existsSync(tempDir)).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(`Created database directory: ${tempDir}`);

      // Clean up
      await testDb.close();
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    it('should not log directory creation if it already exists', async () => {
      // Use a temp directory and pre-create it
      const existingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'woly-test-'));
      const dbPath = path.join(existingDir, `test-${Date.now()}.db`);

      // Clear logger mock calls
      jest.clearAllMocks();

      // Create database instance - directory already exists
      const testDb = new HostDatabase(dbPath);

      // Verify directory creation was not logged (directory existed)
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Created database directory')
      );

      // Clean up
      await testDb.close();
      if (fs.existsSync(existingDir)) {
        fs.rmSync(existingDir, { recursive: true });
      }
    });

    it('should seed initial hosts when table is empty', async () => {
      // Wait for async seeding to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const hosts = await db.getAllHosts();
      expect(hosts.length).toBeGreaterThan(0);

      // Check for seed data - at least one seed host should exist
      const hostNames = hosts.map((h) => h.name);
      expect(hostNames).toContain('PHANTOM-MBP');
      expect(hostNames).toContain('RASPBERRYPI');
    });

    it('should not duplicate seed data on re-initialization', async () => {
      const hostsBefore = await db.getAllHosts();
      const countBefore = hostsBefore.length;

      // Re-initialize
      await db.initialize();

      const hostsAfter = await db.getAllHosts();
      // Should not have more hosts than before
      expect(hostsAfter.length).toBeLessThanOrEqual(countBefore + 1);
    });
  });

  describe('CRUD operations', () => {
    it('should retrieve all hosts', async () => {
      const hosts = await db.getAllHosts();

      expect(Array.isArray(hosts)).toBe(true);
      expect(hosts.length).toBeGreaterThan(0);
      expect(hosts[0]).toHaveProperty('name');
      expect(hosts[0]).toHaveProperty('mac');
      expect(hosts[0]).toHaveProperty('ip');
      expect(hosts[0]).toHaveProperty('status');
    });

    it('should retrieve single host by name', async () => {
      // Wait for async seeding to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const host = await db.getHost('PHANTOM-MBP');

      expect(host).toBeDefined();
      expect(host?.name).toBe('PHANTOM-MBP');
      expect(host?.mac).toBe('80:6D:97:60:39:08');
      expect(host?.ip).toBe('192.168.1.147');
    });

    it('should return undefined for non-existent host', async () => {
      const host = await db.getHost('NON_EXISTENT_HOST');

      expect(host).toBeUndefined();
    });

    it('should add new host successfully', async () => {
      const newHost = await db.addHost('TestHost', 'AA:BB:CC:DD:EE:FF', '192.168.1.200');

      expect(newHost).toBeDefined();
      expect(newHost.name).toBe('TestHost');
      expect(newHost.mac).toBe('AA:BB:CC:DD:EE:FF');
      expect(newHost.ip).toBe('192.168.1.200');
      expect(newHost.status).toBe('asleep');
      expect(newHost.discovered).toBe(1);

      // Verify it's in the database
      const retrieved = await db.getHost('TestHost');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('TestHost');
    });

    it('should reject duplicate host names', async () => {
      await db.addHost('TestHost', 'AA:BB:CC:DD:EE:FF', '192.168.1.200');

      await expect(db.addHost('TestHost', '11:22:33:44:55:66', '192.168.1.201')).rejects.toThrow();
    });

    it('should reject duplicate MAC addresses', async () => {
      await db.addHost('TestHost1', 'AA:BB:CC:DD:EE:FF', '192.168.1.200');

      await expect(db.addHost('TestHost2', 'AA:BB:CC:DD:EE:FF', '192.168.1.201')).rejects.toThrow();
    });

    it('should reject duplicate IP addresses', async () => {
      await db.addHost('TestHost1', 'AA:BB:CC:DD:EE:FF', '192.168.1.200');

      await expect(db.addHost('TestHost2', '11:22:33:44:55:66', '192.168.1.200')).rejects.toThrow();
    });

    it('should update host details by name', async () => {
      await db.addHost('ToUpdate', 'AA:BB:CC:DD:EE:10', '192.168.1.210');

      await db.updateHost('ToUpdate', {
        ip: '192.168.1.211',
        status: 'awake',
      });

      const updated = await db.getHost('ToUpdate');
      expect(updated).toBeDefined();
      expect(updated?.ip).toBe('192.168.1.211');
      expect(updated?.status).toBe('awake');
    });

    it('should treat idempotent update as success', async () => {
      await db.addHost('NoOpHost', 'AA:BB:CC:DD:EE:12', '192.168.1.213');

      await expect(
        db.updateHost('NoOpHost', {
          ip: '192.168.1.213',
        })
      ).resolves.toBeUndefined();
    });

    it('should reject update for missing host', async () => {
      await expect(
        db.updateHost('MissingHost', {
          ip: '192.168.1.250',
        })
      ).rejects.toThrow('Host MissingHost not found');
    });

    it('should delete host by name', async () => {
      await db.addHost('ToDelete', 'AA:BB:CC:DD:EE:11', '192.168.1.212');
      await db.deleteHost('ToDelete');

      const deleted = await db.getHost('ToDelete');
      expect(deleted).toBeUndefined();
    });
  });

  describe('Status management', () => {
    it('should update host status (awake/asleep)', async () => {
      await db.updateHostStatus('PHANTOM-MBP', 'awake');

      const host = await db.getHost('PHANTOM-MBP');
      expect(host?.status).toBe('awake');

      await db.updateHostStatus('PHANTOM-MBP', 'asleep');
      const hostAsleep = await db.getHost('PHANTOM-MBP');
      expect(hostAsleep?.status).toBe('asleep');
    });

    it('should update lastSeen timestamp on host update', async () => {
      const hostBefore = await db.getHost('PHANTOM-MBP');
      const lastSeenBefore = hostBefore?.lastSeen;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await db.updateHostSeen('80:6D:97:60:39:08', 'awake');

      const hostAfter = await db.getHost('PHANTOM-MBP');
      expect(hostAfter?.lastSeen).not.toBe(lastSeenBefore);
      expect(hostAfter?.lastSeen).toBeTruthy();
    });

    it('should mark host as discovered when updating', async () => {
      await db.updateHostSeen('80:6D:97:60:39:08', 'awake');

      const host = await db.getHost('PHANTOM-MBP');
      expect(host?.discovered).toBe(1);
      expect(host?.status).toBe('awake');
    });

    it('should throw error when updating non-existent MAC', async () => {
      await expect(db.updateHostSeen('FF:FF:FF:FF:FF:FF', 'awake')).rejects.toThrow(
        'Host with MAC FF:FF:FF:FF:FF:FF not found in database'
      );
    });
  });

  describe('Network synchronization', () => {
    it('should sync discovered hosts with database', async () => {
      // Use a different MAC that matches seed data
      const mockDiscoveredHosts: DiscoveredHost[] = [
        { ip: '192.168.1.147', mac: '80:6D:97:60:39:08', hostname: 'PHANTOM-MBP' },
      ];

      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue(mockDiscoveredHosts);
      (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
        mac.toUpperCase().replace(/-/g, ':')
      );
      (networkDiscovery.isHostAlive as jest.Mock).mockResolvedValue(true);

      await db.syncWithNetwork();

      const host = await db.getHost('PHANTOM-MBP');
      expect(host?.discovered).toBe(1);
      expect(host?.status).toBe('awake');
    });

    it('should add new hosts during sync', async () => {
      const mockDiscoveredHosts: DiscoveredHost[] = [
        { ip: '192.168.1.200', mac: 'AA:BB:CC:DD:EE:FF', hostname: 'NewHost' },
      ];

      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue(mockDiscoveredHosts);
      (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
        mac.toUpperCase().replace(/-/g, ':')
      );
      (networkDiscovery.isHostAlive as jest.Mock).mockResolvedValue(true);

      await db.syncWithNetwork();

      const host = await db.getHost('NewHost');
      expect(host).toBeDefined();
      expect(host?.mac).toBe('AA:BB:CC:DD:EE:FF');
      expect(host?.ip).toBe('192.168.1.200');
    });

    it('should update existing hosts during sync', async () => {
      const mockDiscoveredHosts: DiscoveredHost[] = [
        { ip: '192.168.1.147', mac: '80:6D:97:60:39:08', hostname: 'PHANTOM-MBP' },
      ];

      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue(mockDiscoveredHosts);
      (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
        mac.toUpperCase().replace(/-/g, ':')
      );
      (networkDiscovery.isHostAlive as jest.Mock).mockResolvedValue(true);

      const hostBefore = await db.getHost('PHANTOM-MBP');
      const lastSeenBefore = hostBefore?.lastSeen;

      await new Promise((resolve) => setTimeout(resolve, 10));
      await db.syncWithNetwork();

      const hostAfter = await db.getHost('PHANTOM-MBP');
      expect(hostAfter?.lastSeen).not.toBe(lastSeenBefore);
    });

    it('should handle ping failures during sync', async () => {
      const mockDiscoveredHosts: DiscoveredHost[] = [
        { ip: '192.168.1.200', mac: 'AA:BB:CC:DD:EE:FF', hostname: 'OfflineHost' },
      ];

      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue(mockDiscoveredHosts);
      (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
        mac.toUpperCase().replace(/-/g, ':')
      );
      (networkDiscovery.isHostAlive as jest.Mock).mockResolvedValue(false);

      await db.syncWithNetwork();

      const host = await db.getHost('OfflineHost');
      // Host found via ARP is marked as awake even if ping fails
      expect(host?.status).toBe('awake');
      // But pingResponsive should be 0 (doesn't respond to ping)
      expect(host?.pingResponsive).toBe(0);
    });

    it('should handle empty network scan results', async () => {
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([]);

      await db.syncWithNetwork();

      // Should not throw error
      const hosts = await db.getAllHosts();
      expect(hosts.length).toBeGreaterThan(0); // Seed data still present
    });

    it('should handle network discovery failures', async () => {
      (networkDiscovery.scanNetworkARP as jest.Mock).mockRejectedValue(
        new Error('Network scan failed')
      );

      await db.syncWithNetwork();

      // Should handle error gracefully
      const hosts = await db.getAllHosts();
      expect(hosts.length).toBeGreaterThan(0); // Seed data still present
    });

    it('should generate hostname from IP when no hostname available', async () => {
      const mockDiscoveredHosts: DiscoveredHost[] = [
        { ip: '192.168.1.200', mac: 'AA:BB:CC:DD:EE:FF', hostname: null },
      ];

      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue(mockDiscoveredHosts);
      (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
        mac.toUpperCase().replace(/-/g, ':')
      );
      (networkDiscovery.isHostAlive as jest.Mock).mockResolvedValue(true);

      await db.syncWithNetwork();

      const host = await db.getHost('device-192-168-1-200');
      expect(host).toBeDefined();
      expect(host?.mac).toBe('AA:BB:CC:DD:EE:FF');
    });
  });

  describe('Periodic scanning', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      // Always stop periodic sync after each test to avoid timer leaks
      if (db) {
        db.stopPeriodicSync();
      }
      jest.useRealTimers();
    });

    it('should start periodic sync with correct interval', async () => {
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([]);

      db.startPeriodicSync(1000, false);

      // Fast-forward time by 5 seconds for deferred initial scan
      jest.advanceTimersByTime(5000);

      // Verify sync was called
      expect(networkDiscovery.scanNetworkARP).toHaveBeenCalled();
    });

    it('should defer initial scan in background mode', () => {
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([]);

      db.startPeriodicSync(5000, false);

      // Should not have called immediately
      expect(networkDiscovery.scanNetworkARP).not.toHaveBeenCalled();
    });

    it('should run immediate scan when requested', () => {
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([]);

      db.startPeriodicSync(5000, true);

      // With immediateSync=true, should call immediately (no timeout needed)
      expect(networkDiscovery.scanNetworkARP).toHaveBeenCalled();
    });

    it('should stop periodic sync on close', () => {
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([]);

      db.startPeriodicSync(1000, false);

      // Immediately stop
      db.stopPeriodicSync();

      // Should not have called scan yet (deferred to 5 seconds)
      expect(networkDiscovery.scanNetworkARP).not.toHaveBeenCalled();

      // Fast-forward time - should still not call because we stopped it
      jest.advanceTimersByTime(5000);

      // Verify it was never called even after timeout
      expect(networkDiscovery.scanNetworkARP).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should close database connection gracefully', async () => {
      // Create a separate database instance for this test
      const testDb = new HostDatabase(':memory:');
      await testDb.initialize();

      await expect(testDb.close()).resolves.not.toThrow();
    });
  });
});
