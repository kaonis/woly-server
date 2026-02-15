/**
 * Hosts controller - API endpoints for aggregated hosts
 */

import { Request, Response } from 'express';
import { isIP } from 'node:net';
import { z } from 'zod';
import { hostStatusSchema } from '@kaonis/woly-protocol';
import { HostAggregator } from '../services/hostAggregator';
import { CommandRouter } from '../services/commandRouter';
import { lookupMacVendor, MAC_ADDRESS_PATTERN } from '../services/macVendorService';
import logger from '../utils/logger';

// Validation schema for updateHost request body
const ipAddressSchema = z.string().refine((value) => isIP(value) !== 0, {
  message: 'IP address must be a valid IPv4 or IPv6 address',
});

const updateHostBodySchema = z.object({
  name: z.string().min(1).optional(),
  mac: z.string().regex(MAC_ADDRESS_PATTERN).optional(),
  ip: ipAddressSchema.optional(),
  status: hostStatusSchema.optional(),
  notes: z.string().max(2_000).nullable().optional(),
  tags: z.array(z.string().min(1).max(64)).max(32).optional(),
}).strict();

type PortScanEndpointResponse = {
  target: string;
  scannedAt: string;
  openPorts: Array<{ port: number; protocol: 'tcp'; service: string }>;
  scan?: {
    commandId?: string;
    state?: 'acknowledged' | 'failed';
    nodeId?: string;
    message?: string;
  };
  message?: string;
  correlationId?: string;
};

function mapCommandError(error: unknown, fallbackMessage: string): {
  statusCode: number;
  errorTitle: string;
  message: string;
} {
  let statusCode = 500;
  let message = fallbackMessage;

  if (error instanceof Error) {
    message = error.message;
    if (error.message.includes('Invalid FQN')) {
      statusCode = 400;
    } else if (error.message.includes('not found')) {
      statusCode = 404;
    } else if (error.message.includes('offline')) {
      statusCode = 503;
    } else if (error.message.includes('timeout')) {
      statusCode = 504;
    }
  }

  let errorTitle: string;
  switch (statusCode) {
    case 400:
      errorTitle = 'Bad Request';
      break;
    case 404:
      errorTitle = 'Not Found';
      break;
    case 503:
      errorTitle = 'Service Unavailable';
      break;
    case 504:
      errorTitle = 'Gateway Timeout';
      break;
    case 500:
    default:
      errorTitle = 'Internal Server Error';
      break;
  }

  return { statusCode, errorTitle, message };
}

export class HostsController {
  constructor(
    private hostAggregator: HostAggregator,
    private commandRouter: CommandRouter,
  ) {}

  /**
   * @swagger
   * /api/hosts:
   *   get:
   *     summary: Get all aggregated hosts
   *     description: Retrieve all hosts from all nodes with optional filtering by node ID
   *     tags: [Hosts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: nodeId
   *         schema:
   *           type: string
   *         description: Optional node ID to filter hosts
   *         example: home-network
   *     responses:
   *       200:
   *         description: List of hosts with statistics
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 hosts:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Host'
   *                 stats:
   *                   $ref: '#/components/schemas/HostStats'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getHosts(req: Request, res: Response): Promise<void> {
    try {
      const { nodeId } = req.query;

      let hosts;
      if (nodeId && typeof nodeId === 'string') {
        hosts = await this.hostAggregator.getHostsByNode(nodeId);
        logger.debug('Retrieved hosts for node', { nodeId, count: hosts.length });
      } else {
        hosts = await this.hostAggregator.getAllHosts();
        logger.debug('Retrieved all hosts', { count: hosts.length });
      }

      const stats = await this.hostAggregator.getStats();

      res.json({
        hosts,
        stats,
      });
    } catch (error) {
      logger.error('Failed to get hosts', { error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve hosts',
      });
    }
  }

  /**
   * @swagger
   * /api/hosts/{fqn}:
   *   get:
   *     summary: Get host by fully qualified name
   *     description: Retrieve detailed information about a specific host using its FQN (hostname@location)
   *     tags: [Hosts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: fqn
   *         required: true
   *         schema:
   *           type: string
   *         description: Fully qualified name (hostname@location)
   *         example: PHANTOM-MBP@home-network
   *     responses:
   *       200:
   *         description: Host found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Host'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getHostByFQN(req: Request, res: Response): Promise<void> {
    try {
      const fqn = req.params.fqn as string;

      const host = await this.hostAggregator.getHostByFQN(fqn);

      if (!host) {
        res.status(404).json({
          error: 'Not Found',
          message: `Host ${fqn} not found`,
        });
        return;
      }

      res.json(host);
    } catch (error) {
      logger.error('Failed to get host', { fqn: req.params.fqn, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve host',
      });
    }
  }

  /**
   * @swagger
   * /api/hosts/wakeup/{fqn}:
   *   post:
   *     summary: Wake up a host using Wake-on-LAN
   *     description: Send a Wake-on-LAN magic packet to the specified host via its managing node
   *     tags: [Hosts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: fqn
   *         required: true
   *         schema:
   *           type: string
   *         description: Fully qualified name (hostname@location)
   *         example: PHANTOM-MBP@home-network
   *       - in: header
   *         name: Idempotency-Key
   *         schema:
   *           type: string
   *         description: Optional idempotency key to prevent duplicate commands
   *         example: unique-request-id-123
   *     responses:
   *       200:
   *         description: Wake command sent successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/CommandResult'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       503:
   *         $ref: '#/components/responses/ServiceUnavailable'
   *       504:
   *         $ref: '#/components/responses/GatewayTimeout'
   */
  async wakeupHost(req: Request, res: Response): Promise<void> {
    try {
      const fqn = req.params.fqn as string;
      const correlationId = req.correlationId ?? null;
      logger.info('Wake-up request received', { fqn });

      const idempotencyKeyHeader = req.header('Idempotency-Key');
      const idempotencyKey =
        idempotencyKeyHeader && idempotencyKeyHeader.trim().length > 0
          ? idempotencyKeyHeader.trim()
          : null;

      const routeOptions: { idempotencyKey: string | null; correlationId?: string } = {
        idempotencyKey,
      };
      if (correlationId) {
        routeOptions.correlationId = correlationId;
      }

      const result = await this.commandRouter.routeWakeCommand(fqn, routeOptions);
      const responseBody = { ...result } as typeof result & { correlationId?: string };
      const responseCorrelationId = result.correlationId ?? correlationId ?? undefined;
      if (responseCorrelationId) {
        responseBody.correlationId = responseCorrelationId;
      }

      res.json(responseBody);
    } catch (error: unknown) {
      logger.error('Failed to wake host', { fqn: req.params.fqn, error });

      // Determine appropriate status code
      let statusCode = 500;
      let errorMessage = 'Failed to wake host';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes('Invalid FQN')) {
          statusCode = 400;
        } else if (error.message.includes('not found')) {
          statusCode = 404;
        } else if (error.message.includes('offline')) {
          statusCode = 503;
        } else if (error.message.includes('timeout')) {
          statusCode = 504;
        }
      }

      // Map status code to appropriate error title
      let errorTitle: string;
      switch (statusCode) {
        case 400:
          errorTitle = 'Bad Request';
          break;
        case 404:
          errorTitle = 'Not Found';
          break;
        case 503:
          errorTitle = 'Service Unavailable';
          break;
        case 504:
          errorTitle = 'Gateway Timeout';
          break;
        case 500:
        default:
          errorTitle = 'Internal Server Error';
          break;
      }

      const errorBody: { error: string; message: string; correlationId?: string } = {
        error: errorTitle,
        message: errorMessage,
      };
      if (req.correlationId) {
        errorBody.correlationId = req.correlationId;
      }

      res.status(statusCode).json(errorBody);
    }
  }

  /**
   * @swagger
   * /api/hosts/ports/{fqn}:
   *   get:
   *     summary: Get cached/synthetic host port-scan payload
   *     description: |
   *       Returns a mobile-compatible port-scan payload shape for CNC mode.
   *       The current protocol does not include per-host open-port telemetry, so
   *       `openPorts` is returned as an empty list.
   *     tags: [Hosts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: fqn
   *         required: true
   *         schema:
   *           type: string
   *         description: Fully qualified name (hostname@location)
   *         example: PHANTOM-MBP@home-network
   *     responses:
   *       200:
   *         description: Port payload shape returned
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getHostPorts(req: Request, res: Response): Promise<void> {
    try {
      const fqn = req.params.fqn as string;
      const host = await this.hostAggregator.getHostByFQN(fqn);

      if (!host) {
        res.status(404).json({
          error: 'Not Found',
          message: `Host ${fqn} not found`,
        });
        return;
      }

      const response: PortScanEndpointResponse = {
        target: fqn,
        scannedAt: new Date().toISOString(),
        openPorts: [],
        message: 'Per-host open-port telemetry is not yet available in CNC protocol.',
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to get host ports', { fqn: req.params.fqn, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve host port data',
      });
    }
  }

  /**
   * @swagger
   * /api/hosts/scan-ports/{fqn}:
   *   get:
   *     summary: Trigger host-side scan operation and return compatible port payload
   *     description: |
   *       Dispatches a node scan command for the host's managing node and returns
   *       a mobile-compatible port payload shape.
   *       The current protocol does not provide per-host open-port telemetry, so
   *       `openPorts` remains an empty list.
   *     tags: [Hosts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: fqn
   *         required: true
   *         schema:
   *           type: string
   *         description: Fully qualified name (hostname@location)
   *         example: PHANTOM-MBP@home-network
   *     responses:
   *       200:
   *         description: Scan dispatched/completed and payload returned
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       503:
   *         $ref: '#/components/responses/ServiceUnavailable'
   *       504:
   *         $ref: '#/components/responses/GatewayTimeout'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async scanHostPorts(req: Request, res: Response): Promise<void> {
    try {
      const fqn = req.params.fqn as string;
      const correlationId = req.correlationId ?? null;
      const host = await this.hostAggregator.getHostByFQN(fqn);

      if (!host) {
        res.status(404).json({
          error: 'Not Found',
          message: `Host ${fqn} not found`,
        });
        return;
      }

      const routeOptions: { correlationId?: string } = {};
      if (correlationId) {
        routeOptions.correlationId = correlationId;
      }

      const result = await this.commandRouter.routeScanCommand(host.nodeId, true, routeOptions);

      const response: PortScanEndpointResponse = {
        target: fqn,
        scannedAt: new Date().toISOString(),
        openPorts: [],
        scan: {
          commandId: result.commandId,
          state: result.success ? 'acknowledged' : 'failed',
          nodeId: host.nodeId,
          message: result.success
            ? 'Node network scan completed; per-host open-port telemetry is not yet available.'
            : result.error ?? 'Node scan failed',
        },
        message: result.success
          ? 'Scan command executed successfully'
          : result.error ?? 'Scan command failed',
      };

      const responseCorrelationId = result.correlationId ?? correlationId ?? undefined;
      if (responseCorrelationId) {
        response.correlationId = responseCorrelationId;
      }

      if (!result.success) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: result.error || 'Failed to execute scan command',
          ...(response.correlationId ? { correlationId: response.correlationId } : {}),
        });
        return;
      }

      res.json(response);
    } catch (error: unknown) {
      logger.error('Failed to scan host ports', { fqn: req.params.fqn, error });

      const mapped = mapCommandError(error, 'Failed to scan host ports');
      const errorBody: { error: string; message: string; correlationId?: string } = {
        error: mapped.errorTitle,
        message: mapped.message,
      };
      if (req.correlationId) {
        errorBody.correlationId = req.correlationId;
      }

      res.status(mapped.statusCode).json(errorBody);
    }
  }

  /**
   * @swagger
   * /api/hosts/{fqn}:
   *   put:
   *     summary: Update host information
   *     description: Update a host's properties via its managing node
   *     tags: [Hosts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: fqn
   *         required: true
   *         schema:
   *           type: string
   *         description: Fully qualified name (hostname@location)
   *         example: PHANTOM-MBP@home-network
   *       - in: header
   *         name: Idempotency-Key
   *         schema:
   *           type: string
   *         description: Optional idempotency key to prevent duplicate commands
   *         example: unique-request-id-123
   *     requestBody:
   *       required: true
   *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Host properties to update
 *             properties:
 *               name:
 *                 type: string
 *               mac:
 *                 type: string
 *               ip:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [awake, asleep]
 *               notes:
 *                 type: string
 *                 nullable: true
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
   *     responses:
   *       200:
   *         description: Host updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: Host updated successfully
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   *       503:
   *         $ref: '#/components/responses/ServiceUnavailable'
   *       504:
   *         $ref: '#/components/responses/GatewayTimeout'
   */
  async updateHost(req: Request, res: Response): Promise<void> {
    try {
      const fqn = req.params.fqn as string;
      const correlationId = req.correlationId ?? null;
      
      // Validate request body
      const parseResult = updateHostBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid request body',
          details: parseResult.error.issues,
        });
        return;
      }

      const hostData = parseResult.data;
      logger.info('Update host request received', { fqn });

      const idempotencyKeyHeader = req.header('Idempotency-Key');
      const idempotencyKey =
        idempotencyKeyHeader && idempotencyKeyHeader.trim().length > 0
          ? idempotencyKeyHeader.trim()
          : null;

      const routeOptions: { idempotencyKey: string | null; correlationId?: string } = {
        idempotencyKey,
      };
      if (correlationId) {
        routeOptions.correlationId = correlationId;
      }

      const result = await this.commandRouter.routeUpdateHostCommand(fqn, hostData, routeOptions);

      if (!result.success) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: result.error || 'Failed to update host',
        });
        return;
      }

      const responseBody: { success: boolean; message: string; correlationId?: string } = {
        success: true,
        message: 'Host updated successfully',
      };
      const responseCorrelationId = result.correlationId ?? correlationId ?? undefined;
      if (responseCorrelationId) {
        responseBody.correlationId = responseCorrelationId;
      }

      res.json(responseBody);
    } catch (error: unknown) {
      logger.error('Failed to update host', { fqn: req.params.fqn, error });

      // Determine appropriate status code
      let statusCode = 500;
      let errorMessage = 'Failed to update host';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes('Invalid FQN')) {
          statusCode = 400;
        } else if (error.message.includes('not found')) {
          statusCode = 404;
        } else if (error.message.includes('offline')) {
          statusCode = 503;
        } else if (error.message.includes('timeout')) {
          statusCode = 504;
        }
      }

      // Map status code to appropriate error title
      let errorTitle: string;
      switch (statusCode) {
        case 400:
          errorTitle = 'Bad Request';
          break;
        case 404:
          errorTitle = 'Not Found';
          break;
        case 503:
          errorTitle = 'Service Unavailable';
          break;
        case 504:
          errorTitle = 'Gateway Timeout';
          break;
        case 500:
        default:
          errorTitle = 'Internal Server Error';
          break;
      }

      const errorBody: { error: string; message: string; correlationId?: string } = {
        error: errorTitle,
        message: errorMessage,
      };
      if (req.correlationId) {
        errorBody.correlationId = req.correlationId;
      }

      res.status(statusCode).json(errorBody);
    }
  }

  /**
   * @swagger
   * /api/hosts/{fqn}:
   *   delete:
   *     summary: Delete a host
   *     description: Remove a host from its managing node
   *     tags: [Hosts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: fqn
   *         required: true
   *         schema:
   *           type: string
   *         description: Fully qualified name (hostname@location)
   *         example: PHANTOM-MBP@home-network
   *       - in: header
   *         name: Idempotency-Key
   *         schema:
   *           type: string
   *         description: Optional idempotency key to prevent duplicate commands
   *         example: unique-request-id-123
   *     responses:
   *       200:
   *         description: Host deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: Host deleted successfully
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   *       503:
   *         $ref: '#/components/responses/ServiceUnavailable'
   *       504:
   *         $ref: '#/components/responses/GatewayTimeout'
   */
  async deleteHost(req: Request, res: Response): Promise<void> {
    try {
      const fqn = req.params.fqn as string;
      const correlationId = req.correlationId ?? null;
      logger.info('Delete host request received', { fqn });

      const idempotencyKeyHeader = req.header('Idempotency-Key');
      const idempotencyKey =
        idempotencyKeyHeader && idempotencyKeyHeader.trim().length > 0
          ? idempotencyKeyHeader.trim()
          : null;

      const routeOptions: { idempotencyKey: string | null; correlationId?: string } = {
        idempotencyKey,
      };
      if (correlationId) {
        routeOptions.correlationId = correlationId;
      }

      const result = await this.commandRouter.routeDeleteHostCommand(fqn, routeOptions);

      if (!result.success) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: result.error || 'Failed to delete host',
        });
        return;
      }

      const responseBody: { success: boolean; message: string; correlationId?: string } = {
        success: true,
        message: 'Host deleted successfully',
      };
      const responseCorrelationId = result.correlationId ?? correlationId ?? undefined;
      if (responseCorrelationId) {
        responseBody.correlationId = responseCorrelationId;
      }

      res.json(responseBody);
    } catch (error: unknown) {
      logger.error('Failed to delete host', { fqn: req.params.fqn, error });

      // Determine appropriate status code
      let statusCode = 500;
      let errorMessage = 'Failed to delete host';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes('Invalid FQN')) {
          statusCode = 400;
        } else if (error.message.includes('not found')) {
          statusCode = 404;
        } else if (error.message.includes('offline')) {
          statusCode = 503;
        } else if (error.message.includes('timeout')) {
          statusCode = 504;
        }
      }

      // Map status code to appropriate error title
      let errorTitle: string;
      switch (statusCode) {
        case 400:
          errorTitle = 'Bad Request';
          break;
        case 404:
          errorTitle = 'Not Found';
          break;
        case 503:
          errorTitle = 'Service Unavailable';
          break;
        case 504:
          errorTitle = 'Gateway Timeout';
          break;
        case 500:
        default:
          errorTitle = 'Internal Server Error';
          break;
      }

      const errorBody: { error: string; message: string; correlationId?: string } = {
        error: errorTitle,
        message: errorMessage,
      };
      if (req.correlationId) {
        errorBody.correlationId = req.correlationId;
      }

      res.status(statusCode).json(errorBody);
    }
  }

  /**
   * @swagger
   * /api/hosts/mac-vendor/{mac}:
   *   get:
   *     summary: Get MAC address vendor information
   *     description: |
   *       Look up the manufacturer/vendor of a network device by MAC address.
   *       Results are cached for 24 hours to minimize external API calls.
   *       The external macvendors.com API is rate-limited to one request per second.
   *     tags: [Hosts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: mac
   *         required: true
   *         schema:
   *           type: string
   *           pattern: '^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$'
   *         description: MAC address to look up (case-insensitive, accepts colon or hyphen delimiters)
   *         example: '80:6D:97:60:39:08'
   *     responses:
   *       200:
   *         description: Vendor information retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               required:
   *                 - mac
   *                 - vendor
   *                 - source
   *               properties:
   *                 mac:
   *                   type: string
   *                   description: MAC address as provided in request
   *                   example: '80:6D:97:60:39:08'
   *                 vendor:
   *                   type: string
   *                   description: Vendor/manufacturer name (or "Unknown Vendor" if not found)
   *                   example: 'Apple, Inc.'
   *                 source:
   *                   type: string
   *                   description: Data source (includes "cached" suffix for cached results)
   *                   example: 'macvendors.com (cached)'
   *       400:
   *         description: Bad request - MAC address missing or invalid format
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 error:
   *                   type: string
   *                   example: 'MAC address is required'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       429:
   *         description: Rate limit exceeded - wait before retrying
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
   *                   example: 'AA:BB:CC:DD:EE:FF'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getMacVendor(req: Request, res: Response): Promise<void> {
    try {
      const mac = req.params.mac as string;

      if (!mac) {
        res.status(400).json({ error: 'MAC address is required' });
        return;
      }

      // Validate MAC address format to match OpenAPI contract and prevent
      // malformed inputs from reaching the external API/cache.
      if (!MAC_ADDRESS_PATTERN.test(mac)) {
        res.status(400).json({ error: 'Invalid MAC address format' });
        return;
      }

      const result = await lookupMacVendor(mac);
      res.json(result);
    } catch (error: unknown) {
      // Log the full error object for stack/context
      logger.error('MAC vendor lookup failed', { mac: req.params.mac, error });

      // Type guard for error with statusCode property
      const hasStatusCode = (err: unknown): err is { statusCode: number; message: string } =>
        typeof err === 'object' && err !== null && 'statusCode' in err;

      const statusCode = hasStatusCode(error) ? error.statusCode : 500;
      const errorMessage = error instanceof Error ? error.message : 'Failed to lookup MAC vendor';

      if (statusCode === 429) {
        res.status(429).json({
          error: 'Too Many Requests',
          message: errorMessage,
        });
      } else {
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to lookup MAC vendor',
        });
      }
    }
  }
}

export default HostsController;
