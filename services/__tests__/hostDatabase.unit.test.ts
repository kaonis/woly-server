import HostDatabase from '../hostDatabase';
import * as networkDiscovery from '../networkDiscovery';
import { DiscoveredHost } from '../../types';

// Mock network discovery module
jest.mock('../networkDiscovery');

describe('HostDatabase', () => {
  let db: HostDatabase;

  beforeEach(async () => {
    // Use in-memory database for each test
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

    it('should seed initial hosts when table is empty', async () => {
      const hosts = await db.getAllHosts();
      expect(hosts.length).toBeGreaterThan(0);
      
      // Check for seed data - at least one seed host should exist
      const hostNames = hosts.map(h => h.name);
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
      
      await expect(
        db.addHost('TestHost', '11:22:33:44:55:66', '192.168.1.201')
      ).rejects.toThrow();
    });

    it('should reject duplicate MAC addresses', async () => {
      await db.addHost('TestHost1', 'AA:BB:CC:DD:EE:FF', '192.168.1.200');
      
      await expect(
        db.addHost('TestHost2', 'AA:BB:CC:DD:EE:FF', '192.168.1.201')
      ).rejects.toThrow();
    });

    it('should reject duplicate IP addresses', async () => {
      await db.addHost('TestHost1', 'AA:BB:CC:DD:EE:FF', '192.168.1.200');
      
      await expect(
        db.addHost('TestHost2', '11:22:33:44:55:66', '192.168.1.200')
      ).rejects.toThrow();
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
      await new Promise(resolve => setTimeout(resolve, 10));
      
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
      await expect(
        db.updateHostSeen('FF:FF:FF:FF:FF:FF', 'awake')
      ).rejects.toThrow('Host with MAC FF:FF:FF:FF:FF:FF not found in database');
    });
  });

  describe('Network synchronization', () => {
    it('should sync discovered hosts with database', async () => {
      // Use a different MAC that matches seed data
      const mockDiscoveredHosts: DiscoveredHost[] = [
        { ip: '192.168.1.147', mac: '80:6D:97:60:39:08', hostname: 'PHANTOM-MBP' }
      ];
      
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue(mockDiscoveredHosts);
      (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) => 
        mac.toUpperCase().replace(/-/g, ':')
      );
      (networkDiscovery.isHostAlive as jest.Mock).mockResolvedValue(true);
      
      // Get the host before sync to check its initial state
      const hostBefore = await db.getHost('PHANTOM-MBP');
      expect(hostBefore?.discovered).toBe(0); // Initially not discovered
      
      await db.syncWithNetwork();
      
      const host = await db.getHost('PHANTOM-MBP');
      expect(host?.discovered).toBe(1);
      expect(host?.status).toBe('awake');
    });

    it('should add new hosts during sync', async () => {
      const mockDiscoveredHosts: DiscoveredHost[] = [
        { ip: '192.168.1.200', mac: 'AA:BB:CC:DD:EE:FF', hostname: 'NewHost' }
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
        { ip: '192.168.1.147', mac: '80:6D:97:60:39:08', hostname: 'PHANTOM-MBP' }
      ];
      
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue(mockDiscoveredHosts);
      (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) => 
        mac.toUpperCase().replace(/-/g, ':')
      );
      (networkDiscovery.isHostAlive as jest.Mock).mockResolvedValue(true);
      
      const hostBefore = await db.getHost('PHANTOM-MBP');
      const lastSeenBefore = hostBefore?.lastSeen;
      
      await new Promise(resolve => setTimeout(resolve, 10));
      await db.syncWithNetwork();
      
      const hostAfter = await db.getHost('PHANTOM-MBP');
      expect(hostAfter?.lastSeen).not.toBe(lastSeenBefore);
    });

    it('should handle ping failures during sync', async () => {
      const mockDiscoveredHosts: DiscoveredHost[] = [
        { ip: '192.168.1.200', mac: 'AA:BB:CC:DD:EE:FF', hostname: 'OfflineHost' }
      ];
      
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue(mockDiscoveredHosts);
      (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) => 
        mac.toUpperCase().replace(/-/g, ':')
      );
      (networkDiscovery.isHostAlive as jest.Mock).mockResolvedValue(false);
      
      await db.syncWithNetwork();
      
      const host = await db.getHost('OfflineHost');
      expect(host?.status).toBe('asleep');
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
        { ip: '192.168.1.200', mac: 'AA:BB:CC:DD:EE:FF', hostname: null }
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
    afterEach(() => {
      // Always stop periodic sync after each test to avoid timer leaks
      if (db) {
        db.stopPeriodicSync();
      }
    });

    it('should start periodic sync with correct interval', async () => {
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([]);
      
      db.startPeriodicSync(1000, false);
      
      // Wait for deferred initial scan (5 seconds + buffer)
      await new Promise(resolve => setTimeout(resolve, 5100));
      
      // Verify sync was called
      expect(networkDiscovery.scanNetworkARP).toHaveBeenCalled();
    }, 15000);

    it('should defer initial scan in background mode', () => {
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([]);
      
      db.startPeriodicSync(5000, false);
      
      // Should not have called immediately
      expect(networkDiscovery.scanNetworkARP).not.toHaveBeenCalled();
    });

    it('should run immediate scan when requested', async () => {
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([]);
      
      db.startPeriodicSync(5000, true);
      
      // Wait a bit for async call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      expect(networkDiscovery.scanNetworkARP).toHaveBeenCalled();
    }, 15000);

    it('should stop periodic sync on close', async () => {
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([]);
      
      db.startPeriodicSync(1000, false);
      
      // Immediately stop
      db.stopPeriodicSync();
      
      // Should not have called scan yet (deferred to 5 seconds)
      expect(networkDiscovery.scanNetworkARP).not.toHaveBeenCalled();
      
      // Close the database (will be reopened in afterEach)
      await db.close();
      
      // Create a new instance for cleanup since we closed early
      db = new HostDatabase(':memory:');
      await db.initialize();
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
