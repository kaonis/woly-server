import type { Request, Response } from 'express';
import { HostsController } from '../hosts';

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function createMockResponse(): Response {
  const res = {} as Response;
  res.setHeader = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

function createMockRequest(options?: {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  correlationId?: string;
  headers?: Record<string, string | undefined>;
}): Request {
  const headers = options?.headers ?? {};
  return {
    params: options?.params ?? {},
    query: options?.query ?? {},
    body: options?.body ?? {},
    correlationId: options?.correlationId,
    header: jest.fn((name: string) => headers[name] ?? headers[name.toLowerCase()]),
  } as unknown as Request;
}

describe('HostsController additional branches', () => {
  let hostAggregator: {
    getHostsByNode: jest.Mock;
    getAllHosts: jest.Mock;
    getStats: jest.Mock;
    getHostByFQN: jest.Mock;
    saveHostPortScanSnapshot: jest.Mock;
  };
  let commandRouter: {
    routeWakeCommand: jest.Mock;
    routePingHostCommand: jest.Mock;
    routeScanHostPortsCommand: jest.Mock;
    routeUpdateHostCommand: jest.Mock;
    routeDeleteHostCommand: jest.Mock;
  };
  let controller: HostsController;

  beforeEach(() => {
    jest.clearAllMocks();
    hostAggregator = {
      getHostsByNode: jest.fn(),
      getAllHosts: jest.fn(),
      getStats: jest.fn(),
      getHostByFQN: jest.fn(),
      saveHostPortScanSnapshot: jest.fn().mockResolvedValue(true),
    };
    commandRouter = {
      routeWakeCommand: jest.fn(),
      routePingHostCommand: jest.fn(),
      routeScanHostPortsCommand: jest.fn(),
      routeUpdateHostCommand: jest.fn(),
      routeDeleteHostCommand: jest.fn(),
    };
    controller = new HostsController(
      hostAggregator as unknown as never,
      commandRouter as unknown as never
    );
  });

  describe('getHosts', () => {
    it('returns node-filtered hosts when nodeId query is a string', async () => {
      hostAggregator.getHostsByNode.mockResolvedValue([{ name: 'host-a' }]);
      hostAggregator.getStats.mockResolvedValue({ total: 1, awake: 1, asleep: 0, byLocation: {} });

      const req = createMockRequest({ query: { nodeId: 'node-1' } });
      const res = createMockResponse();

      await controller.getHosts(req, res);

      expect(hostAggregator.getHostsByNode).toHaveBeenCalledWith('node-1');
      expect(hostAggregator.getAllHosts).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        hosts: [{ name: 'host-a' }],
        stats: { total: 1, awake: 1, asleep: 0, byLocation: {} },
      });
    });

    it('returns all hosts when nodeId query is not a string', async () => {
      hostAggregator.getAllHosts.mockResolvedValue([{ name: 'host-b' }]);
      hostAggregator.getStats.mockResolvedValue({ total: 1, awake: 0, asleep: 1, byLocation: {} });

      const req = createMockRequest({ query: { nodeId: ['node-1'] } });
      const res = createMockResponse();

      await controller.getHosts(req, res);

      expect(hostAggregator.getAllHosts).toHaveBeenCalled();
      expect(hostAggregator.getHostsByNode).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        hosts: [{ name: 'host-b' }],
        stats: { total: 1, awake: 0, asleep: 1, byLocation: {} },
      });
    });

    it('returns 500 when host retrieval fails', async () => {
      hostAggregator.getAllHosts.mockRejectedValue(new Error('hosts failed'));

      const req = createMockRequest();
      const res = createMockResponse();

      await controller.getHosts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to retrieve hosts',
      });
    });

    it('returns 304 when If-None-Match matches current hosts payload etag', async () => {
      hostAggregator.getAllHosts.mockResolvedValue([{ name: 'host-c' }]);
      hostAggregator.getStats.mockResolvedValue({ total: 1, awake: 1, asleep: 0, byLocation: {} });

      const initialReq = createMockRequest();
      const initialRes = createMockResponse();
      await controller.getHosts(initialReq, initialRes);

      const etagCall = (initialRes.setHeader as jest.Mock).mock.calls.find(
        (call) => call[0] === 'ETag',
      );
      expect(etagCall).toBeDefined();
      const etag = etagCall?.[1];

      const cachedReq = createMockRequest({ headers: { 'if-none-match': etag } });
      const cachedRes = createMockResponse();
      await controller.getHosts(cachedReq, cachedRes);

      expect(cachedRes.status).toHaveBeenCalledWith(304);
      expect(cachedRes.end).toHaveBeenCalled();
      expect(cachedRes.json).not.toHaveBeenCalled();
    });
  });

  describe('getHostByFQN', () => {
    it('returns 404 when host is not found', async () => {
      hostAggregator.getHostByFQN.mockResolvedValue(null);

      const req = createMockRequest({ params: { fqn: 'missing@lab' } });
      const res = createMockResponse();

      await controller.getHostByFQN(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Host missing@lab not found',
      });
    });

    it('returns host payload when found', async () => {
      hostAggregator.getHostByFQN.mockResolvedValue({ name: 'desktop', nodeId: 'node-1' });

      const req = createMockRequest({ params: { fqn: 'desktop@lab' } });
      const res = createMockResponse();

      await controller.getHostByFQN(req, res);

      expect(res.json).toHaveBeenCalledWith({ name: 'desktop', nodeId: 'node-1' });
    });

    it('returns 500 when lookup throws', async () => {
      hostAggregator.getHostByFQN.mockRejectedValue(new Error('lookup failed'));

      const req = createMockRequest({ params: { fqn: 'desktop@lab' } });
      const res = createMockResponse();

      await controller.getHostByFQN(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to retrieve host',
      });
    });
  });

  describe('wakeupHost', () => {
    it('trims idempotency key and propagates correlation id on success', async () => {
      commandRouter.routeWakeCommand.mockResolvedValue({
        success: true,
        message: 'Wake-on-LAN packet sent to desktop@lab',
        nodeId: 'node-1',
        location: 'lab',
        correlationId: 'cid-router',
      });

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        correlationId: 'cid-request',
        headers: { 'Idempotency-Key': '  wake-1  ' },
      });
      const res = createMockResponse();

      await controller.wakeupHost(req, res);

      expect(commandRouter.routeWakeCommand).toHaveBeenCalledWith('desktop@lab', {
        idempotencyKey: 'wake-1',
        correlationId: 'cid-request',
        verify: null,
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Wake-on-LAN packet sent to desktop@lab',
        nodeId: 'node-1',
        location: 'lab',
        correlationId: 'cid-router',
      });
    });

    it('falls back to request correlation id when router result omits one', async () => {
      commandRouter.routeWakeCommand.mockResolvedValue({
        success: true,
        message: 'Wake-on-LAN packet sent to desktop@lab',
        nodeId: 'node-1',
        location: 'lab',
      });

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        correlationId: 'cid-request',
        headers: { 'Idempotency-Key': '   ' },
      });
      const res = createMockResponse();

      await controller.wakeupHost(req, res);

      expect(commandRouter.routeWakeCommand).toHaveBeenCalledWith('desktop@lab', {
        idempotencyKey: null,
        correlationId: 'cid-request',
        verify: null,
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: 'cid-request' })
      );
    });

    it('maps timeout errors to 504 and includes correlation id', async () => {
      commandRouter.routeWakeCommand.mockRejectedValue(new Error('Command timeout after 30000ms'));

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        correlationId: 'cid-request',
      });
      const res = createMockResponse();

      await controller.wakeupHost(req, res);

      expect(res.status).toHaveBeenCalledWith(504);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Gateway Timeout',
        message: 'Command timeout after 30000ms',
        correlationId: 'cid-request',
      });
    });

    it('maps not-found errors to 404', async () => {
      commandRouter.routeWakeCommand.mockRejectedValue(new Error('Host not found: desktop@lab'));

      const req = createMockRequest({ params: { fqn: 'desktop@lab' } });
      const res = createMockResponse();

      await controller.wakeupHost(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Host not found: desktop@lab',
      });
    });

    it('maps offline errors to 503', async () => {
      commandRouter.routeWakeCommand.mockRejectedValue(new Error('Node node-1 is offline'));

      const req = createMockRequest({ params: { fqn: 'desktop@lab' } });
      const res = createMockResponse();

      await controller.wakeupHost(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Service Unavailable',
        message: 'Node node-1 is offline',
      });
    });

    it('maps invalid FQN errors to 400', async () => {
      commandRouter.routeWakeCommand.mockRejectedValue(new Error('Invalid FQN encoding: desktop@Lab%ZZ'));

      const req = createMockRequest({ params: { fqn: 'desktop@Lab%ZZ' } });
      const res = createMockResponse();

      await controller.wakeupHost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid FQN encoding: desktop@Lab%ZZ',
      });
    });

    it('uses generic 500 mapping for non-Error throw values', async () => {
      commandRouter.routeWakeCommand.mockRejectedValue('unknown');

      const req = createMockRequest({ params: { fqn: 'desktop@lab' } });
      const res = createMockResponse();

      await controller.wakeupHost(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to wake host',
      });
    });
  });

  describe('pingHost', () => {
    it('returns node-agent ping result payload', async () => {
      commandRouter.routePingHostCommand.mockResolvedValue({
        target: 'desktop@lab',
        checkedAt: '2026-02-16T23:00:00.000Z',
        latencyMs: 14,
        success: true,
        status: 'awake',
        source: 'node-agent',
      });

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        correlationId: 'cid-request',
      });
      const res = createMockResponse();

      await controller.pingHost(req, res);

      expect(commandRouter.routePingHostCommand).toHaveBeenCalledWith('desktop@lab', {
        correlationId: 'cid-request',
      });
      expect(res.json).toHaveBeenCalledWith({
        target: 'desktop@lab',
        checkedAt: '2026-02-16T23:00:00.000Z',
        latencyMs: 14,
        success: true,
        status: 'awake',
        source: 'node-agent',
      });
    });

    it('maps node offline errors to 503 and includes correlation id', async () => {
      commandRouter.routePingHostCommand.mockRejectedValue(
        new Error('Node node-1 is offline')
      );

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        correlationId: 'cid-request',
      });
      const res = createMockResponse();

      await controller.pingHost(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Service Unavailable',
        message: 'Node node-1 is offline',
        correlationId: 'cid-request',
      });
    });
  });

  describe('deleteHost', () => {
    it('returns success payload and falls back to request correlation id', async () => {
      commandRouter.routeDeleteHostCommand.mockResolvedValue({ success: true });

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        correlationId: 'cid-request',
        headers: { 'Idempotency-Key': '  delete-1 ' },
      });
      const res = createMockResponse();

      await controller.deleteHost(req, res);

      expect(commandRouter.routeDeleteHostCommand).toHaveBeenCalledWith('desktop@lab', {
        idempotencyKey: 'delete-1',
        correlationId: 'cid-request',
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Host deleted successfully',
        correlationId: 'cid-request',
      });
    });

    it('returns 500 when delete command reports failure', async () => {
      commandRouter.routeDeleteHostCommand.mockResolvedValue({
        success: false,
        error: 'cannot delete',
      });

      const req = createMockRequest({ params: { fqn: 'desktop@lab' } });
      const res = createMockResponse();

      await controller.deleteHost(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'cannot delete',
      });
    });

    it('maps not-found errors to 404', async () => {
      commandRouter.routeDeleteHostCommand.mockRejectedValue(new Error('Host not found: desktop@lab'));

      const req = createMockRequest({ params: { fqn: 'desktop@lab' } });
      const res = createMockResponse();

      await controller.deleteHost(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Host not found: desktop@lab',
      });
    });

    it('maps offline errors to 503', async () => {
      commandRouter.routeDeleteHostCommand.mockRejectedValue(new Error('Node node-1 is offline'));

      const req = createMockRequest({ params: { fqn: 'desktop@lab' } });
      const res = createMockResponse();

      await controller.deleteHost(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Service Unavailable',
        message: 'Node node-1 is offline',
      });
    });

    it('maps timeout errors to 504', async () => {
      commandRouter.routeDeleteHostCommand.mockRejectedValue(new Error('Command timeout after 30000ms'));

      const req = createMockRequest({ params: { fqn: 'desktop@lab' } });
      const res = createMockResponse();

      await controller.deleteHost(req, res);

      expect(res.status).toHaveBeenCalledWith(504);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Gateway Timeout',
        message: 'Command timeout after 30000ms',
      });
    });

    it('maps invalid FQN errors to 400', async () => {
      commandRouter.routeDeleteHostCommand.mockRejectedValue(new Error('Invalid FQN format: bad-fqn. Expected hostname@location'));

      const req = createMockRequest({ params: { fqn: 'bad-fqn' } });
      const res = createMockResponse();

      await controller.deleteHost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid FQN format: bad-fqn. Expected hostname@location',
      });
    });

    it('uses generic 500 mapping for non-Error throw values and keeps correlation id', async () => {
      commandRouter.routeDeleteHostCommand.mockRejectedValue('unknown');

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        correlationId: 'cid-request',
      });
      const res = createMockResponse();

      await controller.deleteHost(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to delete host',
        correlationId: 'cid-request',
      });
    });
  });

  describe('scanHostPorts', () => {
    it('returns scan payload and prefers router correlation id', async () => {
      commandRouter.routeScanHostPortsCommand.mockResolvedValue({
        commandId: 'scan-command-1',
        nodeId: 'node-1',
        message: 'Port scan completed, found 2 open TCP port(s)',
        hostPortScan: {
          hostName: 'desktop',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.25',
          scannedAt: '2026-02-16T00:00:00.000Z',
          openPorts: [
            { port: 22, protocol: 'tcp', service: 'SSH' },
            { port: 443, protocol: 'tcp', service: 'HTTPS' },
          ],
        },
        correlationId: 'cid-router',
      });

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        correlationId: 'cid-request',
      });
      const res = createMockResponse();

      await controller.scanHostPorts(req, res);

      expect(commandRouter.routeScanHostPortsCommand).toHaveBeenCalledWith('desktop@lab', {
        correlationId: 'cid-request',
      });
      expect(hostAggregator.saveHostPortScanSnapshot).toHaveBeenCalledWith('desktop@lab', {
        scannedAt: '2026-02-16T00:00:00.000Z',
        openPorts: [
          { port: 22, protocol: 'tcp', service: 'SSH' },
          { port: 443, protocol: 'tcp', service: 'HTTPS' },
        ],
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          target: 'desktop@lab',
          openPorts: [
            { port: 22, protocol: 'tcp', service: 'SSH' },
            { port: 443, protocol: 'tcp', service: 'HTTPS' },
          ],
          scannedAt: '2026-02-16T00:00:00.000Z',
          scan: expect.objectContaining({
            commandId: 'scan-command-1',
            state: 'acknowledged',
            nodeId: 'node-1',
          }),
          message: 'Port scan completed, found 2 open TCP port(s)',
          correlationId: 'cid-router',
        })
      );
    });

    it('returns 404 when scan target host is not found', async () => {
      commandRouter.routeScanHostPortsCommand.mockRejectedValue(
        new Error('Host not found: missing@lab')
      );

      const req = createMockRequest({ params: { fqn: 'missing@lab' } });
      const res = createMockResponse();

      await controller.scanHostPorts(req, res);

      expect(commandRouter.routeScanHostPortsCommand).toHaveBeenCalledWith('missing@lab', {
        correlationId: null,
      });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Host not found: missing@lab',
      });
      expect(hostAggregator.saveHostPortScanSnapshot).not.toHaveBeenCalled();
    });

    it('maps already-in-progress scan errors to 409 and includes correlation id', async () => {
      commandRouter.routeScanHostPortsCommand.mockRejectedValue(new Error('Scan already in progress'));

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        correlationId: 'cid-request',
      });
      const res = createMockResponse();

      await controller.scanHostPorts(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Conflict',
        message: 'Scan already in progress',
        correlationId: 'cid-request',
      });
      expect(hostAggregator.saveHostPortScanSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('getHostPorts', () => {
    it('returns cached host open ports when a fresh snapshot exists', async () => {
      hostAggregator.getHostByFQN.mockResolvedValue({
        name: 'desktop',
        nodeId: 'node-1',
        openPorts: [
          { port: 22, protocol: 'tcp', service: 'SSH' },
          { port: 443, protocol: 'tcp', service: 'HTTPS' },
        ],
        portsScannedAt: '2026-02-16T00:00:00.000Z',
      });

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        correlationId: 'cid-request',
      });
      const res = createMockResponse();

      await controller.getHostPorts(req, res);

      expect(commandRouter.routeScanHostPortsCommand).not.toHaveBeenCalled();
      expect(hostAggregator.saveHostPortScanSnapshot).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          target: 'desktop@lab',
          scannedAt: '2026-02-16T00:00:00.000Z',
          openPorts: [
            { port: 22, protocol: 'tcp', service: 'SSH' },
            { port: 443, protocol: 'tcp', service: 'HTTPS' },
          ],
          message: 'Returning cached port scan result.',
          correlationId: 'cid-request',
        })
      );
    });

    it('executes a node scan and persists snapshot when no cached payload exists', async () => {
      hostAggregator.getHostByFQN.mockResolvedValue({
        name: 'desktop',
        nodeId: 'node-1',
        openPorts: undefined,
        portsScannedAt: null,
      });
      commandRouter.routeScanHostPortsCommand.mockResolvedValue({
        commandId: 'scan-command-fresh',
        nodeId: 'node-1',
        message: 'Port scan completed, found 1 open TCP port(s)',
        hostPortScan: {
          hostName: 'desktop',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.25',
          scannedAt: '2026-02-16T03:00:00.000Z',
          openPorts: [{ port: 22, protocol: 'tcp', service: 'SSH' }],
        },
        correlationId: 'cid-router',
      });

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        correlationId: 'cid-request',
      });
      const res = createMockResponse();

      await controller.getHostPorts(req, res);

      expect(commandRouter.routeScanHostPortsCommand).toHaveBeenCalledWith('desktop@lab', {
        correlationId: 'cid-request',
      });
      expect(hostAggregator.saveHostPortScanSnapshot).toHaveBeenCalledWith('desktop@lab', {
        scannedAt: '2026-02-16T03:00:00.000Z',
        openPorts: [{ port: 22, protocol: 'tcp', service: 'SSH' }],
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          target: 'desktop@lab',
          scannedAt: '2026-02-16T03:00:00.000Z',
          openPorts: [{ port: 22, protocol: 'tcp', service: 'SSH' }],
          correlationId: 'cid-router',
        })
      );
    });
  });

  describe('updateHost correlation branch', () => {
    it('prefers router correlationId in success response', async () => {
      commandRouter.routeUpdateHostCommand.mockResolvedValue({
        success: true,
        correlationId: 'cid-router',
      });

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        body: { name: 'new-name' },
        correlationId: 'cid-request',
      });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Host updated successfully',
        correlationId: 'cid-router',
      });
    });

    it('uses generic 500 mapping in catch and includes request correlation id', async () => {
      commandRouter.routeUpdateHostCommand.mockRejectedValue(new Error('unexpected failure'));

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        body: { name: 'new-name' },
        correlationId: 'cid-request',
      });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'unexpected failure',
        correlationId: 'cid-request',
      });
    });

    it('maps invalid FQN errors to 400 in update flow', async () => {
      commandRouter.routeUpdateHostCommand.mockRejectedValue(
        new Error('Invalid FQN encoding: desktop@Lab%ZZ')
      );

      const req = createMockRequest({
        params: { fqn: 'desktop@Lab%ZZ' },
        body: { name: 'new-name' },
      });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid FQN encoding: desktop@Lab%ZZ',
      });
    });
  });
});
