import * as networkDiscovery from '../networkDiscovery';
import ping from 'ping';
import { execFileSync, execFile } from 'child_process';
import { promises as dns } from 'dns';
import os from 'os';

// Mock all external dependencies
jest.mock('ping');
jest.mock('child_process');
jest.mock('os', () => ({
  platform: jest.fn(() => 'linux'),
  release: jest.fn(() => '5.10.0'),
  type: jest.fn(() => 'Linux'),
  arch: jest.fn(() => 'x64'),
  cpus: jest.fn(() => []),
  totalmem: jest.fn(() => 8589934592),
  freemem: jest.fn(() => 4294967296),
  networkInterfaces: jest.fn(() => ({})),
}));
jest.mock('dns', () => ({
  promises: {
    reverse: jest.fn(),
  },
}));

const mockedExecFile = execFile as unknown as jest.MockedFunction<
  (
    cmd: string,
    args: string[],
    opts: object,
    cb: (err: Error | null, result: { stdout: string; stderr: string }) => void
  ) => void
>;

/** Helper: make the mocked execFile resolve with the given arp output */
function mockArpOutput(stdout: string) {
  mockedExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
    cb(null, { stdout, stderr: '' });
    return undefined as any;
  });
}

// Sample arp -a outputs
const UNIX_ARP_OUTPUT = [
  'TestHost (192.168.1.100) at aa:bb:cc:dd:ee:ff [ether] on eth0',
].join('\n');

const UNIX_ARP_MULTI = [
  'TestHost (192.168.1.100) at aa:bb:cc:dd:ee:ff [ether] on eth0',
  '? (192.168.1.101) at 11:22:33:44:55:66 on en0 ifscope [ethernet]',
].join('\n');

const WINDOWS_ARP_OUTPUT = [
  '',
  'Interface: 192.168.1.10 --- 0x4',
  '  Internet Address      Physical Address      Type',
  '  192.168.1.100         aa-bb-cc-dd-ee-ff     dynamic',
].join('\n');

describe('networkDiscovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (os.platform as jest.MockedFunction<typeof os.platform>).mockReturnValue('linux');
  });

  describe('parseArpUnix', () => {
    it('should parse standard unix arp output', () => {
      const devices = networkDiscovery.parseArpUnix(UNIX_ARP_OUTPUT);
      expect(devices).toEqual([
        { name: 'TestHost', ip: '192.168.1.100', mac: 'aa:bb:cc:dd:ee:ff' },
      ]);
    });

    it('should parse multiple entries including ? hostnames', () => {
      const devices = networkDiscovery.parseArpUnix(UNIX_ARP_MULTI);
      expect(devices).toHaveLength(2);
      expect(devices[0].name).toBe('TestHost');
      expect(devices[1].name).toBe('?');
      expect(devices[1].ip).toBe('192.168.1.101');
    });

    it('should skip incomplete entries', () => {
      const output = '? (192.168.1.1) at (incomplete) on en0';
      const devices = networkDiscovery.parseArpUnix(output);
      expect(devices).toEqual([]);
    });

    it('should return empty array for empty output', () => {
      expect(networkDiscovery.parseArpUnix('')).toEqual([]);
    });
  });

  describe('parseArpWindows', () => {
    it('should parse windows arp output', () => {
      const devices = networkDiscovery.parseArpWindows(WINDOWS_ARP_OUTPUT);
      expect(devices).toEqual([
        { name: '?', ip: '192.168.1.100', mac: 'aa:bb:cc:dd:ee:ff' },
      ]);
    });

    it('should return empty array for empty output', () => {
      expect(networkDiscovery.parseArpWindows('')).toEqual([]);
    });
  });

  describe('scanNetworkARP', () => {
    it('should discover hosts on local network', async () => {
      mockArpOutput(UNIX_ARP_OUTPUT);

      const hosts = await networkDiscovery.scanNetworkARP();

      expect(hosts).toHaveLength(1);
      expect(hosts[0].hostname).toBe('TestHost');
      expect(hosts[0].ip).toBe('192.168.1.100');
      expect(hosts[0].mac).toBe('AA:BB:CC:DD:EE:FF'); // Should be uppercase
    });

    it('should return empty array when no devices found', async () => {
      mockArpOutput('');

      const hosts = await networkDiscovery.scanNetworkARP();

      expect(hosts).toEqual([]);
    });

    it('should handle arp command errors gracefully', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
        cb(new Error('arp command failed'), { stdout: '', stderr: '' });
        return undefined as any;
      });

      const hosts = await networkDiscovery.scanNetworkARP();

      expect(hosts).toEqual([]);
    });

    it('should fallback to DNS lookup when hostname is invalid', async () => {
      mockArpOutput('? (192.168.1.100) at aa:bb:cc:dd:ee:ff [ether] on eth0');
      (dns.reverse as jest.MockedFunction<typeof dns.reverse>).mockResolvedValue([
        'testhost.local',
      ]);

      const hosts = await networkDiscovery.scanNetworkARP();

      expect(hosts).toHaveLength(1);
      expect(hosts[0].hostname).toBe('testhost');
      expect(dns.reverse).toHaveBeenCalledWith('192.168.1.100');
    });

    it('should fallback to NetBIOS lookup when DNS fails', async () => {
      // Use win32 platform so readArpTable uses the Windows parser
      (os.platform as jest.MockedFunction<typeof os.platform>).mockReturnValue('win32');
      mockArpOutput(WINDOWS_ARP_OUTPUT);
      (dns.reverse as jest.MockedFunction<typeof dns.reverse>).mockRejectedValue(
        new Error('DNS lookup failed')
      );
      (execFileSync as jest.MockedFunction<typeof execFileSync>).mockReturnValue(
        '   TESTPC       <00>  UNIQUE\n' as any
      );

      const hosts = await networkDiscovery.scanNetworkARP();

      expect(hosts).toHaveLength(1);
      expect(hosts[0].hostname).toBe('TESTPC');
    });

    it('should handle hostname as IP address', async () => {
      // arp -a sometimes shows hostname as the IP itself
      mockArpOutput('192.168.1.100 (192.168.1.100) at aa:bb:cc:dd:ee:ff [ether] on eth0');
      (dns.reverse as jest.MockedFunction<typeof dns.reverse>).mockRejectedValue(
        new Error('DNS lookup failed')
      );
      (execFileSync as jest.MockedFunction<typeof execFileSync>).mockImplementation(() => {
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
      mockArpOutput(UNIX_ARP_MULTI);

      const mac = await networkDiscovery.getMACAddress('192.168.1.100');

      expect(mac).toBe('AA:BB:CC:DD:EE:FF');
    });

    it('should return null for non-existent IP', async () => {
      mockArpOutput(UNIX_ARP_OUTPUT);

      const mac = await networkDiscovery.getMACAddress('192.168.1.200');

      expect(mac).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
        cb(new Error('Network error'), { stdout: '', stderr: '' });
        return undefined as any;
      });

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
        min_reply: 1,
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
