import * as networkDiscovery from '../networkDiscovery';
import localDevices from 'local-devices';
import ping from 'ping';
import { execSync } from 'child_process';
import { promises as dns } from 'dns';
import os from 'os';

// Mock all external dependencies
jest.mock('local-devices');
jest.mock('ping');
jest.mock('child_process');
jest.mock('os');
jest.mock('dns', () => ({
  promises: {
    reverse: jest.fn(),
  },
}));

describe('networkDiscovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('scanNetworkARP', () => {
    it('should discover hosts on local network', async () => {
      const mockDevices = [{ name: 'TestHost', ip: '192.168.1.100', mac: 'aa:bb:cc:dd:ee:ff' }];
      (localDevices as jest.MockedFunction<typeof localDevices>).mockResolvedValue(mockDevices);

      const hosts = await networkDiscovery.scanNetworkARP();

      expect(hosts).toHaveLength(1);
      expect(hosts[0].hostname).toBe('TestHost');
      expect(hosts[0].ip).toBe('192.168.1.100');
      expect(hosts[0].mac).toBe('AA:BB:CC:DD:EE:FF'); // Should be uppercase
    });

    it('should return empty array when no devices found', async () => {
      (localDevices as jest.MockedFunction<typeof localDevices>).mockResolvedValue([]);

      const hosts = await networkDiscovery.scanNetworkARP();

      expect(hosts).toEqual([]);
    });

    it('should handle local-devices errors gracefully', async () => {
      (localDevices as jest.MockedFunction<typeof localDevices>).mockRejectedValue(
        new Error('Network scan failed')
      );

      const hosts = await networkDiscovery.scanNetworkARP();

      expect(hosts).toEqual([]);
    });

    it('should fallback to DNS lookup when hostname is invalid', async () => {
      const mockDevices = [{ name: '?', ip: '192.168.1.100', mac: 'aa:bb:cc:dd:ee:ff' }];
      (localDevices as jest.MockedFunction<typeof localDevices>).mockResolvedValue(mockDevices);
      (dns.reverse as jest.MockedFunction<typeof dns.reverse>).mockResolvedValue([
        'testhost.local',
      ]);

      const hosts = await networkDiscovery.scanNetworkARP();

      expect(hosts).toHaveLength(1);
      expect(hosts[0].hostname).toBe('testhost');
      expect(dns.reverse).toHaveBeenCalledWith('192.168.1.100');
    });

    it('should fallback to NetBIOS lookup when DNS fails', async () => {
      const mockDevices = [{ name: '?', ip: '192.168.1.100', mac: 'aa:bb:cc:dd:ee:ff' }];
      (localDevices as jest.MockedFunction<typeof localDevices>).mockResolvedValue(mockDevices);
      (dns.reverse as jest.MockedFunction<typeof dns.reverse>).mockRejectedValue(
        new Error('DNS lookup failed')
      );
      (os.platform as jest.MockedFunction<typeof os.platform>).mockReturnValue('win32');
      (execSync as jest.MockedFunction<typeof execSync>).mockReturnValue(
        '   TESTPC       <00>  UNIQUE\n' as any
      );

      const hosts = await networkDiscovery.scanNetworkARP();

      expect(hosts).toHaveLength(1);
      expect(hosts[0].hostname).toBe('TESTPC');
    });

    it('should handle hostname as IP address', async () => {
      const mockDevices = [
        { name: '192.168.1.100', ip: '192.168.1.100', mac: 'aa:bb:cc:dd:ee:ff' },
      ];
      (localDevices as jest.MockedFunction<typeof localDevices>).mockResolvedValue(mockDevices);
      (dns.reverse as jest.MockedFunction<typeof dns.reverse>).mockRejectedValue(
        new Error('DNS lookup failed')
      );
      // Also mock execSync to not provide NetBIOS name
      (execSync as jest.MockedFunction<typeof execSync>).mockImplementation(() => {
        throw new Error('NetBIOS lookup failed');
      });

      const hosts = await networkDiscovery.scanNetworkARP();

      expect(hosts).toHaveLength(1);
      expect(hosts[0].hostname).toBeNull();
    });
  });

  describe('reverseDNSLookup', () => {
    it('should perform reverse DNS lookup successfully', async () => {
      (dns.reverse as jest.MockedFunction<typeof dns.reverse>).mockResolvedValue([
        'testhost.example.com',
      ]);

      const hostname = await networkDiscovery.reverseDNSLookup('192.168.1.100');

      expect(hostname).toBe('testhost');
      expect(dns.reverse).toHaveBeenCalledWith('192.168.1.100');
    });

    it('should return null on DNS lookup failure', async () => {
      (dns.reverse as jest.MockedFunction<typeof dns.reverse>).mockRejectedValue(
        new Error('DNS lookup failed')
      );

      const hostname = await networkDiscovery.reverseDNSLookup('192.168.1.100');

      expect(hostname).toBeNull();
    });

    it('should return null when no hostnames returned', async () => {
      (dns.reverse as jest.MockedFunction<typeof dns.reverse>).mockResolvedValue([]);

      const hostname = await networkDiscovery.reverseDNSLookup('192.168.1.100');

      expect(hostname).toBeNull();
    });

    it('should strip domain suffix from hostname', async () => {
      (dns.reverse as jest.MockedFunction<typeof dns.reverse>).mockResolvedValue([
        'mycomputer.local.network.com',
      ]);

      const hostname = await networkDiscovery.reverseDNSLookup('192.168.1.100');

      expect(hostname).toBe('mycomputer');
    });
  });

  describe('formatMAC', () => {
    it('should format MAC address correctly (uppercase, colons)', () => {
      const mac = networkDiscovery.formatMAC('aa:bb:cc:dd:ee:ff');
      expect(mac).toBe('AA:BB:CC:DD:EE:FF');
    });

    it('should convert hyphens to colons', () => {
      const mac = networkDiscovery.formatMAC('aa-bb-cc-dd-ee-ff');
      expect(mac).toBe('AA:BB:CC:DD:EE:FF');
    });

    it('should handle already formatted MAC addresses', () => {
      const mac = networkDiscovery.formatMAC('AA:BB:CC:DD:EE:FF');
      expect(mac).toBe('AA:BB:CC:DD:EE:FF');
    });
  });

  describe('getMACAddress', () => {
    it('should get MAC address for specific IP', async () => {
      const mockDevices = [
        { name: 'Host1', ip: '192.168.1.100', mac: 'aa:bb:cc:dd:ee:ff' },
        { name: 'Host2', ip: '192.168.1.101', mac: '11:22:33:44:55:66' },
      ];
      (localDevices as jest.MockedFunction<typeof localDevices>).mockResolvedValue(mockDevices);

      const mac = await networkDiscovery.getMACAddress('192.168.1.100');

      expect(mac).toBe('AA:BB:CC:DD:EE:FF');
    });

    it('should return null for non-existent IP', async () => {
      const mockDevices = [{ name: 'Host1', ip: '192.168.1.100', mac: 'aa:bb:cc:dd:ee:ff' }];
      (localDevices as jest.MockedFunction<typeof localDevices>).mockResolvedValue(mockDevices);

      const mac = await networkDiscovery.getMACAddress('192.168.1.200');

      expect(mac).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      (localDevices as jest.MockedFunction<typeof localDevices>).mockRejectedValue(
        new Error('Network error')
      );

      const mac = await networkDiscovery.getMACAddress('192.168.1.100');

      expect(mac).toBeNull();
    });
  });

  describe('isHostAlive', () => {
    it('should check if host is alive via ICMP ping', async () => {
      (ping.promise.probe as jest.Mock).mockResolvedValue({ alive: true });

      const isAlive = await networkDiscovery.isHostAlive('192.168.1.100');

      expect(isAlive).toBe(true);
      expect(ping.promise.probe).toHaveBeenCalledWith('192.168.1.100', {
        timeout: 2,
        extra: ['-n', '1'],
      });
    });

    it('should return false for unreachable hosts', async () => {
      (ping.promise.probe as jest.Mock).mockResolvedValue({ alive: false });

      const isAlive = await networkDiscovery.isHostAlive('192.168.1.200');

      expect(isAlive).toBe(false);
    });

    it('should handle ping timeout correctly', async () => {
      (ping.promise.probe as jest.Mock).mockRejectedValue(new Error('Timeout'));

      const isAlive = await networkDiscovery.isHostAlive('192.168.1.100');

      expect(isAlive).toBe(false);
    });
  });
});
