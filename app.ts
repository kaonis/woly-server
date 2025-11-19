import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { specs } from './swagger';
import HostDatabase from './services/hostDatabase';
import * as hostsController from './controllers/hosts';
import hosts from './routes/hosts';

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: config.cors.origins,
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
    app.get('/health', async (req: Request, res: Response) => {
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
