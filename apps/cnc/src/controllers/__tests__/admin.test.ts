import type { Request, Response } from 'express';
import { AdminController } from '../admin';
import { NodeModel } from '../../models/Node';
import { CommandModel } from '../../models/Command';
import { runtimeMetrics } from '../../services/runtimeMetrics';

jest.mock('../../models/Node', () => ({
  NodeModel: {
    delete: jest.fn(),
    getStatusCounts: jest.fn(),
  },
}));

jest.mock('../../models/Command', () => ({
  CommandModel: {
    listRecent: jest.fn(),
  },
}));

jest.mock('../../services/runtimeMetrics', () => ({
  runtimeMetrics: {
    snapshot: jest.fn(),
  },
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

import logger from '../../utils/logger';

const mockedNodeModel = NodeModel as jest.Mocked<typeof NodeModel>;
const mockedCommandModel = CommandModel as jest.Mocked<typeof CommandModel>;
const mockedRuntimeMetrics = runtimeMetrics as jest.Mocked<typeof runtimeMetrics>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('AdminController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRuntimeMetrics.snapshot.mockReturnValue({
      nodes: { connected: 0, peak: 0 },
      protocol: { invalidPayloadTotal: 0, invalidPayloadByKey: {} },
      commands: {
        dispatchedTotal: 0,
        timedOutTotal: 0,
        successTotal: 0,
        failureTotal: 0,
        timeoutRate: 0,
        avgLatencyMs: 0,
      },
      timestamp: new Date().toISOString(),
    } as unknown as never);
  });

  describe('deleteNode', () => {
    it('returns success when node is deleted', async () => {
      const hostAggregator = { getStats: jest.fn() };
      const controller = new AdminController(hostAggregator as unknown as never);
      mockedNodeModel.delete.mockResolvedValue(true);

      const req = { params: { id: 'node-1' } } as unknown as Request;
      const res = createMockResponse();

      await controller.deleteNode(req, res);

      expect(mockedNodeModel.delete).toHaveBeenCalledWith('node-1');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Node node-1 deleted successfully',
      });
    });

    it('returns 404 when node does not exist', async () => {
      const hostAggregator = { getStats: jest.fn() };
      const controller = new AdminController(hostAggregator as unknown as never);
      mockedNodeModel.delete.mockResolvedValue(false);

      const req = { params: { id: 'missing-node' } } as unknown as Request;
      const res = createMockResponse();

      await controller.deleteNode(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Node missing-node not found',
      });
    });

    it('returns 500 when delete throws', async () => {
      const hostAggregator = { getStats: jest.fn() };
      const controller = new AdminController(hostAggregator as unknown as never);
      const error = new Error('delete failed');
      mockedNodeModel.delete.mockRejectedValue(error);

      const req = { params: { id: 'node-err' } } as unknown as Request;
      const res = createMockResponse();

      await controller.deleteNode(req, res);

      expect(mockedLogger.error).toHaveBeenCalledWith('Failed to delete node', {
        error,
        nodeId: 'node-err',
      });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to delete node',
      });
    });
  });

  describe('getStats', () => {
    it('returns full stats when nodeManager and commandRouter are provided', async () => {
      const hostAggregator = {
        getStats: jest.fn().mockResolvedValue({
          total: 3,
          awake: 2,
          asleep: 1,
          byLocation: { lab: { total: 3, awake: 2 } },
        }),
      };
      const nodeManager = {
        getConnectedNodes: jest.fn().mockReturnValue(['a', 'b']),
        getProtocolValidationStats: jest
          .fn()
          .mockReturnValue({ total: 7, byKey: { 'inbound.register': 7 } }),
      };
      const commandRouter = {
        getStats: jest.fn().mockReturnValue({ pendingCommands: 4 }),
      };

      mockedNodeModel.getStatusCounts.mockResolvedValue({ online: 2, offline: 1 });

      const controller = new AdminController(
        hostAggregator as unknown as never,
        nodeManager as unknown as never,
        commandRouter as unknown as never
      );
      const req = {} as Request;
      const res = createMockResponse();

      await controller.getStats(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: { online: 2, offline: 1 },
          hosts: expect.objectContaining({ total: 3 }),
          websocket: expect.objectContaining({
            connectedNodes: 2,
            protocolValidationFailures: { total: 7, byKey: { 'inbound.register': 7 } },
          }),
          commandRouter: { pendingCommands: 4 },
          observability: expect.any(Object),
          timestamp: expect.any(String),
        })
      );
    });

    it('returns stats without websocket/commandRouter when optional dependencies are missing', async () => {
      const hostAggregator = {
        getStats: jest.fn().mockResolvedValue({
          total: 0,
          awake: 0,
          asleep: 0,
          byLocation: {},
        }),
      };
      mockedNodeModel.getStatusCounts.mockResolvedValue({ online: 0, offline: 0 });

      const controller = new AdminController(hostAggregator as unknown as never);
      const req = {} as Request;
      const res = createMockResponse();

      await controller.getStats(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          websocket: undefined,
          commandRouter: undefined,
        })
      );
    });

    it('includes mobile host-state stream telemetry when broker is provided', async () => {
      const hostAggregator = {
        getStats: jest.fn().mockResolvedValue({
          total: 1,
          awake: 1,
          asleep: 0,
          byLocation: {},
        }),
      };
      const nodeManager = {
        getConnectedNodes: jest.fn().mockReturnValue(['node-1']),
        getProtocolValidationStats: jest.fn().mockReturnValue({ total: 0, byKey: {} }),
      };
      const hostStateStreamBroker = {
        getStats: jest.fn().mockReturnValue({
          activeClients: 1,
          totalConnections: 4,
          totalDisconnects: 3,
          totalErrors: 0,
          closeCodes: { '1000': 3 },
          closeReasons: { none: 3 },
          events: {
            totalBroadcasts: 12,
            byType: { 'host.updated': 9 },
            deliveries: 9,
            droppedNoSubscribers: 0,
            sendFailures: 0,
          },
        }),
      };
      mockedNodeModel.getStatusCounts.mockResolvedValue({ online: 1, offline: 0 });

      const controller = new AdminController(
        hostAggregator as unknown as never,
        nodeManager as unknown as never,
        undefined,
        hostStateStreamBroker as unknown as never,
      );
      const req = {} as Request;
      const res = createMockResponse();

      await controller.getStats(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          websocket: expect.objectContaining({
            connectedNodes: 1,
            mobileHostStateStream: expect.objectContaining({
              activeClients: 1,
              totalConnections: 4,
            }),
          }),
        }),
      );
    });

    it('returns 500 when stats lookup fails', async () => {
      const hostAggregator = {
        getStats: jest.fn(),
      };
      const error = new Error('stats failed');
      mockedNodeModel.getStatusCounts.mockRejectedValue(error);

      const controller = new AdminController(hostAggregator as unknown as never);
      const req = {} as Request;
      const res = createMockResponse();

      await controller.getStats(req, res);

      expect(mockedLogger.error).toHaveBeenCalledWith('Failed to get stats', { error });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to retrieve statistics',
      });
    });
  });

  describe('listCommands', () => {
    it('parses and clamps query params before listing commands', async () => {
      const hostAggregator = { getStats: jest.fn() };
      const controller = new AdminController(hostAggregator as unknown as never);
      mockedCommandModel.listRecent.mockResolvedValue([]);

      const req = {
        query: {
          limit: '999',
          nodeId: ' node-9 ',
        },
      } as unknown as Request;
      const res = createMockResponse();

      await controller.listCommands(req, res);

      expect(mockedCommandModel.listRecent).toHaveBeenCalledWith({
        limit: 200,
        nodeId: 'node-9',
      });
      expect(res.json).toHaveBeenCalledWith({ commands: [] });
    });

    it('uses default/clamped limits for invalid or low query values', async () => {
      const hostAggregator = { getStats: jest.fn() };
      const controller = new AdminController(hostAggregator as unknown as never);
      mockedCommandModel.listRecent.mockResolvedValue([]);

      const reqInvalid = {
        query: { limit: 'invalid', nodeId: '   ' },
      } as unknown as Request;
      const resInvalid = createMockResponse();
      await controller.listCommands(reqInvalid, resInvalid);
      expect(mockedCommandModel.listRecent).toHaveBeenLastCalledWith({
        limit: 50,
        nodeId: null,
      });

      const reqLow = {
        query: { limit: '0' },
      } as unknown as Request;
      const resLow = createMockResponse();
      await controller.listCommands(reqLow, resLow);
      expect(mockedCommandModel.listRecent).toHaveBeenLastCalledWith({
        limit: 1,
        nodeId: null,
      });
    });

    it('returns 500 when command query fails', async () => {
      const hostAggregator = { getStats: jest.fn() };
      const controller = new AdminController(hostAggregator as unknown as never);
      const error = new Error('query failed');
      mockedCommandModel.listRecent.mockRejectedValue(error);

      const req = { query: {} } as unknown as Request;
      const res = createMockResponse();

      await controller.listCommands(req, res);

      expect(mockedLogger.error).toHaveBeenCalledWith('Failed to list commands', { error });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to list commands',
      });
    });
  });
});
