/**
 * Hosts controller - API endpoints for aggregated hosts
 */

import { Request, Response } from 'express';
import { HostAggregator } from '../services/hostAggregator';
import { CommandRouter } from '../services/commandRouter';
import { lookupMacVendor } from '../services/macVendorService';
import logger from '../utils/logger';

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
      logger.info('Wake-up request received', { fqn });

      const idempotencyKeyHeader = req.header('Idempotency-Key');
      const idempotencyKey =
        idempotencyKeyHeader && idempotencyKeyHeader.trim().length > 0
          ? idempotencyKeyHeader.trim()
          : null;

      const result = await this.commandRouter.routeWakeCommand(fqn, { idempotencyKey });

      res.json(result);
    } catch (error: any) {
      logger.error('Failed to wake host', { fqn: req.params.fqn, error });

      // Determine appropriate status code
      let statusCode = 500;
      if (error.message?.includes('not found')) {
        statusCode = 404;
      } else if (error.message?.includes('offline')) {
        statusCode = 503;
      } else if (error.message?.includes('timeout')) {
        statusCode = 504;
      }

      res.status(statusCode).json({
        error: statusCode === 500 ? 'Internal Server Error' : 'Service Unavailable',
        message: error.message || 'Failed to wake host',
      });
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
      const hostData = req.body;
      logger.info('Update host request received', { fqn });

      const idempotencyKeyHeader = req.header('Idempotency-Key');
      const idempotencyKey =
        idempotencyKeyHeader && idempotencyKeyHeader.trim().length > 0
          ? idempotencyKeyHeader.trim()
          : null;

      const result = await this.commandRouter.routeUpdateHostCommand(fqn, hostData, {
        idempotencyKey,
      });

      if (!result.success) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: result.error || 'Failed to update host',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Host updated successfully',
      });
    } catch (error: any) {
      logger.error('Failed to update host', { fqn: req.params.fqn, error });

      // Determine appropriate status code
      let statusCode = 500;
      if (error.message?.includes('not found')) {
        statusCode = 404;
      } else if (error.message?.includes('offline')) {
        statusCode = 503;
      } else if (error.message?.includes('timeout')) {
        statusCode = 504;
      }

      res.status(statusCode).json({
        error: statusCode === 500 ? 'Internal Server Error' : 'Service Unavailable',
        message: error.message || 'Failed to update host',
      });
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
      logger.info('Delete host request received', { fqn });

      const idempotencyKeyHeader = req.header('Idempotency-Key');
      const idempotencyKey =
        idempotencyKeyHeader && idempotencyKeyHeader.trim().length > 0
          ? idempotencyKeyHeader.trim()
          : null;

      const result = await this.commandRouter.routeDeleteHostCommand(fqn, { idempotencyKey });

      if (!result.success) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: result.error || 'Failed to delete host',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Host deleted successfully',
      });
    } catch (error: any) {
      logger.error('Failed to delete host', { fqn: req.params.fqn, error });

      // Determine appropriate status code
      let statusCode = 500;
      if (error.message?.includes('not found')) {
        statusCode = 404;
      } else if (error.message?.includes('offline')) {
        statusCode = 503;
      } else if (error.message?.includes('timeout')) {
        statusCode = 504;
      }

      res.status(statusCode).json({
        error: statusCode === 500 ? 'Internal Server Error' : 'Service Unavailable',
        message: error.message || 'Failed to delete host',
      });
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

      const result = await lookupMacVendor(mac);
      res.json(result);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      logger.error('MAC vendor lookup failed', { mac: req.params.mac, error: error.message });

      if (statusCode === 429) {
        res.status(429).json({ error: error.message, mac: req.params.mac });
      } else {
        res.status(500).json({ error: 'Failed to lookup MAC vendor' });
      }
    }
  }
}

export default HostsController;
