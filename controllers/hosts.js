const wol = require('wake_on_lan');
const axios = require('axios');

// Database service will be set by app.js
let hostDb = null;

// Rate limiting for MAC vendor API
const macVendorCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
let lastMacVendorRequest = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second between requests

function setHostDatabase(db) {
  hostDb = db;
}

exports.getAllHosts = async (req, res, next) => {
  try {
    const hosts = await hostDb.getAllHosts();
    res.status(200).json({ hosts });
  } catch (error) {
    console.error('Error fetching hosts:', error);
    res.status(500).json({ error: 'Failed to fetch hosts' });
  }
};

exports.getHost = async (req, res, next) => {
  const { name } = req.params;
  console.log(`Retrieving host with name ${name}`);

  try {
    const host = await hostDb.getHost(name);
    if (!host) {
      res.status(204).send();
      return console.log(`No host found with the name ${name}`);
    }
    res.json(host);
    return console.log(`Found and sent host ${host.name} details`);
  } catch (error) {
    console.error('Error fetching host:', error);
    res.status(500).json({ error: 'Failed to fetch host' });
  }
};

exports.wakeUpHost = async (req, res, next) => {
  const { name } = req.params;
  console.log(`Trying to wake up host with name ${name}`);

  try {
    const host = await hostDb.getHost(name);
    
    if (!host) {
      res.status(204).send();
      return console.log(`No host found with name ${name}`);
    }

    wol.wake(host.mac, (error) => {
      if (error) {
        console.error(`Error waking up host ${name}: ${error.stack}`);
        res.status(500).json({ 
          success: false, 
          name: host.name, 
          error: error.message 
        });
        return;
      }

      console.log(`Sent WoL magic packet to host ${name} (${host.mac})`);
      res.status(200).json({ 
        success: true, 
        name: host.name, 
        mac: host.mac,
        message: 'Wake-on-LAN packet sent' 
      });
    });
  } catch (error) {
    console.error('Error waking up host:', error);
    res.status(500).json({ error: 'Failed to wake up host' });
  }
};

/**
 * Force a network scan and sync immediately
 */
exports.scanNetwork = async (req, res, next) => {
  try {
    console.log('Manual network scan requested');
    await hostDb.syncWithNetwork();
    
    const hosts = await hostDb.getAllHosts();
    res.status(200).json({ 
      message: 'Network scan completed',
      hostsCount: hosts.length,
      hosts 
    });
  } catch (error) {
    console.error('Network scan error:', error);
    res.status(500).json({ error: 'Failed to scan network' });
  }
};

/**
 * Add a new host manually
 */
exports.addHost = async (req, res, next) => {
  const { name, mac, ip } = req.body;

  if (!name || !mac || !ip) {
    res.status(400).json({ error: 'Missing required fields: name, mac, ip' });
    return;
  }

  try {
    const host = await hostDb.addHost(name, mac, ip);
    res.status(201).json(host);
  } catch (error) {
    console.error('Error adding host:', error);
    res.status(500).json({ error: 'Failed to add host' });
  }
};

/**
 * Get MAC address vendor information with caching and rate limiting
 */
exports.getMacVendor = async (req, res, next) => {
  const { mac } = req.params;
  
  if (!mac) {
    res.status(400).json({ error: 'MAC address is required' });
    return;
  }

  // Normalize MAC address for cache key
  const normalizedMac = mac.toUpperCase().replace(/[:-]/g, '');
  
  // Check cache first
  const cached = macVendorCache.get(normalizedMac);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`MAC vendor cache hit for ${mac}`);
    return res.status(200).json({ 
      mac, 
      vendor: cached.vendor,
      source: 'macvendors.com (cached)'
    });
  }

  try {
    // Rate limiting: ensure minimum interval between requests
    const now = Date.now();
    const timeSinceLastRequest = now - lastMacVendorRequest;
    
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      console.log(`Throttling MAC vendor request for ${mac}, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastMacVendorRequest = Date.now();
    
    // Use macvendors.com API (free, no API key required)
    const response = await axios.get(`https://api.macvendors.com/${encodeURIComponent(mac)}`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'WoLy-App/1.0'
      }
    });
    
    const vendor = response.data;
    
    // Cache the result
    macVendorCache.set(normalizedMac, {
      vendor,
      timestamp: Date.now()
    });
    
    res.status(200).json({ 
      mac, 
      vendor,
      source: 'macvendors.com'
    });
  } catch (error) {
    if (error.response && error.response.status === 404) {
      const vendor = 'Unknown Vendor';
      
      // Cache unknown vendors too
      macVendorCache.set(normalizedMac, {
        vendor,
        timestamp: Date.now()
      });
      
      res.status(200).json({ 
        mac, 
        vendor,
        source: 'macvendors.com'
      });
    } else if (error.response && error.response.status === 429) {
      console.error('MAC vendor API rate limit exceeded');
      res.status(429).json({ 
        error: 'Rate limit exceeded, please try again later',
        mac
      });
    } else {
      console.error('MAC vendor lookup error:', error.message);
      res.status(500).json({ error: 'Failed to lookup MAC vendor' });
    }
  }
};

module.exports.setHostDatabase = setHostDatabase;
