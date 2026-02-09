import { promises as dns } from 'dns';
import { execFile, execFileSync } from 'child_process';
import os from 'os';
import ping from 'ping';
import { config } from '../config';
import { logger } from '../utils/logger';
import { DiscoveredHost } from '../types';

/**
 * Promisify execFile manually to avoid relying on Node's custom promisify symbol.
 * Returns { stdout, stderr } explicitly.
 */
function execFileAsync(
  cmd: string,
  args: string[],
  opts: { encoding?: BufferEncoding; timeout?: number }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) {
        reject(err);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * Network Discovery Service
 * Scans the local network for active hosts via the system ARP table.
 * Cross-platform support (Windows, Linux, macOS)
 */

interface ArpDevice {
  name: string;
  ip: string;
  mac: string;
}

/**
 * Read the system ARP table by running `arp -a` and parsing the output.
 * Returns an array of { name, ip, mac } for each entry with a valid MAC.
 */
async function readArpTable(): Promise<ArpDevice[]> {
  const { stdout } = await execFileAsync('arp', ['-a'], {
    encoding: 'utf-8',
    timeout: 10_000,
  });

  const platform = os.platform();
  return platform === 'win32' ? parseArpWindows(stdout) : parseArpUnix(stdout);
}

/**
 * Parse `arp -a` output on macOS / Linux.
 * Lines look like:  hostname (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0
 *              or:  ? (192.168.1.1) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]
 */
function parseArpUnix(output: string): ArpDevice[] {
  const devices: ArpDevice[] = [];
  for (const line of output.split('\n')) {
    const match = line.match(
      /^(\S+)\s+\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-f:]+)/i
    );
    if (match) {
      const [, name, ip, mac] = match;
      // Require a strict 6-octet MAC address (e.g., aa:bb:cc:dd:ee:ff)
      if (mac && /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(mac)) {
        devices.push({ name, ip, mac });
      }
    }
  }
  return devices;
}

/**
 * Parse `arp -a` output on Windows.
 * Lines look like:  192.168.1.1           aa-bb-cc-dd-ee-ff     dynamic
 */
function parseArpWindows(output: string): ArpDevice[] {
  const devices: ArpDevice[] = [];
  for (const line of output.split('\n')) {
    const match = line.match(
      /^\s+(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f-]+)\s+\w+/i
    );
    if (match) {
      const [, ip, mac] = match;
      // Require a strict 6-octet MAC address in Windows format (e.g., aa-bb-cc-dd-ee-ff)
      if (mac && /^[0-9a-f]{2}(-[0-9a-f]{2}){5}$/i.test(mac)) {
        devices.push({ name: '?', ip, mac: mac.replace(/-/g, ':') });
      }
    }
  }
  return devices;
}

/**
 * Perform reverse DNS lookup to get hostname from IP
 * @param {string} ip - IP address to lookup
 * @returns {Promise<string|null>} Hostname or null if lookup fails
 */
async function reverseDNSLookup(ip: string): Promise<string | null> {
  try {
    const hostnames = await dns.reverse(ip);
    if (hostnames && hostnames.length > 0) {
      // Return first hostname, strip domain suffix if present
      return hostnames[0].split('.')[0];
    }
  } catch (error) {
    // Reverse lookup failed (common for devices without DNS entries)
    return null;
  }
  return null;
}

/**
 * Try to get hostname via NetBIOS (Windows) or other OS-specific methods
 * @param {string} ip - IP address to lookup
 * @returns {string|null} Hostname or null if lookup fails
 */
function getHostnameViaNBT(ip: string): string | null {
  try {
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows: Use nbtstat to get NetBIOS name
      const output = execFileSync('nbtstat', ['-A', ip], {
        encoding: 'utf-8',
        timeout: 2000,
        windowsHide: true,
      });

      // Parse output for computer name (look for <00> UNIQUE which is the workstation name)
      const lines = output.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s+(\S+)\s+<00>\s+UNIQUE/i);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    } else if (platform === 'linux') {
      // Linux: Try nmblookup if available
      try {
        const output = execFileSync('nmblookup', ['-A', ip], {
          encoding: 'utf-8',
          timeout: 2000,
        });
        const match = output.match(/^\s+(\S+)\s+<00>/m);
        if (match && match[1]) {
          return match[1].trim();
        }
      } catch (e) {
        // nmblookup not available
      }
    }
  } catch (error) {
    // NetBIOS lookup failed (timeout or device doesn't respond)
  }
  return null;
}

/**
 * Scan network using the system ARP table.
 * Returns array of { ip, mac, hostname }
 */
async function scanNetworkARP(): Promise<DiscoveredHost[]> {
  try {
    logger.info('Starting ARP network scan...');

    const devices = await readArpTable();

    if (!devices || devices.length === 0) {
      logger.warn('No devices found on network');
      return [];
    }

    // Format devices for our system with DNS and NetBIOS fallbacks
    const hostsPromises = devices.map(async (device: ArpDevice) => {
      // Clean up hostname - arp often returns '?' or empty strings
      const cleanName = device.name;

      // Check if hostname is valid (not ?, unknown, empty, or just an IP)
      const isValidHostname =
        cleanName &&
        cleanName !== '?' &&
        cleanName !== 'unknown' &&
        cleanName.trim() !== '' &&
        !/^\d+\.\d+\.\d+\.\d+$/.test(cleanName); // Not an IP address

      let hostname = isValidHostname ? cleanName : null;

      // Fallback 1: Try reverse DNS lookup
      if (!hostname) {
        hostname = await reverseDNSLookup(device.ip);
      }

      // Fallback 2: Try NetBIOS/NBT lookup (works well on Windows networks)
      if (!hostname) {
        hostname = getHostnameViaNBT(device.ip);
      }

      return {
        ip: device.ip,
        mac: formatMAC(device.mac),
        hostname: hostname,
      };
    });

    const hosts = await Promise.all(hostsPromises);

    const hostnamesFound = hosts.filter((h: DiscoveredHost) => h.hostname).length;
    logger.info(`Network scan found ${hosts.length} devices (${hostnamesFound} with hostnames)`);
    return hosts;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Network scan error:', { error: message });
    return [];
  }
}

/**
 * Get MAC address for a specific IP from the system ARP table.
 */
async function getMACAddress(ip: string): Promise<string | null> {
  try {
    const devices = await readArpTable();
    const device = devices.find((d: ArpDevice) => d.ip === ip);
    return device ? formatMAC(device.mac) : null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to get MAC for IP ${ip}:`, { error: message });
    return null;
  }
}

/**
 * Format MAC address to standard format
 */
function formatMAC(mac: string): string {
  const trimmed = mac.trim().toUpperCase();

  // Normalize common variants into canonical "AA:BB:CC:DD:EE:FF".
  // - "aa-bb-cc-dd-ee-ff" -> "AA:BB:CC:DD:EE:FF"
  // - "aabbccddeeff"      -> "AA:BB:CC:DD:EE:FF"
  const hexOnly = trimmed.replace(/[^0-9A-F]/g, '');
  if (hexOnly.length === 12) {
    return hexOnly.match(/.{2}/g)!.join(':');
  }

  return trimmed.replace(/-/g, ':');
}

/**
 * Check if a host is alive using ICMP ping
 * @param {string} ip - IP address to ping
 * @returns {Promise<boolean>} True if host responds to ping
 */
async function isHostAlive(ip: string): Promise<boolean> {
  try {
    const result = await ping.promise.probe(ip, {
      timeout: config.network.pingTimeout / 1000, // Convert ms to seconds
      min_reply: 1, // Consider alive if at least 1 reply received
    });

    // Log ping failures at debug level to avoid log spam
    if (!result.alive) {
      logger.debug(`Host ${ip} did not respond to ping`);
    }

    return result.alive;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Downgrade to debug level - ping failures are common and not always errors
    logger.debug(`Ping error for ${ip}:`, { error: message });
    return false;
  }
}

export {
  scanNetworkARP,
  getMACAddress,
  formatMAC,
  reverseDNSLookup,
  isHostAlive,
  readArpTable,
  parseArpUnix,
  parseArpWindows,
};
