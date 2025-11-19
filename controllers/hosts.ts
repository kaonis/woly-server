import wol from 'wake_on_lan';
import axios from 'axios';
import { Request, Response } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';
import HostDatabase from '../services/hostDatabase';
import { MacVendorCacheEntry, MacVendorResponse, ErrorResponse } from '../types';

// Database service will be set by app.js
let hostDb: HostDatabase | null = null;

// Rate limiting for MAC vendor API - using simple Map instead of LRU
const macVendorCache = new Map<string, MacVendorCacheEntry>();
let lastMacVendorRequest = 0;

function setHostDatabase(db: HostDatabase): void {
  hostDb = db;
}

/**
 * @swagger
 * /hosts:
 *   get:
 *     summary: Get all hosts
 *     description: Retrieve a list of all network hosts (both discovered and manually added)
 *     tags: [Hosts]
 *     responses:
 *       200:
 *         description: List of hosts with scan status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hosts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Host'
 *                 scanInProgress:
 *                   type: boolean
 *                   description: Whether a network scan is currently running
 *                 lastScanTime:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                   description: Timestamp of the last completed scan
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
const getAllHosts = async (req: Request, res: Response): Promise<void> => {
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
    lastScanTime,
  });
};

/**
 * @swagger
 * /hosts/{name}:
 *   get:
 *     summary: Get a specific host by name
 *     description: Retrieve detailed information about a single host
 *     tags: [Hosts]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: The hostname to retrieve
 *         example: PHANTOM-MBP
 *     responses:
 *       200:
 *         description: Host found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Host'
 *       204:
 *         description: Host not found
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
const getHost = async (req: Request, res: Response): Promise<void> => {
  const { name } = req.params;
  logger.info(`Retrieving host with name ${name}`);

  if (!hostDb) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }
  const host = await hostDb.getHost(name);
  if (!host) {
    res.sendStatus(204);
    logger.info(`No host found with the name ${name}`);
    return;
  }
  res.json(host);
  logger.info(`Found and sent host ${host.name} details`);
};

/**
 * @swagger
 * /hosts/wakeup/{name}:
 *   post:
 *     summary: Wake up a host using Wake-on-LAN
 *     description: Send a Wake-on-LAN magic packet to the specified host
 *     tags: [Wake-on-LAN]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: The hostname to wake up
 *         example: PHANTOM-MBP
 *     responses:
 *       200:
 *         description: Magic packet sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 name:
 *                   type: string
 *                   example: PHANTOM-MBP
 *                 mac:
 *                   type: string
 *                   example: '80:6D:97:60:39:08'
 *                 message:
 *                   type: string
 *                   example: Wake-on-LAN packet sent
 *       204:
 *         description: Host not found
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
const wakeUpHost = async (req: Request, res: Response): Promise<void> => {
  const { name } = req.params;
  logger.info(`Trying to wake up host with name ${name}`);

  if (!hostDb) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }
  const host = await hostDb.getHost(name);

  if (!host) {
    res.sendStatus(204);
    logger.info(`No host found with name ${name}`);
    return;
  }

  // Promisify wol.wake for better async handling
  await new Promise<void>((resolve, reject) => {
    wol.wake(host.mac, (error: Error | null) => {
      if (error) {
        logger.error(`Error waking up host ${name}:`, { error: error.message, stack: error.stack });
        reject(error);
      } else {
        logger.info(`Sent WoL magic packet to host ${name} (${host.mac})`);
        resolve();
      }
    });
  });

  res.status(200).json({
    success: true,
    name: host.name,
    mac: host.mac,
    message: 'Wake-on-LAN packet sent',
  });
};

/**
 * @swagger
 * /hosts/scan:
 *   post:
 *     summary: Trigger immediate network scan
 *     description: Force an immediate network discovery scan using ARP, ICMP ping, and DNS/NetBIOS lookups. Rate limited to 5 requests per minute.
 *     tags: [Network]
 *     responses:
 *       200:
 *         description: Scan completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Network scan completed
 *                 hostsCount:
 *                   type: integer
 *                   example: 39
 *                 hosts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Host'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
const scanNetwork = async (req: Request, res: Response): Promise<void> => {
  if (!hostDb) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }
  logger.info('Manual network scan requested');
  await hostDb.syncWithNetwork();

  const hosts = await hostDb.getAllHosts();
  res.status(200).json({
    message: 'Network scan completed',
    hostsCount: hosts.length,
    hosts,
  });
};

/**
 * @swagger
 * /hosts:
 *   post:
 *     summary: Add a new host manually
 *     description: Manually add a host to the database (not discovered automatically)
 *     tags: [Hosts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - mac
 *               - ip
 *             properties:
 *               name:
 *                 type: string
 *                 description: Unique hostname
 *                 example: MY-DEVICE
 *               mac:
 *                 type: string
 *                 pattern: '^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$'
 *                 description: MAC address in XX:XX:XX:XX:XX:XX format
 *                 example: 'AA:BB:CC:DD:EE:FF'
 *               ip:
 *                 type: string
 *                 format: ipv4
 *                 description: IPv4 address
 *                 example: 192.168.1.100
 *     responses:
 *       201:
 *         description: Host added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Host'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
const addHost = async (req: Request, res: Response): Promise<void> => {
  const { name, mac, ip } = req.body;

  if (!name || !mac || !ip) {
    res.status(400).json({ error: 'Missing required fields: name, mac, ip' });
    return;
  }

  if (!hostDb) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }
  const host = await hostDb.addHost(name, mac, ip);
  res.status(201).json(host);
};

/**
 * @swagger
 * /hosts/mac-vendor/{mac}:
 *   get:
 *     summary: Get MAC address vendor information
 *     description: Look up the manufacturer/vendor of a network device by MAC address. Results are cached for 24 hours.
 *     tags: [Hosts]
 *     parameters:
 *       - in: path
 *         name: mac
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$'
 *         description: MAC address to look up
 *         example: '80:6D:97:60:39:08'
 *     responses:
 *       200:
 *         description: Vendor information retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mac:
 *                   type: string
 *                   example: '80:6D:97:60:39:08'
 *                 vendor:
 *                   type: string
 *                   example: 'Apple, Inc.'
 *                 source:
 *                   type: string
 *                   example: 'macvendors.com (cached)'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         description: Rate limit exceeded (external API or internal throttling)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 'Rate limit exceeded, please try again later'
 *                 mac:
 *                   type: string
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
const getMacVendor = async (req: Request, res: Response): Promise<void> => {
  const { mac } = req.params;

  if (!mac) {
    res.status(400).json({ error: 'MAC address is required' });
    return;
  }
  // Normalize MAC address for cache key
  const normalizedMac = mac.toUpperCase().replace(/[:-]/g, '');

  // Check cache first
  const cached = macVendorCache.get(normalizedMac);
  if (cached && Date.now() - cached.timestamp < config.cache.macVendorTTL) {
    logger.debug(`MAC vendor cache hit for ${mac}`);
    res.status(200).json({
      mac,
      vendor: cached.vendor,
      source: 'macvendors.com (cached)',
    });
    return;
  }

  // Rate limiting: ensure minimum interval between requests
  const now = Date.now();
  const timeSinceLastRequest = now - lastMacVendorRequest;

  if (timeSinceLastRequest < config.cache.macVendorRateLimit) {
    const waitTime = config.cache.macVendorRateLimit - timeSinceLastRequest;
    logger.debug(`Throttling MAC vendor request for ${mac}, waiting ${waitTime}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastMacVendorRequest = Date.now();

  try {
    // Use macvendors.com API (free, no API key required)
    const response = await axios.get(`https://api.macvendors.com/${encodeURIComponent(mac)}`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'WoLy-App/1.0',
      },
    });

    const vendor = response.data;

    // Cache the result
    macVendorCache.set(normalizedMac, {
      vendor,
      timestamp: Date.now(),
    });

    res.status(200).json({
      mac,
      vendor,
      source: 'macvendors.com',
    });
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      const vendor = 'Unknown Vendor';

      // Cache unknown vendors too
      macVendorCache.set(normalizedMac, {
        vendor,
        timestamp: Date.now(),
      });

      res.status(200).json({
        mac,
        vendor,
        source: 'macvendors.com',
      });
    } else if (error.response && error.response.status === 429) {
      logger.warn('MAC vendor API rate limit exceeded', { mac });
      res.status(429).json({
        error: 'Rate limit exceeded, please try again later',
        mac,
      });
    } else {
      logger.error('MAC vendor lookup error:', { mac, error: error.message });
      res.status(500).json({ error: 'Failed to lookup MAC vendor' });
    }
  }
};

export { setHostDatabase, getAllHosts, getHost, wakeUpHost, scanNetwork, addHost, getMacVendor };
