/**
 * Node management API controller
 */

import { Request, Response } from 'express';
import { NodeModel } from '../models/Node';
import logger from '../utils/logger';
import { NodeManager } from '../services/nodeManager';

export class NodesController {
  constructor(private nodeManager: NodeManager) {}

  /**
   * GET /api/nodes - List all nodes
   */
  async listNodes(_req: Request, res: Response): Promise<void> {
    try {
      const nodes = await NodeModel.findAll();
      
      // Add connection status
      const nodesWithConnection = nodes.map(node => ({
        ...node,
        connected: this.nodeManager.isNodeConnected(node.id),
      }));

      res.json({ nodes: nodesWithConnection });
    } catch (error) {
      logger.error('Failed to list nodes', { error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve nodes',
      });
    }
  }

  /**
   * GET /api/nodes/:id - Get node by ID
   */
  async getNode(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const node = await NodeModel.findById(id);

      if (!node) {
        res.status(404).json({
          error: 'Not Found',
          message: `Node ${id} not found`,
        });
        return;
      }

      res.json({
        ...node,
        connected: this.nodeManager.isNodeConnected(node.id),
      });
    } catch (error) {
      logger.error('Failed to get node', { error, nodeId: req.params.id });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve node',
      });
    }
  }

  /**
   * GET /api/nodes/:id/health - Check node health
   */
  async getNodeHealth(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const node = await NodeModel.findById(id);

      if (!node) {
        res.status(404).json({
          error: 'Not Found',
          message: `Node ${id} not found`,
        });
        return;
      }

      const connected = this.nodeManager.isNodeConnected(id);
      const timeSinceHeartbeat = Date.now() - node.lastHeartbeat.getTime();

      res.json({
        nodeId: id,
        status: node.status,
        connected,
        lastHeartbeat: node.lastHeartbeat,
        timeSinceHeartbeat,
        healthy: connected && node.status === 'online',
      });
    } catch (error) {
      logger.error('Failed to get node health', { error, nodeId: req.params.id });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to check node health',
      });
    }
  }
}

export default NodesController;
