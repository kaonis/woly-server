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
   * @swagger
   * /api/nodes:
   *   get:
   *     summary: List all nodes
   *     description: Retrieve a list of all registered nodes with connection status
   *     tags: [Nodes]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of nodes
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 nodes:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Node'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       403:
   *         $ref: '#/components/responses/Forbidden'
   *       500:
   *         $ref: '#/components/responses/InternalError'
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
   * @swagger
   * /api/nodes/{id}:
   *   get:
   *     summary: Get node by ID
   *     description: Retrieve detailed information about a specific node
   *     tags: [Nodes]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: The node ID
   *         example: home-network
   *     responses:
   *       200:
   *         description: Node found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Node'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       403:
   *         $ref: '#/components/responses/Forbidden'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getNode(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
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
   * @swagger
   * /api/nodes/{id}/health:
   *   get:
   *     summary: Check node health
   *     description: Get detailed health status of a specific node
   *     tags: [Nodes]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: The node ID
   *         example: home-network
   *     responses:
   *       200:
   *         description: Node health status
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 nodeId:
   *                   type: string
   *                   example: home-network
   *                 status:
   *                   type: string
   *                   enum: [online, offline]
   *                   example: online
   *                 connected:
   *                   type: boolean
   *                   example: true
   *                 lastHeartbeat:
   *                   type: string
   *                   format: date-time
   *                   example: '2026-02-09T13:00:00.000Z'
   *                 timeSinceHeartbeat:
   *                   type: integer
   *                   description: Milliseconds since last heartbeat
   *                   example: 5000
   *                 healthy:
   *                   type: boolean
   *                   example: true
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       403:
   *         $ref: '#/components/responses/Forbidden'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getNodeHealth(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
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
