/**
 * Express routes configuration
 */

import { Router } from 'express';
import { NodesController } from '../controllers/nodes';
import { AdminController } from '../controllers/admin';
import { HostsController } from '../controllers/hosts';
import { AuthController } from '../controllers/auth';
import { CapabilitiesController } from '../controllers/capabilities';
import { NodeManager } from '../services/nodeManager';
import { HostAggregator } from '../services/hostAggregator';
import { CommandRouter } from '../services/commandRouter';
import { runtimeMetrics } from '../services/runtimeMetrics';
import { authenticateJwt, authorizeRoles } from '../middleware/auth';
import { apiLimiter, strictAuthLimiter } from '../middleware/rateLimiter';
import { assignCorrelationId } from '../middleware/correlationId';

export function createRoutes(
  nodeManager: NodeManager,
  hostAggregator: HostAggregator,
  commandRouter: CommandRouter,
): Router {
  const router = Router();
  router.use(assignCorrelationId);

  // Controllers
  const nodesController = new NodesController(nodeManager);
  const adminController = new AdminController(hostAggregator, nodeManager, commandRouter);
  const hostsController = new HostsController(hostAggregator, commandRouter);
  const authController = new AuthController();
  const capabilitiesController = new CapabilitiesController();

  // Public API routes with rate limiting
  router.post('/auth/token', strictAuthLimiter, (req, res) => authController.issueToken(req, res));

  // Route group protection
  router.use('/nodes', apiLimiter, authenticateJwt, authorizeRoles('operator', 'admin'));
  router.use('/hosts', apiLimiter, authenticateJwt, authorizeRoles('operator', 'admin'));
  router.use('/capabilities', apiLimiter, authenticateJwt, authorizeRoles('operator', 'admin'));
  router.use('/admin', apiLimiter, authenticateJwt, authorizeRoles('admin'));

  // Node API routes (protected)
  router.get('/nodes', (req, res) => nodesController.listNodes(req, res));
  router.get('/nodes/:id', (req, res) => nodesController.getNode(req, res));
  router.get('/nodes/:id/health', (req, res) => nodesController.getNodeHealth(req, res));

  // Host API routes
  // IMPORTANT: mac-vendor must be registered before the :fqn catch-all
  router.get('/hosts/mac-vendor/:mac', (req, res) =>
    hostsController.getMacVendor(req, res),
  );
  router.get('/hosts', (req, res) => hostsController.getHosts(req, res));
  router.get('/hosts/:fqn', (req, res) => hostsController.getHostByFQN(req, res));
  router.post('/hosts/wakeup/:fqn', (req, res) => hostsController.wakeupHost(req, res));
  router.put('/hosts/:fqn', (req, res) => hostsController.updateHost(req, res));
  router.delete('/hosts/:fqn', (req, res) => hostsController.deleteHost(req, res));
  router.get('/capabilities', (req, res) => capabilitiesController.getCapabilities(req, res));

  // Admin API routes
  router.delete('/admin/nodes/:id', (req, res) => adminController.deleteNode(req, res));
  router.get('/admin/stats', (req, res) => adminController.getStats(req, res));
  router.get('/admin/commands', (req, res) => adminController.listCommands(req, res));

  // Health check endpoint
  router.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      metrics: runtimeMetrics.snapshot(),
    });
  });

  return router;
}

export default createRoutes;
