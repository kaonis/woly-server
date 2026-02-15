import HostDatabase from '../hostDatabase';
import ScanOrchestrator from '../scanOrchestrator';
import * as networkDiscovery from '../networkDiscovery';
import { DiscoveredHost } from '../../types';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { logger } from '../../utils/logger';
import { config } from '../../config';

// Mock network discovery module
jest.mock('../networkDiscovery');

// Mock logger
jest.mock('../../utils/logger');

// Mock config
jest.mock('../../config', () => ({
  config: {
    server: {
      port: 8082,
      host: '0.0.0.0',
      env: 'test',
    },
    network: {
      scanInterval: 300000,
      scanDelay: 5000,
      pingTimeout: 2000,
      pingConcurrency: 10,
      usePingValidation: false, // Default value
    },
    logging: {
      level: 'info',
    },
  },
}));

describe('HostDatabase', () => {
  let db: HostDatabase;
  let scanOrchestrator: ScanOrchestrator;

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Default MAC normalization used throughout HostDatabase.
    (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
      mac.toUpperCase().replace(/-/g, ':')
    );

    // Use in-memory database for each test
    // better-sqlite3 creates a new isolated :memory: database for each instance
    db = new HostDatabase(':memory:');
    await db.initialize();
    scanOrchestrator = new ScanOrchestrator(db);
  });

  afterEach(async () => {
    scanOrchestrator.stopPeriodicSync();
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

    it('should initialize with empty database when no seed data', async () => {
      // Wait for async initialization to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const hosts = await db.getAllHosts();
      // Since we removed seed data, database should be empty initially
      expect(hosts.length).toBe(0);
    });

    it('should not duplicate data on re-initialization', async () => {
      // Add a test host
      await db.addHost('TestHost1', 'AA:BB:CC:DD:EE:01', '192.168.1.201');
      
      const hostsBefore = await db.getAllHosts();
      const countBefore = hostsBefore.length;

      // Re-initialize
      await db.initialize();

      const hostsAfter = await db.getAllHosts();
      // Should have same count as before (re-initialization doesn't add data)
      expect(hostsAfter.length).toBe(countBefore);
    });
  });

  describe('CRUD operations', () => {
    it('should retrieve all hosts', async () => {
      // Add test host first since seed data is removed
      await db.addHost('TestHost1', 'AA:BB:CC:DD:EE:01', '192.168.1.201');
      
      const hosts = await db.getAllHosts();

      expect(Array.isArray(hosts)).toBe(true);
      expect(hosts.length).toBeGreaterThan(0);
      expect(hosts[0]).toHaveProperty('name');
      expect(hosts[0]).toHaveProperty('mac');
      expect(hosts[0]).toHaveProperty('ip');
      expect(hosts[0]).toHaveProperty('status');
    });

    it('should retrieve single host by name', async () => {
      // Add test host explicitly
      await db.addHost('TestHost2', 'AA:BB:CC:DD:EE:02', '192.168.1.202');

      const host = await db.getHost('TestHost2');

      expect(host).toBeDefined();
      expect(host?.name).toBe('TestHost2');
      expect(host?.mac).toBe('AA:BB:CC:DD:EE:02');
      expect(host?.ip).toBe('192.168.1.202');
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
      expect(newHost.discovered).toBe(0);
      expect(newHost.pingResponsive).toBe(null);

      // Verify it's in the database
      const retrieved = await db.getHost('TestHost');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('TestHost');
    });

    it('should normalize MAC addresses on insert so scan updates match', async () => {
      await db.addHost('MacFormatHost', 'aa-bb-cc-dd-ee-ff', '192.168.1.240');

      // updateHostSeen may be called with a different but equivalent format.
      await expect(db.updateHostSeen('AA:BB:CC:DD:EE:FF', 'awake')).resolves.toBeUndefined();

      const byMac = await db.getHostByMAC('aa:bb:cc:dd:ee:ff');
      expect(byMac).toBeDefined();
      expect(byMac?.name).toBe('MacFormatHost');
      expect(byMac?.mac).toBe('AA:BB:CC:DD:EE:FF');
      expect(byMac?.status).toBe('awake');
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
      // Add test host first
      await db.addHost('StatusTestHost', 'AA:BB:CC:DD:EE:03', '192.168.1.203');
      
      await db.updateHostStatus('StatusTestHost', 'awake');

      const host = await db.getHost('StatusTestHost');
      expect(host?.status).toBe('awake');

      await db.updateHostStatus('StatusTestHost', 'asleep');
      const hostAsleep = await db.getHost('StatusTestHost');
      expect(hostAsleep?.status).toBe('asleep');
    });

    it('should update lastSeen timestamp on host update', async () => {
      // Add test host first
      await db.addHost('TimestampTestHost', 'AA:BB:CC:DD:EE:04', '192.168.1.204');
      
      const hostBefore = await db.getHost('TimestampTestHost');
      const lastSeenBefore = hostBefore?.lastSeen;

      // Wait to ensure timestamp difference (SQLite uses second precision)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      await db.updateHostSeen('AA:BB:CC:DD:EE:04', 'awake');

      const hostAfter = await db.getHost('TimestampTestHost');
      expect(hostAfter?.lastSeen).not.toBe(lastSeenBefore);
      expect(hostAfter?.lastSeen).toBeTruthy();
    });

    it('should mark host as discovered when updating', async () => {
      // Add test host first
      await db.addHost('DiscoveredTestHost', 'AA:BB:CC:DD:EE:05', '192.168.1.205');
      
      await db.updateHostSeen('AA:BB:CC:DD:EE:05', 'awake');

      const host = await db.getHost('DiscoveredTestHost');
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
      // Add test host first
      await db.addHost('SyncTestHost', 'AA:BB:CC:DD:EE:06', '192.168.1.206');
      
      const mockDiscoveredHosts: DiscoveredHost[] = [
        { ip: '192.168.1.206', mac: 'AA:BB:CC:DD:EE:06', hostname: 'SyncTestHost' },
      ];

      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue(mockDiscoveredHosts);
      (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
        mac.toUpperCase().replace(/-/g, ':')
      );
      (networkDiscovery.isHostAlive as jest.Mock).mockResolvedValue(true);

      await scanOrchestrator.syncWithNetwork();

      const host = await db.getHost('SyncTestHost');
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

      await scanOrchestrator.syncWithNetwork();

      const host = await db.getHost('NewHost');
      expect(host).toBeDefined();
      expect(host?.mac).toBe('AA:BB:CC:DD:EE:FF');
      expect(host?.ip).toBe('192.168.1.200');
    });

    it('should update existing hosts during sync', async () => {
      // Add test host first
      await db.addHost('UpdateSyncHost', 'AA:BB:CC:DD:EE:08', '192.168.1.208');
      
      const mockDiscoveredHosts: DiscoveredHost[] = [
        { ip: '192.168.1.208', mac: 'AA:BB:CC:DD:EE:08', hostname: 'UpdateSyncHost' },
      ];

      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue(mockDiscoveredHosts);
      (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
        mac.toUpperCase().replace(/-/g, ':')
      );
      (networkDiscovery.isHostAlive as jest.Mock).mockResolvedValue(true);

      const hostBefore = await db.getHost('UpdateSyncHost');
      const lastSeenBefore = hostBefore?.lastSeen;

      // Wait to ensure timestamp difference (SQLite uses second precision)
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await scanOrchestrator.syncWithNetwork();

      const hostAfter = await db.getHost('UpdateSyncHost');
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

      await scanOrchestrator.syncWithNetwork();

      const host = await db.getHost('OfflineHost');
      // Host found via ARP is marked as awake even if ping fails (default mode)
      expect(host?.status).toBe('awake');
      // But pingResponsive should be 0 (doesn't respond to ping)
      expect(host?.pingResponsive).toBe(0);
    });

    it('should use ARP-only status when usePingValidation=false (default)', async () => {
      // Ensure usePingValidation is false (default)
      config.network.usePingValidation = false;

      const mockDiscoveredHosts: DiscoveredHost[] = [
        { ip: '192.168.1.201', mac: 'AA:BB:CC:DD:EE:10', hostname: 'PingBlockedHost' },
        { ip: '192.168.1.202', mac: 'AA:BB:CC:DD:EE:11', hostname: 'PingResponsiveHost' },
      ];

      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue(mockDiscoveredHosts);
      (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
        mac.toUpperCase().replace(/-/g, ':')
      );
      // First host blocks ping, second responds
      (networkDiscovery.isHostAlive as jest.Mock)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      await scanOrchestrator.syncWithNetwork();

      // Both hosts should be marked awake because ARP found them
      const host1 = await db.getHost('PingBlockedHost');
      expect(host1?.status).toBe('awake');
      expect(host1?.pingResponsive).toBe(0);

      const host2 = await db.getHost('PingResponsiveHost');
      expect(host2?.status).toBe('awake');
      expect(host2?.pingResponsive).toBe(1);
    });

    it('should use ping result for status when usePingValidation=true', async () => {
      // Enable ping validation
      config.network.usePingValidation = true;

      const mockDiscoveredHosts: DiscoveredHost[] = [
        { ip: '192.168.1.203', mac: 'AA:BB:CC:DD:EE:12', hostname: 'PingFailHost' },
        { ip: '192.168.1.204', mac: 'AA:BB:CC:DD:EE:13', hostname: 'PingSuccessHost' },
      ];

      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue(mockDiscoveredHosts);
      (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
        mac.toUpperCase().replace(/-/g, ':')
      );
      // First host fails ping, second succeeds
      (networkDiscovery.isHostAlive as jest.Mock)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      await scanOrchestrator.syncWithNetwork();

      // First host should be asleep because ping failed
      const host1 = await db.getHost('PingFailHost');
      expect(host1?.status).toBe('asleep');
      expect(host1?.pingResponsive).toBe(0);

      // Second host should be awake because ping succeeded
      const host2 = await db.getHost('PingSuccessHost');
      expect(host2?.status).toBe('awake');
      expect(host2?.pingResponsive).toBe(1);

      // Reset config to default
      config.network.usePingValidation = false;
    });

    it('should log debug message when ping fails with usePingValidation=true', async () => {
      // Enable ping validation
      config.network.usePingValidation = true;

      const mockDiscoveredHosts: DiscoveredHost[] = [
        { ip: '192.168.1.205', mac: 'AA:BB:CC:DD:EE:14', hostname: 'DebugLogHost' },
      ];

      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue(mockDiscoveredHosts);
      (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
        mac.toUpperCase().replace(/-/g, ':')
      );
      (networkDiscovery.isHostAlive as jest.Mock).mockResolvedValue(false);

      await scanOrchestrator.syncWithNetwork();

      // Verify debug log was called
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('found via ARP but did not respond to ping - marking as asleep')
      );

      // Verify the host status is actually asleep
      const host = await db.getHost('DebugLogHost');
      expect(host?.status).toBe('asleep');
      expect(host?.pingResponsive).toBe(0);

      // Reset config to default
      config.network.usePingValidation = false;
    });

    it('should handle empty network scan results', async () => {
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([]);

      await scanOrchestrator.syncWithNetwork();

      // Should not throw error (no data since seed data was removed)
      const hosts = await db.getAllHosts();
      expect(hosts.length).toBe(0);
    });

    it('should handle network discovery failures', async () => {
      (networkDiscovery.scanNetworkARP as jest.Mock).mockRejectedValue(
        new Error('Network scan failed')
      );

      await scanOrchestrator.syncWithNetwork();

      // Should handle error gracefully (no data since seed data was removed)
      const hosts = await db.getAllHosts();
      expect(hosts.length).toBe(0);
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

      await scanOrchestrator.syncWithNetwork();

      const host = await db.getHost('device-192-168-1-200');
      expect(host).toBeDefined();
      expect(host?.mac).toBe('AA:BB:CC:DD:EE:FF');
    });

    it('should ping hosts concurrently in batches', async () => {
      // Create 25 mock hosts to test batching (with default concurrency of 10)
      const mockDiscoveredHosts: DiscoveredHost[] = Array.from({ length: 25 }, (_, i) => ({
        ip: `192.168.1.${100 + i}`,
        mac: `AA:BB:CC:DD:EE:${i.toString(16).padStart(2, '0').toUpperCase()}`,
        hostname: `Host${i}`,
      }));

      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue(mockDiscoveredHosts);
      (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
        mac.toUpperCase().replace(/-/g, ':')
      );

      // Track call timing to verify concurrency
      const pingCallTimes: number[] = [];
      (networkDiscovery.isHostAlive as jest.Mock).mockImplementation(async () => {
        pingCallTimes.push(Date.now());
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 10));
        return true;
      });

      await scanOrchestrator.syncWithNetwork();

      // Verify all hosts were pinged
      expect(networkDiscovery.isHostAlive).toHaveBeenCalledTimes(25);

      // Verify all hosts were added/updated
      for (let i = 0; i < 25; i++) {
        const host = await db.getHost(`Host${i}`);
        expect(host).toBeDefined();
        expect(host?.status).toBe('awake');
        expect(host?.pingResponsive).toBe(1);
      }
    });

    it('should handle mixed ping results in concurrent batches', async () => {
      const mockDiscoveredHosts: DiscoveredHost[] = [
        { ip: '192.168.1.100', mac: 'AA:BB:CC:DD:EE:01', hostname: 'Host1' },
        { ip: '192.168.1.101', mac: 'AA:BB:CC:DD:EE:02', hostname: 'Host2' },
        { ip: '192.168.1.102', mac: 'AA:BB:CC:DD:EE:03', hostname: 'Host3' },
      ];

      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue(mockDiscoveredHosts);
      (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
        mac.toUpperCase().replace(/-/g, ':')
      );

      // Mock alternating ping results
      (networkDiscovery.isHostAlive as jest.Mock)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      await scanOrchestrator.syncWithNetwork();

      // All hosts should be marked as awake (ARP discovery overrides ping)
      const host1 = await db.getHost('Host1');
      expect(host1?.status).toBe('awake');
      expect(host1?.pingResponsive).toBe(1);

      const host2 = await db.getHost('Host2');
      expect(host2?.status).toBe('awake');
      expect(host2?.pingResponsive).toBe(0);

      const host3 = await db.getHost('Host3');
      expect(host3?.status).toBe('awake');
      expect(host3?.pingResponsive).toBe(1);
    });
  });

  describe('Periodic scanning', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      // Always stop periodic sync after each test to avoid timer leaks
      if (db) {
        scanOrchestrator.stopPeriodicSync();
      }
      jest.useRealTimers();
    });

    it('should start periodic sync with correct interval', async () => {
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([]);

      scanOrchestrator.startPeriodicSync(1000, false);

      // Fast-forward time by 5 seconds for deferred initial scan
      jest.advanceTimersByTime(5000);

      // Verify sync was called
      expect(networkDiscovery.scanNetworkARP).toHaveBeenCalled();
    });

    it('should defer initial scan in background mode', () => {
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([]);

      scanOrchestrator.startPeriodicSync(5000, false);

      // Should not have called immediately
      expect(networkDiscovery.scanNetworkARP).not.toHaveBeenCalled();
    });

    it('should run immediate scan when requested', () => {
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([]);

      scanOrchestrator.startPeriodicSync(5000, true);

      // With immediateSync=true, should call immediately (no timeout needed)
      expect(networkDiscovery.scanNetworkARP).toHaveBeenCalled();
    });

    it('should stop periodic sync on close', () => {
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([]);

      scanOrchestrator.startPeriodicSync(1000, false);

      // Immediately stop
      scanOrchestrator.stopPeriodicSync();

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
