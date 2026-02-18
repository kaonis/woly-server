import request from 'supertest';

jest.mock('../config', () => ({
  __esModule: true,
  default: {
    port: 8080,
    nodeEnv: 'test',
    trustProxy: false,
    corsOrigins: ['http://allowed.local'],
    commandTimeout: 30000,
    commandRetentionDays: 30,
    hostStatusHistoryRetentionDays: 30,
    scheduleWorkerEnabled: true,
    schedulePollIntervalMs: 1000,
    scheduleBatchSize: 10,
  },
}));

jest.mock('../database/connection', () => ({
  __esModule: true,
  default: {
    connect: jest.fn(),
    close: jest.fn(),
  },
}));

jest.mock('../services/nodeManager', () => ({
  NodeManager: jest.fn().mockImplementation(() => ({
    shutdown: jest.fn(),
  })),
}));

jest.mock('../services/hostAggregator', () => ({
  HostAggregator: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../services/commandRouter', () => ({
  CommandRouter: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../services/hostStateStreamBroker', () => ({
  HostStateStreamBroker: jest.fn().mockImplementation(() => ({
    subscribeToCommandRouter: jest.fn(),
    shutdown: jest.fn(),
  })),
}));

jest.mock('../routes', () => ({
  createRoutes: jest.fn(() => {
    const express = jest.requireActual('express') as typeof import('express');
    return express.Router();
  }),
}));

jest.mock('../websocket/server', () => ({
  createWebSocketServer: jest.fn(),
}));

jest.mock('../middleware/errorHandler', () => ({
  errorHandler: (_err: unknown, _req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Unhandled error',
    });
  },
}));

jest.mock('../services/commandReconciler', () => ({
  reconcileCommandsOnStartup: jest.fn(),
  startCommandPruning: jest.fn(),
  stopCommandPruning: jest.fn(),
}));

jest.mock('../services/hostStatusHistoryRetention', () => ({
  startHostStatusHistoryPruning: jest.fn(),
  stopHostStatusHistoryPruning: jest.fn(),
}));

jest.mock('../services/wakeScheduleWorker', () => ({
  startWakeScheduleWorker: jest.fn(),
  stopWakeScheduleWorker: jest.fn(),
}));

jest.mock('../services/webhookDispatcher', () => ({
  WebhookDispatcher: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    shutdown: jest.fn(),
  })),
}));

jest.mock('../services/runtimeMetrics', () => ({
  runtimeMetrics: {
    reset: jest.fn(),
    snapshot: jest.fn(() => ({ commands: { total: 0 } })),
  },
}));

jest.mock('../services/promMetrics', () => ({
  prometheusContentType: jest.fn(() => 'text/plain; version=0.0.4'),
  renderPrometheusMetrics: jest.fn(async () => 'woly_cnc_commands_total 0\n'),
}));

jest.mock('../utils/cncVersion', () => ({
  CNC_VERSION: '1.2.3-test',
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { runServerCli, Server, isAllowedCorsOrigin } from '../server';
import config from '../config';
import db from '../database/connection';
import logger from '../utils/logger';
import { createRoutes } from '../routes';
import { createWebSocketServer } from '../websocket/server';
import { runtimeMetrics } from '../services/runtimeMetrics';
import {
  reconcileCommandsOnStartup,
  startCommandPruning,
  stopCommandPruning,
} from '../services/commandReconciler';
import {
  startHostStatusHistoryPruning,
  stopHostStatusHistoryPruning,
} from '../services/hostStatusHistoryRetention';
import { startWakeScheduleWorker, stopWakeScheduleWorker } from '../services/wakeScheduleWorker';
import { WebhookDispatcher } from '../services/webhookDispatcher';
import { prometheusContentType, renderPrometheusMetrics } from '../services/promMetrics';

describe('server bootstrap and wiring', () => {
  const mockedDb = db as jest.Mocked<typeof db>;
  const mockedLogger = logger as jest.Mocked<typeof logger>;
  const mockedConfig = config as unknown as {
    nodeEnv: string;
    corsOrigins: string[];
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedConfig.nodeEnv = 'test';
    mockedConfig.corsOrigins = ['http://allowed.local'];
    mockedDb.connect.mockResolvedValue(undefined);
    mockedDb.close.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  it('evaluates allowed CORS origins correctly', () => {
    expect(isAllowedCorsOrigin('https://example.com', ['*'])).toBe(true);
    expect(isAllowedCorsOrigin('https://allowed.local', ['https://allowed.local'])).toBe(true);
    expect(isAllowedCorsOrigin('https://blocked.local', ['https://allowed.local'])).toBe(false);
  });

  it('applies production CORS policy for allowed, blocked, and missing origins', async () => {
    mockedConfig.nodeEnv = 'production';
    mockedConfig.corsOrigins = ['https://allowed.local'];
    const server = new Server();
    const app = (server as unknown as { app: Parameters<typeof request>[0] }).app;

    const noOriginResponse = await request(app).get('/health');
    expect(noOriginResponse.status).toBe(200);

    const allowedResponse = await request(app)
      .get('/health')
      .set('Origin', 'https://allowed.local');
    expect(allowedResponse.status).toBe(200);
    expect(allowedResponse.headers['access-control-allow-origin']).toBe('https://allowed.local');

    const blockedResponse = await request(app)
      .get('/health')
      .set('Origin', 'https://blocked.local');
    expect(blockedResponse.status).toBe(200);
    expect(blockedResponse.headers['access-control-allow-origin']).toBeUndefined();
    expect(mockedLogger.warn).toHaveBeenCalledWith('Blocked by CORS policy', {
      origin: 'https://blocked.local',
    });
  });

  it('registers health/root/metrics routes and uses injected dependencies', async () => {
    const server = new Server();
    const app = (server as unknown as { app: Parameters<typeof request>[0] }).app;

    const healthResponse = await request(app).get('/health');
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.body).toEqual(
      expect.objectContaining({
        status: 'healthy',
        version: '1.2.3-test',
      }),
    );
    expect(runtimeMetrics.snapshot).toHaveBeenCalled();

    const metricsResponse = await request(app).get('/metrics');
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.text).toContain('woly_cnc_commands_total');
    expect(prometheusContentType).toHaveBeenCalled();
    expect(renderPrometheusMetrics).toHaveBeenCalled();

    const rootResponse = await request(app).get('/');
    expect(rootResponse.status).toBe(200);
    expect(rootResponse.body).toEqual(
      expect.objectContaining({
        name: 'WoLy C&C Backend',
        version: '1.2.3-test',
        status: 'running',
      }),
    );

    const missingResponse = await request(app).get('/missing-route');
    expect(missingResponse.status).toBe(404);
    expect(missingResponse.body).toEqual({
      error: 'Not Found',
      message: 'Route GET /missing-route not found',
    });

    expect(createRoutes).toHaveBeenCalledTimes(1);
    expect(createWebSocketServer).toHaveBeenCalledTimes(1);
  });

  it('starts successfully and schedules reconciliation/pruning workers', async () => {
    const server = new Server();
    const httpServer = (server as unknown as { httpServer: { listen: (...args: unknown[]) => unknown } }).httpServer;
    const listenSpy = jest
      .spyOn(httpServer, 'listen')
      .mockImplementation(((port: number, callback?: () => void) => {
        if (callback) {
          callback();
        }
        return httpServer;
      }) as typeof httpServer.listen);
    const setupGracefulShutdownSpy = jest
      .spyOn(server as unknown as { setupGracefulShutdown: () => void }, 'setupGracefulShutdown')
      .mockImplementation(() => undefined);

    await server.start();

    expect(mockedDb.connect).toHaveBeenCalledTimes(1);
    expect(reconcileCommandsOnStartup).toHaveBeenCalledWith({ commandTimeoutMs: 30000 });
    expect(startCommandPruning).toHaveBeenCalledWith(30);
    expect(startHostStatusHistoryPruning).toHaveBeenCalledWith(
      expect.any(Object),
      30,
    );
    expect(startWakeScheduleWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        pollIntervalMs: 1000,
        batchSize: 10,
      }),
    );
    const dispatcherInstance = (WebhookDispatcher as jest.Mock).mock.results[0]?.value as {
      start: jest.Mock;
    };
    expect(dispatcherInstance.start).toHaveBeenCalledTimes(1);
    expect(listenSpy).toHaveBeenCalledWith(8080, expect.any(Function));
    expect(setupGracefulShutdownSpy).toHaveBeenCalledTimes(1);
  });

  it('logs and exits when startup fails', async () => {
    mockedDb.connect.mockRejectedValueOnce(new Error('connect failed'));
    const server = new Server();
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await server.start();

    expect(mockedLogger.error).toHaveBeenCalledWith(
      'Failed to start server',
      expect.objectContaining({
        error: expect.any(Error),
      }),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('handles graceful shutdown when SIGTERM is received', async () => {
    const server = new Server();
    const httpServer = (server as unknown as { httpServer: { close: (...args: unknown[]) => unknown } }).httpServer;
    const closeSpy = jest
      .spyOn(httpServer, 'close')
      .mockImplementation(((callback?: () => void) => {
        if (callback) {
          callback();
        }
        return httpServer;
      }) as typeof httpServer.close);
    const nodeManager = (server as unknown as { nodeManager: { shutdown: jest.Mock } }).nodeManager;
    const hostStateStreamBroker = (
      server as unknown as { hostStateStreamBroker: { shutdown: jest.Mock } }
    ).hostStateStreamBroker;
    const webhookDispatcher = (
      server as unknown as { webhookDispatcher: { shutdown: jest.Mock } }
    ).webhookDispatcher;
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    (server as unknown as { setupGracefulShutdown: () => void }).setupGracefulShutdown();
    process.emit('SIGTERM');
    await new Promise((resolve) => setImmediate(resolve));

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(stopCommandPruning).toHaveBeenCalledTimes(1);
    expect(stopHostStatusHistoryPruning).toHaveBeenCalledTimes(1);
    expect(stopWakeScheduleWorker).toHaveBeenCalledTimes(1);
    expect(nodeManager.shutdown).toHaveBeenCalledTimes(1);
    expect(hostStateStreamBroker.shutdown).toHaveBeenCalledTimes(1);
    expect(webhookDispatcher.shutdown).toHaveBeenCalledTimes(1);
    expect(mockedDb.close).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });

  it('runServerCli skips startup when module is not the process entrypoint', () => {
    const createServer = jest.fn();
    const result = runServerCli(
      { id: 'current-module' } as NodeModule,
      { id: 'main-module' } as NodeModule,
      createServer,
    );

    expect(result).toBeNull();
    expect(createServer).not.toHaveBeenCalled();
  });

  it('runServerCli default createServer path returns null when module is not the entrypoint', () => {
    const result = runServerCli(
      { id: 'current-module' } as NodeModule,
      { id: 'main-module' } as NodeModule,
    );

    expect(result).toBeNull();
  });

  it('runServerCli creates and starts server when module is the process entrypoint', () => {
    const start = jest.fn();
    const fakeServer = { start } as unknown as Server;
    const createServer = jest.fn(() => fakeServer);
    const entryModule = { id: 'entry' } as NodeModule;

    const result = runServerCli(entryModule, entryModule, createServer);

    expect(createServer).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(result).toBe(fakeServer);
  });
});
