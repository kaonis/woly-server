/**
 * Hosts controller - API endpoints for aggregated hosts
 */

import { Request, Response } from 'express';
import { HostAggregator } from '../services/hostAggregator';
import { CommandRouter } from '../services/commandRouter';
import logger from '../utils/logger';

export class HostsController {
  constructor(
    private hostAggregator: HostAggregator,
    private commandRouter: CommandRouter
  ) {}

  /**
   * GET /api/hosts
   * Get all aggregated hosts from all nodes
   * Query params: nodeId (optional) - filter by specific node
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
   * GET /api/hosts/:fqn
   * Get a specific host by fully qualified name (hostname@location)
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
   * POST /api/hosts/wakeup/:fqn
   * Send Wake-on-LAN packet to a specific host
   */
  async wakeupHost(req: Request, res: Response): Promise<void> {
    try {
      const fqn = req.params.fqn as string;
      logger.info('Wake-up request received', { fqn });

      const idempotencyKeyHeader = req.header('Idempotency-Key');
      const idempotencyKey = idempotencyKeyHeader && idempotencyKeyHeader.trim().length > 0
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
   * PUT /api/hosts/:fqn
   * Update a host's information
   */
  async updateHost(req: Request, res: Response): Promise<void> {
    try {
      const fqn = req.params.fqn as string;
      const hostData = req.body;
      logger.info('Update host request received', { fqn });

      const idempotencyKeyHeader = req.header('Idempotency-Key');
      const idempotencyKey = idempotencyKeyHeader && idempotencyKeyHeader.trim().length > 0
        ? idempotencyKeyHeader.trim()
        : null;

      const result = await this.commandRouter.routeUpdateHostCommand(fqn, hostData, { idempotencyKey });

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
   * DELETE /api/hosts/:fqn
   * Delete a host
   */
  async deleteHost(req: Request, res: Response): Promise<void> {
    try {
      const fqn = req.params.fqn as string;
      logger.info('Delete host request received', { fqn });

      const idempotencyKeyHeader = req.header('Idempotency-Key');
      const idempotencyKey = idempotencyKeyHeader && idempotencyKeyHeader.trim().length > 0
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
}

export default HostsController;
