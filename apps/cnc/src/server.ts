/**
 * Main Express server with WebSocket support
 */

import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import config from './config';
import logger from './utils/logger';
import db from './database/connection';
import { NodeManager } from './services/nodeManager';
import { HostAggregator } from './services/hostAggregator';
import { CommandRouter } from './services/commandRouter';
import { createRoutes } from './routes';
import { createWebSocketServer } from './websocket/server';
import { errorHandler } from './middleware/errorHandler';
import { reconcileCommandsOnStartup, startCommandPruning, stopCommandPruning } from './services/commandReconciler';
import { specs } from './swagger';
import { runtimeMetrics } from './services/runtimeMetrics';
import { CNC_VERSION } from './utils/cncVersion';

function isAllowedCorsOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes('*')) return true;
  return allowedOrigins.includes(origin);
}

class Server {
  private app: express.Application;
  private httpServer: ReturnType<typeof createServer>;
  private hostAggregator: HostAggregator;
  private nodeManager: NodeManager;
  private commandRouter: CommandRouter;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.hostAggregator = new HostAggregator();
    this.nodeManager = new NodeManager(this.hostAggregator);
    this.commandRouter = new CommandRouter(this.nodeManager, this.hostAggregator);
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security
    this.app.use(helmet());
    this.app.use(cors({
      origin: config.nodeEnv === 'production'
        ? (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
            // Allow requests with no origin (mobile apps, curl, server-to-server)
            if (!origin) return callback(null, true);
            const allowed = isAllowedCorsOrigin(origin, config.corsOrigins);
            if (!allowed) {
              logger.warn('Blocked by CORS policy', { origin });
            }
            callback(null, allowed);
          }
        : '*',
      credentials: true,
      optionsSuccessStatus: 204,
    }));

    // Body parsing
    this.app.use(express.json({ limit: '100kb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '100kb' }));

    // Request logging
    this.app.use((req, _res, next) => {
      logger.debug('Incoming request', {
        correlationId: req.correlationId,
        method: req.method,
        path: req.path,
        query: req.query,
      });
      next();
    });
  }

  private setupRoutes(): void {
    // API Documentation
    this.app.use(
      '/api-docs',
      swaggerUi.serve,
      swaggerUi.setup(specs, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'WoLy C&C API Documentation',
      })
    );

    /**
     * @swagger
     * /health:
     *   get:
     *     summary: Health check endpoint
     *     description: Returns the current health status of the C&C service
     *     tags: [Health]
     *     responses:
     *       200:
     *         description: Service is healthy
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/HealthCheck'
     */
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: CNC_VERSION,
        metrics: runtimeMetrics.snapshot(),
      });
    });

    /**
     * @swagger
     * /:
     *   get:
     *     summary: Root endpoint
     *     description: Returns basic information about the C&C service
     *     tags: [Health]
     *     responses:
     *       200:
     *         description: Service information
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 name:
     *                   type: string
     *                   example: WoLy C&C Backend
     *                 version:
     *                   type: string
     *                   example: '1.0.0'
     *                 status:
     *                   type: string
     *                   example: running
     */
    this.app.get('/', (_req, res) => {
      res.json({
        name: 'WoLy C&C Backend',
        version: CNC_VERSION,
        status: 'running',
      });
    });

    // Mount API routes
    this.app.use('/api', createRoutes(this.nodeManager, this.hostAggregator, this.commandRouter));

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`,
      });
    });
  }

  private setupWebSocket(): void {
    createWebSocketServer(this.httpServer, this.nodeManager);
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  async start(): Promise<void> {
    try {
      runtimeMetrics.reset();

      // Connect to database
      await db.connect();
      logger.info('Database connected');

      // Reconcile durable command state after restarts.
      await reconcileCommandsOnStartup({ commandTimeoutMs: config.commandTimeout });

      // Start periodic command pruning
      startCommandPruning(config.commandRetentionDays);

      // Start HTTP server
      this.httpServer.listen(config.port, () => {
        logger.info(`Server listening on port ${config.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`WebSocket endpoint: ws://localhost:${config.port}/ws/node`);
      });

      // Graceful shutdown
      this.setupGracefulShutdown();
    } catch (error) {
      logger.error('Failed to start server', { error });
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown`);

      // Close HTTP server
      this.httpServer.close(() => {
        logger.info('HTTP server closed');
      });

      // Stop command pruning
      stopCommandPruning();

      // Shutdown node manager
      this.nodeManager.shutdown();

      // Close database
      await db.close();

      logger.info('Graceful shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

// Start server
const server = new Server();
server.start();

export default server;
