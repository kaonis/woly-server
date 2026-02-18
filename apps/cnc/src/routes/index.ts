/**
 * Express routes configuration
 */

import { Router } from 'express';
import { NodesController } from '../controllers/nodes';
import { AdminController } from '../controllers/admin';
import { HostsController } from '../controllers/hosts';
import { SchedulesController } from '../controllers/schedules';
import { AuthController } from '../controllers/auth';
import { MetaController } from '../controllers/meta';
import { WebhooksController } from '../controllers/webhooks';
import { NodeManager } from '../services/nodeManager';
import { HostAggregator } from '../services/hostAggregator';
import { CommandRouter } from '../services/commandRouter';
import type { HostStateStreamBroker } from '../services/hostStateStreamBroker';
import { runtimeMetrics } from '../services/runtimeMetrics';
import { authenticateJwt, authorizeRoles } from '../middleware/auth';
import { apiLimiter, scheduleSyncLimiter, strictAuthLimiter } from '../middleware/rateLimiter';
import { assignCorrelationId } from '../middleware/correlationId';
import { CNC_VERSION } from '../utils/cncVersion';
import { prometheusContentType, renderPrometheusMetrics } from '../services/promMetrics';

export function createRoutes(
  nodeManager: NodeManager,
  hostAggregator: HostAggregator,
  commandRouter: CommandRouter,
  hostStateStreamBroker?: HostStateStreamBroker,
): Router {
  const router = Router();
  router.use(assignCorrelationId);

  // Controllers
  const nodesController = new NodesController(nodeManager);
  const adminController = new AdminController(
    hostAggregator,
    nodeManager,
    commandRouter,
    hostStateStreamBroker,
  );
  const hostsController = new HostsController(hostAggregator, commandRouter);
  const schedulesController = new SchedulesController(hostAggregator);
  const authController = new AuthController();
  const metaController = new MetaController();
  const webhooksController = new WebhooksController();

  // Public API routes with rate limiting
  router.post('/auth/token', strictAuthLimiter, (req, res) => authController.issueToken(req, res));
  router.get('/capabilities', apiLimiter, authenticateJwt, authorizeRoles('operator', 'admin'), (req, res) =>
    metaController.getCapabilities(req, res),
  );

  // Route group protection
  router.use('/nodes', apiLimiter, authenticateJwt, authorizeRoles('operator', 'admin'));
  router.use('/hosts', apiLimiter, authenticateJwt, authorizeRoles('operator', 'admin'));
  router.use('/schedules', apiLimiter, authenticateJwt, authorizeRoles('operator', 'admin'));
  router.use('/webhooks', apiLimiter, authenticateJwt, authorizeRoles('operator', 'admin'));
  router.use('/admin', apiLimiter, authenticateJwt, authorizeRoles('admin'));

  // Node API routes (protected)
  router.get('/nodes', (req, res) => nodesController.listNodes(req, res));
  router.get('/nodes/:id', (req, res) => nodesController.getNode(req, res));
  router.get('/nodes/:id/health', (req, res) => nodesController.getNodeHealth(req, res));

  // Aggregated schedule API routes
  router.get('/schedules', scheduleSyncLimiter, (req, res) =>
    schedulesController.listSchedules(req, res),
  );
  router.get('/schedules/:id', scheduleSyncLimiter, (req, res) =>
    schedulesController.getSchedule(req, res),
  );
  router.put('/schedules/:id', scheduleSyncLimiter, (req, res) =>
    schedulesController.updateSchedule(req, res),
  );
  router.delete('/schedules/:id', scheduleSyncLimiter, (req, res) =>
    schedulesController.deleteSchedule(req, res),
  );

  // Webhook API routes
  router.get('/webhooks', (req, res) => webhooksController.listWebhooks(req, res));
  router.post('/webhooks', (req, res) => webhooksController.createWebhook(req, res));
  router.get('/webhooks/:id/deliveries', (req, res) => webhooksController.getWebhookDeliveries(req, res));
  router.delete('/webhooks/:id', (req, res) => webhooksController.deleteWebhook(req, res));

  // Host API routes
  // IMPORTANT: mac-vendor must be registered before the :fqn catch-all
  router.get('/hosts/mac-vendor/:mac', (req, res) =>
    hostsController.getMacVendor(req, res),
  );
  // IMPORTANT: ping/ports/scan-ports must be registered before the :fqn catch-all
  router.get('/hosts/ping/:fqn', (req, res) => hostsController.pingHost(req, res));
  router.get('/hosts/ports/:fqn', (req, res) => hostsController.getHostPorts(req, res));
  router.get('/hosts/scan-ports/:fqn', (req, res) => hostsController.scanHostPorts(req, res));
  router.post('/hosts/scan', (req, res) => hostsController.scanHosts(req, res));
  router.get('/hosts/merge-candidates', (req, res) => hostsController.getMergeCandidates(req, res));
  router.put('/hosts/:fqn/merge-mac', (req, res) => hostsController.mergeHostMac(req, res));
  router.delete('/hosts/:fqn/merge-mac/:mac', (req, res) => hostsController.unmergeHostMac(req, res));
  // IMPORTANT: schedule routes must be registered before the :fqn catch-all
  router.get('/hosts/:fqn/schedules', scheduleSyncLimiter, (req, res) =>
    schedulesController.listHostSchedules(req, res),
  );
  router.post('/hosts/:fqn/schedules', scheduleSyncLimiter, (req, res) =>
    schedulesController.createHostSchedule(req, res),
  );
  router.put('/hosts/schedules/:id', scheduleSyncLimiter, (req, res) =>
    schedulesController.updateSchedule(req, res),
  );
  router.delete('/hosts/schedules/:id', scheduleSyncLimiter, (req, res) =>
    schedulesController.deleteSchedule(req, res),
  );
  router.get('/hosts', (req, res) => hostsController.getHosts(req, res));
  // IMPORTANT: history/uptime must be registered before the :fqn catch-all
  router.get('/hosts/:fqn/history', (req, res) => hostsController.getHostHistory(req, res));
  router.get('/hosts/:fqn/uptime', (req, res) => hostsController.getHostUptime(req, res));
  router.get('/hosts/:fqn', (req, res) => hostsController.getHostByFQN(req, res));
  router.post('/hosts/wakeup/:fqn', (req, res) => hostsController.wakeupHost(req, res));
  router.post('/hosts/:fqn/sleep', (req, res) => hostsController.sleepHost(req, res));
  router.post('/hosts/:fqn/shutdown', (req, res) => hostsController.shutdownHost(req, res));
  router.put('/hosts/:fqn', (req, res) => hostsController.updateHost(req, res));
  router.delete('/hosts/:fqn', (req, res) => hostsController.deleteHost(req, res));

  // Admin API routes
  router.delete('/admin/nodes/:id', (req, res) => adminController.deleteNode(req, res));
  router.get('/admin/stats', (req, res) => adminController.getStats(req, res));
  router.get('/admin/commands', (req, res) => adminController.listCommands(req, res));

  // Health check endpoint
  router.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: CNC_VERSION,
      metrics: runtimeMetrics.snapshot(),
    });
  });

  router.get('/metrics', async (_req, res) => {
    const metrics = await renderPrometheusMetrics(runtimeMetrics.snapshot());
    res.setHeader('Content-Type', prometheusContentType());
    res.status(200).send(metrics);
  });

  return router;
}

export default createRoutes;
