const localDevices = require('local-devices');

/**
 * Network Discovery Service
 * Scans the local network for active hosts using the local-devices package
 * Cross-platform support (Windows, Linux, macOS)
 */

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

    // Format devices for our system
    const hosts = devices.map(device => ({
      ip: device.ip,
      mac: formatMAC(device.mac),
      hostname: device.name || 'unknown'
    }));

    console.log(`Network scan found ${hosts.length} devices`);
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
  formatMAC
};
