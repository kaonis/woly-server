import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { agentConfig } from './config/agent';
import { logger } from './utils/logger';
import { AppError, errorHandler, notFoundHandler } from './middleware/errorHandler';
import { specs } from './swagger';
import HostDatabase from './services/hostDatabase';
import * as hostsController from './controllers/hosts';
import hosts from './routes/hosts';
import { agentService } from './services/agentService';

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);

      // Check if origin is in allowed list
      if (config.cors.origins.includes(origin)) {
        logger.debug(`CORS: Allowed origin from config: ${origin}`);
        return callback(null, true);
      }

      // Allow all ngrok URLs
      if (origin.match(/^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/i)) {
        logger.debug(`CORS: Allowed ngrok origin: ${origin}`);
        return callback(null, true);
      }

      // Allow all Netlify URLs
      if (origin.match(/^https:\/\/[a-z0-9-]+\.netlify\.app$/i)) {
        logger.debug(`CORS: Allowed Netlify origin: ${origin}`);
        return callback(null, true);
      }

      // Allow helios.kaonis.com with any protocol
      if (origin.match(/^https?:\/\/(.*\.)?helios\.kaonis\.com$/i)) {
        logger.debug(`CORS: Allowed helios.kaonis.com origin: ${origin}`);
        return callback(null, true);
      }

      logger.warn(`CORS: Rejected origin: ${origin}`);
      const error = new AppError(
        `Origin ${origin} is not allowed by CORS policy`,
        403,
        'FORBIDDEN'
      );
      callback(error);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json());

// Initialize database
const hostDb = new HostDatabase(config.database.path);

// Initialize and start the server
async function startServer() {
  try {
    // Initialize database (create tables, seed data)
    await hostDb.initialize();

    // Pass database instance to controller
    hostsController.setHostDatabase(hostDb);

    // Initialize agent service if in agent mode
    if (agentConfig.mode === 'agent') {
      logger.info('Starting in AGENT mode', {
        nodeId: agentConfig.nodeId,
        location: agentConfig.location,
        cncUrl: agentConfig.cncUrl,
      });

      // Pass database instance to agent service
      agentService.setHostDatabase(hostDb);

      // Start agent service (connects to C&C)
      await agentService.start();
    } else {
      logger.info('Starting in STANDALONE mode');
    }

    // Start periodic network scanning
    // Initial scan runs in background after configured delay for faster API availability
    hostDb.startPeriodicSync(config.network.scanInterval, false);

    // API Documentation
    app.use(
      '/api-docs',
      swaggerUi.serve,
      swaggerUi.setup(specs, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'WoLy API Documentation',
      })
    );

    // Routes
    app.use('/hosts', hosts);

    /**
     * @swagger
     * /health:
     *   get:
     *     summary: Health check endpoint
     *     description: Returns the current health status of the WoLy backend service
     *     tags: [Health]
     *     responses:
     *       200:
     *         description: Service is healthy
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/HealthCheck'
     *       503:
     *         description: Service is degraded (database issues)
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/HealthCheck'
     */
    // Enhanced health check endpoint
    app.get('/health', async (_req: Request, res: Response) => {
      const health = {
        uptime: process.uptime(),
        timestamp: Date.now(),
        status: 'ok',
        environment: config.server.env,
        checks: {
          database: 'unknown',
          networkScan: 'unknown',
        },
      };

      try {
        await hostDb.getAllHosts();
        health.checks.database = 'healthy';
      } catch (error) {
        health.checks.database = 'unhealthy';
        health.status = 'degraded';
      }

      health.checks.networkScan = hostDb.isScanInProgress() ? 'running' : 'idle';

      res.status(health.status === 'ok' ? 200 : 503).json(health);
    });

    // 404 handler
    app.use(notFoundHandler);

    // Error handling middleware (must be last)
    app.use(errorHandler);

    // Start listening
    const server = app.listen(config.server.port, config.server.host, () => {
      const address = server.address();
      if (typeof address === 'string') {
        logger.info(`WoLy listening at ${address}`);
      } else if (address) {
        const { address: host, port } = address;
        logger.info(`WoLy listening at http://${host}:${port}`);
        logger.info(`Environment: ${config.server.env}`);
        logger.info(`CORS origins: ${config.cors.origins.join(', ')}`);
      }
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      try {
        // Stop agent service if running
        if (agentConfig.mode === 'agent') {
          agentService.stop();
        }
        await hostDb.close();
        logger.info('Database closed successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      try {
        // Stop agent service if running
        if (agentConfig.mode === 'agent') {
          agentService.stop();
        }
        await hostDb.close();
        logger.info('Database closed successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
