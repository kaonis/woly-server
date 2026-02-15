import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from '@kaonis/woly-protocol';
import { config } from './config';
import { agentConfig } from './config/agent';
import { logger } from './utils/logger';
import { AppError, errorHandler, notFoundHandler } from './middleware/errorHandler';
import { specs } from './swagger';
import HostDatabase from './services/hostDatabase';
import ScanOrchestrator from './services/scanOrchestrator';
import * as hostsController from './controllers/hosts';
import hosts from './routes/hosts';
import { agentService } from './services/agentService';
import { evaluateCorsOrigin } from './utils/corsOrigin';
import { healthLimiter } from './middleware/rateLimiter';
import { NODE_AGENT_VERSION } from './utils/nodeAgentVersion';
import { runtimeTelemetry } from './services/runtimeTelemetry';

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      const decision = evaluateCorsOrigin(origin, config.cors.origins, {
        allowHostedDevOrigins: config.server.env !== 'production',
      });

      if (decision !== 'rejected') {
        if (decision === 'no-origin') {
          logger.debug('CORS: Allowed request with no origin header');
        } else if (decision === 'config') {
          logger.debug(`CORS: Allowed origin from config: ${origin}`);
        } else if (decision === 'ngrok') {
          logger.debug(`CORS: Allowed ngrok origin: ${origin}`);
        } else if (decision === 'netlify') {
          logger.debug(`CORS: Allowed Netlify origin: ${origin}`);
        } else if (decision === 'helios') {
          logger.debug(`CORS: Allowed helios.kaonis.com origin: ${origin}`);
        }
        return callback(null, true);
      }

      logger.warn(`CORS: Rejected origin: ${origin}`);
      return callback(
        new AppError(`Origin ${origin} is not allowed by CORS policy`, 403, 'FORBIDDEN')
      );
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json({ limit: '100kb' }));

// Initialize database
const hostDb = new HostDatabase(config.database.path);
const scanOrchestrator = new ScanOrchestrator(hostDb);

function getAgentAuthMode(): 'standalone' | 'static-token' | 'session-token' {
  if (agentConfig.mode !== 'agent') {
    return 'standalone';
  }

  return agentConfig.sessionTokenUrl ? 'session-token' : 'static-token';
}

function logStartupDiagnostics(): void {
  logger.info('Node agent startup diagnostics', {
    buildVersion: NODE_AGENT_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
    mode: agentConfig.mode,
    authMode: getAgentAuthMode(),
    wsQueryTokenFallbackEnabled: agentConfig.wsAllowQueryTokenFallback,
    nodeId: agentConfig.nodeId || undefined,
    location: agentConfig.location || undefined,
    environment: config.server.env,
    nodeRuntime: process.version,
    platform: process.platform,
  });
}

// Initialize and start the server
async function startServer() {
  try {
    runtimeTelemetry.reset();
    logStartupDiagnostics();

    // Initialize database (create tables, seed data)
    await hostDb.initialize();

    // Pass database instance to controller
    hostsController.setHostDatabase(hostDb);
    hostsController.setScanOrchestrator(scanOrchestrator);

    // Initialize agent service if in agent mode
    if (agentConfig.mode === 'agent') {
      logger.info('Starting in AGENT mode', {
        nodeId: agentConfig.nodeId,
        location: agentConfig.location,
        cncUrl: agentConfig.cncUrl,
      });

      // Pass database instance to agent service
      agentService.setHostDatabase(hostDb);
      agentService.setScanOrchestrator(scanOrchestrator);

      // Start agent service (connects to C&C)
      await agentService.start();
    } else {
      logger.info('Starting in STANDALONE mode');
    }

    if (config.server.env === 'production' && config.cors.origins.length === 0) {
      logger.warn('CORS_ORIGINS is not configured in production; browser origins are denied by default');
    }

    // Start periodic network scanning
    // Initial scan runs in background after configured delay for faster API availability
    scanOrchestrator.startPeriodicSync(config.network.scanInterval, false);

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
    app.get('/health', healthLimiter, async (_req: Request, res: Response) => {
      const health = {
        uptime: process.uptime(),
        timestamp: Date.now(),
        status: 'ok',
        environment: config.server.env,
        build: {
          version: NODE_AGENT_VERSION,
          protocolVersion: PROTOCOL_VERSION,
        },
        agent: {
          mode: agentConfig.mode,
          authMode: getAgentAuthMode(),
          connected: agentConfig.mode === 'agent' ? agentService.isActive() : false,
        },
        checks: {
          database: 'unknown',
          networkScan: 'unknown',
        },
        telemetry: runtimeTelemetry.snapshot(),
      };

      try {
        await hostDb.getAllHosts();
        health.checks.database = 'healthy';
      } catch (_error) {
        health.checks.database = 'unhealthy';
        health.status = 'degraded';
      }

      health.checks.networkScan = scanOrchestrator.isScanInProgress() ? 'running' : 'idle';

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
        scanOrchestrator.stopPeriodicSync();
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
        scanOrchestrator.stopPeriodicSync();
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
