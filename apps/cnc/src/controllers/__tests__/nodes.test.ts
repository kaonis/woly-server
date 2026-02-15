import type { Request, Response } from 'express';
import type { Node } from '../../types';
import { NodesController } from '../nodes';
import { NodeModel } from '../../models/Node';

jest.mock('../../models/Node', () => ({
  NodeModel: {
    findAll: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
  },
}));

import logger from '../../utils/logger';

const mockedNodeModel = NodeModel as jest.Mocked<typeof NodeModel>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function createNode(overrides: Partial<Node> = {}): Node {
  const now = new Date('2026-02-15T10:00:00.000Z');
  return {
    id: 'node-1',
    name: 'Primary Node',
    location: 'Lab',
    status: 'online',
    lastHeartbeat: now,
    capabilities: [],
    metadata: {
      version: '1.0.0',
      platform: 'linux',
      protocolVersion: '1.0.0',
      networkInfo: {
        subnet: '10.0.0.0/24',
        gateway: '10.0.0.1',
      },
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('NodesController', () => {
  let isNodeConnected: jest.Mock<boolean, [string]>;
  let controller: NodesController;

  beforeEach(() => {
    jest.clearAllMocks();
    isNodeConnected = jest.fn<boolean, [string]>();
    controller = new NodesController({ isNodeConnected } as unknown as never);
  });

  describe('listNodes', () => {
    it('returns nodes with live connection status', async () => {
      mockedNodeModel.findAll.mockResolvedValue([
        createNode({ id: 'node-1', name: 'Node 1' }),
        createNode({ id: 'node-2', name: 'Node 2', status: 'offline' }),
      ]);
      isNodeConnected.mockImplementation((id) => id === 'node-1');

      const req = {} as Request;
      const res = createMockResponse();

      await controller.listNodes(req, res);

      expect(res.json).toHaveBeenCalledWith({
        nodes: [
          expect.objectContaining({ id: 'node-1', connected: true }),
          expect.objectContaining({ id: 'node-2', connected: false }),
        ],
      });
    });

    it('returns 500 when NodeModel.findAll throws', async () => {
      const error = new Error('db unavailable');
      mockedNodeModel.findAll.mockRejectedValue(error);

      const req = {} as Request;
      const res = createMockResponse();

      await controller.listNodes(req, res);

      expect(mockedLogger.error).toHaveBeenCalledWith('Failed to list nodes', { error });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to retrieve nodes',
      });
    });
  });

  describe('getNode', () => {
    it('returns 404 when node is missing', async () => {
      mockedNodeModel.findById.mockResolvedValue(null);
      const req = { params: { id: 'missing-node' } } as unknown as Request;
      const res = createMockResponse();

      await controller.getNode(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Node missing-node not found',
      });
    });

    it('returns node with connected flag', async () => {
      mockedNodeModel.findById.mockResolvedValue(createNode({ id: 'node-77' }));
      isNodeConnected.mockReturnValue(true);

      const req = { params: { id: 'node-77' } } as unknown as Request;
      const res = createMockResponse();

      await controller.getNode(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'node-77',
          connected: true,
        })
      );
    });

    it('returns 500 when NodeModel.findById fails', async () => {
      const error = new Error('query failed');
      mockedNodeModel.findById.mockRejectedValue(error);

      const req = { params: { id: 'node-x' } } as unknown as Request;
      const res = createMockResponse();

      await controller.getNode(req, res);

      expect(mockedLogger.error).toHaveBeenCalledWith('Failed to get node', {
        error,
        nodeId: 'node-x',
      });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to retrieve node',
      });
    });
  });

  describe('getNodeHealth', () => {
    it('returns 404 when node is missing', async () => {
      mockedNodeModel.findById.mockResolvedValue(null);

      const req = { params: { id: 'missing-health' } } as unknown as Request;
      const res = createMockResponse();

      await controller.getNodeHealth(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Node missing-health not found',
      });
    });

    it('returns healthy=true when connected and online', async () => {
      const heartbeat = new Date('2026-02-15T10:00:00.000Z');
      mockedNodeModel.findById.mockResolvedValue(
        createNode({ id: 'healthy-node', status: 'online', lastHeartbeat: heartbeat })
      );
      isNodeConnected.mockReturnValue(true);
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-02-15T10:00:05.000Z').getTime());

      const req = { params: { id: 'healthy-node' } } as unknown as Request;
      const res = createMockResponse();

      await controller.getNodeHealth(req, res);

      expect(res.json).toHaveBeenCalledWith({
        nodeId: 'healthy-node',
        status: 'online',
        connected: true,
        lastHeartbeat: heartbeat,
        timeSinceHeartbeat: 5000,
        healthy: true,
      });
    });

    it('returns healthy=false for disconnected/offline combinations', async () => {
      const heartbeat = new Date('2026-02-15T10:00:00.000Z');
      mockedNodeModel.findById.mockResolvedValue(
        createNode({ id: 'unhealthy-node', status: 'offline', lastHeartbeat: heartbeat })
      );
      isNodeConnected.mockReturnValue(false);
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-02-15T10:00:02.000Z').getTime());

      const req = { params: { id: 'unhealthy-node' } } as unknown as Request;
      const res = createMockResponse();

      await controller.getNodeHealth(req, res);

      expect(res.json).toHaveBeenCalledWith({
        nodeId: 'unhealthy-node',
        status: 'offline',
        connected: false,
        lastHeartbeat: heartbeat,
        timeSinceHeartbeat: 2000,
        healthy: false,
      });
    });

    it('returns 500 when health lookup fails', async () => {
      const error = new Error('lookup failed');
      mockedNodeModel.findById.mockRejectedValue(error);

      const req = { params: { id: 'health-error-node' } } as unknown as Request;
      const res = createMockResponse();

      await controller.getNodeHealth(req, res);

      expect(mockedLogger.error).toHaveBeenCalledWith('Failed to get node health', {
        error,
        nodeId: 'health-error-node',
      });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to check node health',
      });
    });
  });
});
