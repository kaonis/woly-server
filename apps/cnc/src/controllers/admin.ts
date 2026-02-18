/**
 * Admin API controller for node management
 */

import { Request, Response } from 'express';
import { NodeModel } from '../models/Node';
import { CommandModel } from '../models/Command';
import { HostAggregator } from '../services/hostAggregator';
import { NodeManager } from '../services/nodeManager';
import { CommandRouter } from '../services/commandRouter';
import type { HostStateStreamBroker } from '../services/hostStateStreamBroker';
import { runtimeMetrics } from '../services/runtimeMetrics';
import logger from '../utils/logger';

export class AdminController {
  constructor(
    private hostAggregator: HostAggregator,
    private nodeManager?: NodeManager,
    private commandRouter?: CommandRouter,
    private hostStateStreamBroker?: HostStateStreamBroker
  ) {}
  /**
   * @swagger
   * /api/admin/nodes/{id}:
   *   delete:
   *     summary: Deregister a node
   *     description: Remove a node from the system (admin only)
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: The node ID to delete
   *         example: home-network
   *     responses:
   *       200:
   *         description: Node deleted successfully
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
   *                   example: Node home-network deleted successfully
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async deleteNode(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const deleted = await NodeModel.delete(id);

      if (!deleted) {
        res.status(404).json({
          error: 'Not Found',
          message: `Node ${id} not found`,
        });
        return;
      }

      logger.info('Node deleted via admin API', { nodeId: id });
      res.json({
        success: true,
        message: `Node ${id} deleted successfully`,
      });
    } catch (error) {
      logger.error('Failed to delete node', { error, nodeId: req.params.id });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete node',
      });
    }
  }

  /**
   * @swagger
   * /api/admin/stats:
   *   get:
   *     summary: Get system statistics
   *     description: Retrieve comprehensive system statistics including nodes, hosts, and WebSocket connections (admin only)
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: System statistics
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SystemStats'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const nodeCounts = await NodeModel.getStatusCounts();
      const hostStats = await this.hostAggregator.getStats();
      const commandRouterStats =
        this.commandRouter && typeof this.commandRouter.getStats === 'function'
          ? this.commandRouter.getStats()
          : undefined;

      res.json({
        nodes: nodeCounts,
        hosts: hostStats,
        websocket: this.nodeManager || this.hostStateStreamBroker
          ? {
              connectedNodes: this.nodeManager
                ? this.nodeManager.getConnectedNodes().length
                : 0,
              protocolValidationFailures: this.nodeManager
                ? this.nodeManager.getProtocolValidationStats()
                : { total: 0, byKey: {} },
              mobileHostStateStream: this.hostStateStreamBroker?.getStats(),
            }
          : undefined,
        commandRouter: commandRouterStats,
        observability: runtimeMetrics.snapshot(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get stats', { error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve statistics',
      });
    }
  }

  /**
   * @swagger
   * /api/admin/commands:
   *   get:
   *     summary: List recent command outcomes
   *     description: Retrieve recent command history with optional filtering (admin only)
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 200
   *           default: 50
   *         description: Maximum number of commands to return
   *         example: 50
   *       - in: query
   *         name: nodeId
   *         schema:
   *           type: string
   *         description: Optional node ID to filter commands
   *         example: home-network
   *     responses:
   *       200:
   *         description: List of recent commands
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 commands:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Command'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async listCommands(req: Request, res: Response): Promise<void> {
    try {
      const limitRaw = req.query.limit;
      const nodeIdRaw = req.query.nodeId;
      const parsedLimit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : NaN;
      const limit = Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 200)
        : 50;
      const nodeId = typeof nodeIdRaw === 'string' && nodeIdRaw.trim().length > 0 ? nodeIdRaw.trim() : null;

      const commands = await CommandModel.listRecent({ limit, nodeId });

      res.json({ commands });
    } catch (error) {
      logger.error('Failed to list commands', { error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to list commands',
      });
    }
  }
}

export default AdminController;
