const localDevices = require('local-devices');
const dns = require('dns').promises;
const { execSync } = require('child_process');
const os = require('os');

/**
 * Network Discovery Service
 * Scans the local network for active hosts using the local-devices package
 * Cross-platform support (Windows, Linux, macOS)
 */

/**
 * Perform reverse DNS lookup to get hostname from IP
 * @param {string} ip - IP address to lookup
 * @returns {Promise<string|null>} Hostname or null if lookup fails
 */
async function reverseDNSLookup(ip) {
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
function getHostnameViaNBT(ip) {
  try {
    const platform = os.platform();
    
    if (platform === 'win32') {
      // Windows: Use nbtstat to get NetBIOS name
      const output = execSync(`nbtstat -A ${ip}`, { 
        encoding: 'utf-8', 
        timeout: 2000,
        windowsHide: true 
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
        const output = execSync(`nmblookup -A ${ip}`, { 
          encoding: 'utf-8', 
          timeout: 2000 
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
 * Scan network using ARP protocol (via local-devices)
 * Returns array of { ip, mac, hostname }
 */
async function scanNetworkARP() {
  try {
    console.log('Starting ARP network scan...');
    
    // local-devices returns an array of { name, ip, mac }
    const devices = await localDevices();
    
    if (!devices || devices.length === 0) {
      console.warn('No devices found on network');
      return [];
    }

    // Format devices for our system with DNS and NetBIOS fallbacks
    const hostsPromises = devices.map(async (device) => {
      // Clean up hostname - some devices return '?' or empty strings
      let cleanName = device.name;
      
      // Check if hostname is valid (not ?, unknown, empty, or just an IP)
      const isValidHostname = cleanName && 
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
        hostname: hostname
      };
    });

    const hosts = await Promise.all(hostsPromises);
    
    const hostnamesFound = hosts.filter(h => h.hostname).length;
    console.log(`Network scan found ${hosts.length} devices (${hostnamesFound} with hostnames)`);
    return hosts;
  } catch (error) {
    console.error('Network scan error:', error.message);
    return [];
  }
}

/**
 * Get MAC address for a specific IP
 * Note: This requires scanning the entire network
 */
async function getMACAddress(ip) {
  try {
    const devices = await localDevices();
    const device = devices.find(d => d.ip === ip);
    return device ? formatMAC(device.mac) : null;
  } catch (error) {
    console.error(`Failed to get MAC for IP ${ip}:`, error.message);
    return null;
  }
}

/**
 * Format MAC address to standard format
 */
function formatMAC(mac) {
  return mac.toUpperCase().replace(/-/g, ':');
}

module.exports = {
  scanNetworkARP,
  getMACAddress,
  formatMAC,
  reverseDNSLookup
};
