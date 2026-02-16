import wol from 'wake_on_lan';
import axios from 'axios';
import { Request, Response } from 'express';
import { LRUCache } from 'lru-cache';
import { config } from '../config';
import { logger } from '../utils/logger';
import HostDatabase from '../services/hostDatabase';
import ScanOrchestrator from '../services/scanOrchestrator';
import * as networkDiscovery from '../services/networkDiscovery';
import { Host, MacVendorCacheEntry, WakeVerificationResult } from '../types';

// Database service will be set by app.js
let hostDb: HostDatabase | null = null;
let scanOrchestrator: ScanOrchestrator | null = null;

// MAC vendor cache with automatic TTL and size limit
const macVendorCache = new LRUCache<string, MacVendorCacheEntry>({
  max: 1000,
  ttl: config.cache.macVendorTTL,
});
let lastMacVendorRequest = 0;

const MIN_WAKE_VERIFY_TIMEOUT_MS = 500;
const MAX_WAKE_VERIFY_TIMEOUT_MS = 60_000;
const MIN_WAKE_VERIFY_POLL_INTERVAL_MS = 100;
const MAX_WAKE_VERIFY_POLL_INTERVAL_MS = 10_000;
const DEFAULT_WAKE_VERIFY_ENABLED = false;
const DEFAULT_WAKE_VERIFY_TIMEOUT_MS = 10_000;
const DEFAULT_WAKE_VERIFY_POLL_INTERVAL_MS = 1_000;

type WakeVerificationOptions = {
  enabled: boolean;
  timeoutMs: number;
  pollIntervalMs: number;
};

function setHostDatabase(db: HostDatabase | null): void {
  hostDb = db;
}

function setScanOrchestrator(orchestrator: ScanOrchestrator | null): void {
  scanOrchestrator = orchestrator;
}

function parseBooleanQueryValue(value: unknown): boolean | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  return undefined;
}

function parseIntegerQueryValue(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function resolveWakeVerificationOptions(
  req: Request
): { options: WakeVerificationOptions | null; error?: string } {
  const wakeVerificationConfig = {
    enabled: config.wakeVerification?.enabled ?? DEFAULT_WAKE_VERIFY_ENABLED,
    timeoutMs: config.wakeVerification?.timeoutMs ?? DEFAULT_WAKE_VERIFY_TIMEOUT_MS,
    pollIntervalMs:
      config.wakeVerification?.pollIntervalMs ?? DEFAULT_WAKE_VERIFY_POLL_INTERVAL_MS,
  };

  const verifyRaw = req.query.verify;
  const verifyOverride = parseBooleanQueryValue(verifyRaw);
  if (verifyRaw !== undefined && verifyOverride === undefined) {
    return { options: null, error: 'Query parameter "verify" must be true/false or 1/0' };
  }

  const timeoutRaw = req.query.verifyTimeoutMs;
  const timeoutOverride = parseIntegerQueryValue(timeoutRaw);
  if (timeoutRaw !== undefined && timeoutOverride === undefined) {
    return { options: null, error: 'Query parameter "verifyTimeoutMs" must be an integer' };
  }

  const pollRaw = req.query.verifyPollIntervalMs ?? req.query.verifyPollMs;
  const pollOverride = parseIntegerQueryValue(pollRaw);
  if (pollRaw !== undefined && pollOverride === undefined) {
    return { options: null, error: 'Query parameter "verifyPollIntervalMs" must be an integer' };
  }

  const timeoutMs = timeoutOverride ?? wakeVerificationConfig.timeoutMs;
  const pollIntervalMs = pollOverride ?? wakeVerificationConfig.pollIntervalMs;
  if (timeoutMs < MIN_WAKE_VERIFY_TIMEOUT_MS || timeoutMs > MAX_WAKE_VERIFY_TIMEOUT_MS) {
    return {
      options: null,
      error: `verifyTimeoutMs must be between ${MIN_WAKE_VERIFY_TIMEOUT_MS} and ${MAX_WAKE_VERIFY_TIMEOUT_MS}`,
    };
  }
  if (
    pollIntervalMs < MIN_WAKE_VERIFY_POLL_INTERVAL_MS ||
    pollIntervalMs > MAX_WAKE_VERIFY_POLL_INTERVAL_MS
  ) {
    return {
      options: null,
      error:
        `verifyPollIntervalMs must be between ${MIN_WAKE_VERIFY_POLL_INTERVAL_MS} and ${MAX_WAKE_VERIFY_POLL_INTERVAL_MS}`,
    };
  }

  return {
    options: {
      enabled: verifyOverride ?? wakeVerificationConfig.enabled,
      timeoutMs,
      pollIntervalMs,
    },
  };
}

function nowMinus(startedAtMs: number): number {
  return Math.max(0, Date.now() - startedAtMs);
}

async function waitForWakeVerificationDelay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function verifyWakeState(
  name: string,
  options: WakeVerificationOptions
): Promise<WakeVerificationResult> {
  const startedAtMs = Date.now();
  const timeoutMs = options.timeoutMs;
  const pollIntervalMs = options.pollIntervalMs;

  if (!options.enabled) {
    return {
      enabled: false,
      status: 'not_requested',
      attempts: 0,
      timeoutMs,
      pollIntervalMs,
      elapsedMs: 0,
      lastObservedStatus: 'unknown',
      message: 'Wake verification not requested',
    };
  }

  if (!hostDb) {
    return {
      enabled: true,
      status: 'error',
      attempts: 0,
      timeoutMs,
      pollIntervalMs,
      elapsedMs: 0,
      lastObservedStatus: 'unknown',
      message: 'Host database not initialized',
    };
  }

  let attempts = 0;
  let lastObservedStatus: Host['status'] | 'unknown' = 'unknown';

  while (nowMinus(startedAtMs) <= timeoutMs) {
    attempts += 1;
    try {
      const currentHost = await hostDb.getHost(name);
      if (!currentHost) {
        return {
          enabled: true,
          status: 'host_not_found',
          attempts,
          timeoutMs,
          pollIntervalMs,
          elapsedMs: nowMinus(startedAtMs),
          lastObservedStatus,
          message: `Host '${name}' was removed during verification`,
        };
      }

      lastObservedStatus = currentHost.status;
      if (currentHost.status === 'awake') {
        return {
          enabled: true,
          status: 'woke',
          attempts,
          timeoutMs,
          pollIntervalMs,
          elapsedMs: nowMinus(startedAtMs),
          lastObservedStatus: 'awake',
          source: 'database',
          message: `Host '${name}' reported awake`,
        };
      }

      if (!currentHost.ip) {
        return {
          enabled: true,
          status: 'not_confirmed',
          attempts,
          timeoutMs,
          pollIntervalMs,
          elapsedMs: nowMinus(startedAtMs),
          lastObservedStatus,
          message: `Host '${name}' has no IP address available for verification`,
        };
      }

      const pingAlive = await networkDiscovery.isHostAlive(currentHost.ip);
      if (pingAlive) {
        return {
          enabled: true,
          status: 'woke',
          attempts,
          timeoutMs,
          pollIntervalMs,
          elapsedMs: nowMinus(startedAtMs),
          lastObservedStatus: 'awake',
          source: 'ping',
          message: `Host '${name}' responded to ping`,
        };
      }
    } catch (error) {
      return {
        enabled: true,
        status: 'error',
        attempts,
        timeoutMs,
        pollIntervalMs,
        elapsedMs: nowMinus(startedAtMs),
        lastObservedStatus,
        message:
          error instanceof Error
            ? `Wake verification failed: ${error.message}`
            : 'Wake verification failed with unknown error',
      };
    }

    const remainingMs = timeoutMs - nowMinus(startedAtMs);
    if (remainingMs <= 0) {
      break;
    }

    await waitForWakeVerificationDelay(Math.min(pollIntervalMs, remainingMs));
  }

  return {
    enabled: true,
    status: 'timeout',
    attempts,
    timeoutMs,
    pollIntervalMs,
    elapsedMs: nowMinus(startedAtMs),
    lastObservedStatus,
    message: `Wake verification timed out after ${timeoutMs}ms`,
  };
}

/**
 * @swagger
 * /hosts:
 *   get:
 *     summary: Get all hosts
 *     description: Retrieve a list of all network hosts (both discovered and manually added)
 *     tags: [Hosts]
 *     security:
 *       - BearerAuth: []
 *       - {}
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
 *       401:
 *         description: Unauthorized - API key required (when NODE_API_KEY is configured)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
const getAllHosts = async (_req: Request, res: Response): Promise<void> => {
  if (!hostDb) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }
  const hosts = await hostDb.getAllHosts();
  const scanInProgress = scanOrchestrator?.isScanInProgress() ?? false;
  const lastScanTime = scanOrchestrator?.getLastScanTime() ?? null;

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
 *     security:
 *       - BearerAuth: []
 *       - {}
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
 *       404:
 *         description: Host not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 'Not Found'
 *                 message:
 *                   type: string
 *                   example: "Host 'PHANTOM-MBP' not found"
 *       401:
 *         description: Unauthorized - API key required (when NODE_API_KEY is configured)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
const getHost = async (req: Request, res: Response): Promise<void> => {
  const name = req.params.name as string;
  logger.info(`Retrieving host with name ${name}`);

  if (!hostDb) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }
  const host = await hostDb.getHost(name);
  if (!host) {
    res.status(404).json({ error: 'Not Found', message: `Host '${name}' not found` });
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
 *     security:
 *       - BearerAuth: []
 *       - {}
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: The hostname to wake up
 *         example: PHANTOM-MBP
 *       - in: query
 *         name: verify
 *         required: false
 *         schema:
 *           type: boolean
 *         description: Enable/disable post-WoL wake verification for this request
 *       - in: query
 *         name: verifyTimeoutMs
 *         required: false
 *         schema:
 *           type: integer
 *         description: Verification timeout in milliseconds (bounded by server limits)
 *       - in: query
 *         name: verifyPollIntervalMs
 *         required: false
 *         schema:
 *           type: integer
 *         description: Verification polling interval in milliseconds (bounded by server limits)
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
 *                 verification:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *                     status:
 *                       type: string
 *                       enum: [not_requested, woke, timeout, not_confirmed, host_not_found, error]
 *                     attempts:
 *                       type: integer
 *                     timeoutMs:
 *                       type: integer
 *                     pollIntervalMs:
 *                       type: integer
 *                     elapsedMs:
 *                       type: integer
 *                     lastObservedStatus:
 *                       type: string
 *                       enum: [awake, asleep, unknown]
 *                     source:
 *                       type: string
 *                       enum: [database, ping]
 *                     message:
 *                       type: string
 *       404:
 *         description: Host not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 'Not Found'
 *                 message:
 *                   type: string
 *                   example: "Host 'PHANTOM-MBP' not found"
 *       401:
 *         description: Unauthorized - API key required (when NODE_API_KEY is configured)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
const wakeUpHost = async (req: Request, res: Response): Promise<void> => {
  const name = req.params.name as string;
  logger.info(`Trying to wake up host with name ${name}`);

  const verificationOptionsResult = resolveWakeVerificationOptions(req);
  if (!verificationOptionsResult.options) {
    res.status(400).json({
      error: 'Bad Request',
      message: verificationOptionsResult.error ?? 'Invalid wake verification options',
    });
    return;
  }

  if (!hostDb) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }
  const host = await hostDb.getHost(name);

  if (!host) {
    res.status(404).json({ error: 'Not Found', message: `Host '${name}' not found` });
    logger.info(`No host found with name ${name}`);
    return;
  }

  // Promisify wol.wake for better async handling
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Wake-on-LAN send error';
    res.status(502).json({
      success: false,
      name: host.name,
      mac: host.mac,
      error: 'WOL_SEND_FAILED',
      message,
      verification: {
        enabled: verificationOptionsResult.options.enabled,
        status: 'error',
        attempts: 0,
        timeoutMs: verificationOptionsResult.options.timeoutMs,
        pollIntervalMs: verificationOptionsResult.options.pollIntervalMs,
        elapsedMs: 0,
        lastObservedStatus: 'unknown',
        message: 'Wake packet send failed; verification skipped',
      } as WakeVerificationResult,
    });
    return;
  }

  const verification = await verifyWakeState(name, verificationOptionsResult.options);

  res.status(200).json({
    success: true,
    name: host.name,
    mac: host.mac,
    message: 'Wake-on-LAN packet sent',
    verification,
  });
};

/**
 * @swagger
 * /hosts/scan:
 *   post:
 *     summary: Trigger immediate network scan
 *     description: Force an immediate network discovery scan using ARP, ICMP ping, and DNS/NetBIOS lookups. Rate limited to 5 requests per minute.
 *     tags: [Network]
 *     security:
 *       - BearerAuth: []
 *       - {}
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
 *       401:
 *         description: Unauthorized - API key required (when NODE_API_KEY is configured)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
const scanNetwork = async (_req: Request, res: Response): Promise<void> => {
  if (!hostDb) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }
  if (!scanOrchestrator) {
    res.status(500).json({ error: 'Scan orchestrator not initialized' });
    return;
  }
  logger.info('Manual network scan requested');
  const scanResult = await scanOrchestrator.syncWithNetwork();
  if (!scanResult.success) {
    const statusCode = scanResult.code === 'SCAN_IN_PROGRESS' ? 409 : 500;
    const error = scanResult.code === 'SCAN_IN_PROGRESS' ? 'Conflict' : 'Internal Server Error';
    res.status(statusCode).json({
      error,
      message: scanResult.error,
    });
    return;
  }

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
 *     security:
 *       - BearerAuth: []
 *       - {}
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
 *               notes:
 *                 type: string
 *                 nullable: true
 *                 description: Optional operator notes for the host
 *                 example: Hypervisor host
 *               tags:
 *                 type: array
 *                 description: Optional host tags
 *                 items:
 *                   type: string
 *                 example: [infra, linux]
 *     responses:
 *       201:
 *         description: Host added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Host'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         description: Unauthorized - API key required (when NODE_API_KEY is configured)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
const addHost = async (req: Request, res: Response): Promise<void> => {
  const { name, mac, ip, notes, tags } = req.body;

  if (!name || !mac || !ip) {
    res.status(400).json({ error: 'Missing required fields: name, mac, ip' });
    return;
  }

  if (!hostDb) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }
  const host = await hostDb.addHost(name, mac, ip, {
    notes,
    tags,
  });
  res.status(201).json(host);
};

/**
 * @swagger
 * /hosts/{name}:
 *   put:
 *     summary: Update host properties
 *     description: Update host name, MAC address, or IP address
 *     tags: [Hosts]
 *     security:
 *       - BearerAuth: []
 *       - {}
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Existing host name
 *         example: OLD-HOSTNAME
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: NEW-HOSTNAME
 *               mac:
 *                 type: string
 *                 example: 'AA:BB:CC:DD:EE:FF'
 *               ip:
 *                 type: string
 *                 example: 192.168.1.200
 *               notes:
 *                 type: string
 *                 nullable: true
 *                 example: Reserved for backup tasks
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [backup, low-priority]
 *     responses:
 *       200:
 *         description: Host updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Host'
 *       404:
 *         description: Host not found
 *       409:
 *         description: Conflict (duplicate name/mac/ip)
 */
const updateHost = async (req: Request, res: Response): Promise<void> => {
  const currentName = req.params.name as string;
  const updates = req.body as Partial<Pick<Host, 'name' | 'mac' | 'ip' | 'notes' | 'tags'>>;

  if (!hostDb) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  const existing = await hostDb.getHost(currentName);
  if (!existing) {
    res.status(404).json({ error: 'Not Found', message: `Host '${currentName}' not found` });
    return;
  }

  try {
    await hostDb.updateHost(currentName, updates);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('UNIQUE constraint failed')) {
      res.status(409).json({
        error: 'Conflict',
        message: 'Host update conflicts with an existing host record',
      });
      return;
    }
    throw error;
  }

  const lookupName = updates.name ?? currentName;
  const updatedHost = await hostDb.getHost(lookupName);
  if (!updatedHost) {
    res.status(500).json({ error: 'Failed to load updated host' });
    return;
  }

  // Forward to C&C in agent mode (if listeners are registered).
  hostDb.emit('host-updated', updatedHost);
  res.status(200).json(updatedHost);
};

/**
 * @swagger
 * /hosts/{name}:
 *   delete:
 *     summary: Delete a host
 *     description: Remove host from local database
 *     tags: [Hosts]
 *     security:
 *       - BearerAuth: []
 *       - {}
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Host name to delete
 *         example: OLD-HOSTNAME
 *     responses:
 *       200:
 *         description: Host deleted successfully
 *       404:
 *         description: Host not found
 */
const deleteHost = async (req: Request, res: Response): Promise<void> => {
  const name = req.params.name as string;

  if (!hostDb) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  const existing = await hostDb.getHost(name);
  if (!existing) {
    res.status(404).json({ error: 'Not Found', message: `Host '${name}' not found` });
    return;
  }

  await hostDb.deleteHost(name);
  // Forward to C&C in agent mode (if listeners are registered).
  hostDb.emit('host-removed', name);
  res.status(200).json({ message: 'Host deleted', name });
};

/**
 * @swagger
 * /hosts/mac-vendor/{mac}:
 *   get:
 *     summary: Get MAC address vendor information
 *     description: Look up the manufacturer/vendor of a network device by MAC address. Results are cached for 24 hours.
 *     tags: [Hosts]
 *     security:
 *       - BearerAuth: []
 *       - {}
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
 *       401:
 *         description: Unauthorized - API key required (when NODE_API_KEY is configured)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
  const mac = req.params.mac as string;

  if (!mac) {
    res.status(400).json({ error: 'MAC address is required' });
    return;
  }
  // Normalize MAC address for cache key
  const normalizedMac = mac.toUpperCase().replace(/[:-]/g, '');

  // Check cache first (LRUCache handles TTL automatically)
  const cached = macVendorCache.get(normalizedMac);
  if (cached) {
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
  } catch (error: unknown) {
    const status = axios.isAxiosError(error)
      ? error.response?.status
      : (error as { response?: { status?: number } })?.response?.status;

    if (status === 404) {
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
    } else if (status === 429) {
      logger.warn('MAC vendor API rate limit exceeded', { mac });
      res.status(429).json({
        error: 'Rate limit exceeded, please try again later',
        mac,
      });
    } else {
      logger.error('MAC vendor lookup error:', {
        mac,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to lookup MAC vendor' });
    }
  }
};

export {
  setHostDatabase,
  setScanOrchestrator,
  getAllHosts,
  getHost,
  wakeUpHost,
  scanNetwork,
  addHost,
  updateHost,
  deleteHost,
  getMacVendor,
};
