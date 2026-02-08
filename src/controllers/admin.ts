/**
 * Admin API controller for node management
 */

import { Request, Response } from 'express';
import { NodeModel } from '../models/Node';
import { CommandModel } from '../models/Command';
import { HostAggregator } from '../services/hostAggregator';
import { NodeManager } from '../services/nodeManager';
import logger from '../utils/logger';

export class AdminController {
  constructor(
    private hostAggregator: HostAggregator,
    private nodeManager?: NodeManager
  ) {}
  /**
   * DELETE /api/admin/nodes/:id - Deregister a node
   */
  async deleteNode(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
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
   * GET /api/admin/stats - Get system statistics
   */
  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const nodeCounts = await NodeModel.getStatusCounts();
      const hostStats = await this.hostAggregator.getStats();

      res.json({
        nodes: nodeCounts,
        hosts: hostStats,
        websocket: this.nodeManager
          ? {
              connectedNodes: this.nodeManager.getConnectedNodes().length,
              protocolValidationFailures: this.nodeManager.getProtocolValidationStats(),
            }
          : undefined,
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
   * GET /api/admin/commands - List recent command outcomes
   * Query params:
   * - limit (optional, default 50)
   * - nodeId (optional)
   */
  async listCommands(req: Request, res: Response): Promise<void> {
    try {
      const limitRaw = req.query.limit;
      const nodeIdRaw = req.query.nodeId;
      const limit = typeof limitRaw === 'string' ? Math.min(Math.max(parseInt(limitRaw, 10) || 50, 1), 200) : 50;
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
