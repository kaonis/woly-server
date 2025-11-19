import wol from 'wake_on_lan';
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';
import HostDatabase from '../services/hostDatabase';
import { MacVendorCacheEntry, MacVendorResponse, ErrorResponse } from '../types';

// Database service will be set by app.js
let hostDb: HostDatabase | null = null;

// Rate limiting for MAC vendor API - using simple Map instead of LRU
const macVendorCache = new Map<string, MacVendorCacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
let lastMacVendorRequest = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second between requests

function setHostDatabase(db: HostDatabase): void {
  hostDb = db;
}

const getAllHosts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!hostDb) {
      res.status(500).json({ error: 'Database not initialized' });
      return;
    }
    const hosts = await hostDb.getAllHosts();
    const scanInProgress = hostDb.isScanInProgress();
    const lastScanTime = hostDb.getLastScanTime();
    
    res.status(200).json({ 
      hosts,
      scanInProgress,
      lastScanTime
    });
  } catch (error) {
    console.error('Error fetching hosts:', error);
    res.status(500).json({ error: 'Failed to fetch hosts' });
  }
};

const getHost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { name } = req.params;
  console.log(`Retrieving host with name ${name}`);

  try {
    if (!hostDb) {
      res.status(500).json({ error: 'Database not initialized' });
      return;
    }
    const host = await hostDb.getHost(name);
    if (!host) {
      res.status(204).send();
      console.log(`No host found with the name ${name}`);
      return;
    }
    res.json(host);
    console.log(`Found and sent host ${host.name} details`);
  } catch (error) {
    console.error('Error fetching host:', error);
    res.status(500).json({ error: 'Failed to fetch host' });
  }
};

const wakeUpHost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { name } = req.params;
  console.log(`Trying to wake up host with name ${name}`);

  try {
    if (!hostDb) {
      res.status(500).json({ error: 'Database not initialized' });
      return;
    }
    const host = await hostDb.getHost(name);
    
    if (!host) {
      res.status(204).send();
      console.log(`No host found with name ${name}`);
      return;
    }

    wol.wake(host.mac, (error: Error | null) => {
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
const scanNetwork = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!hostDb) {
      res.status(500).json({ error: 'Database not initialized' });
      return;
    }
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
const addHost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { name, mac, ip } = req.body;

  if (!name || !mac || !ip) {
    res.status(400).json({ error: 'Missing required fields: name, mac, ip' });
    return;
  }

  try {
    if (!hostDb) {
      res.status(500).json({ error: 'Database not initialized' });
      return;
    }
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
const getMacVendor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
    res.status(200).json({ 
      mac, 
      vendor: cached.vendor,
      source: 'macvendors.com (cached)'
    });
    return;
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
  } catch (error: any) {
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

export {
  setHostDatabase,
  getAllHosts,
  getHost,
  wakeUpHost,
  scanNetwork,
  addHost,
  getMacVendor
};
