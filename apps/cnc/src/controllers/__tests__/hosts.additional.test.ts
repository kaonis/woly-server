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
    getHostStatusHistory: jest.Mock;
    getHostUptime: jest.Mock;
    saveHostPortScanSnapshot: jest.Mock;
  };
  let commandRouter: {
    routeWakeCommand: jest.Mock;
    routeSleepHostCommand: jest.Mock;
    routeShutdownHostCommand: jest.Mock;
    routeScanHostsCommand: jest.Mock;
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
      getHostStatusHistory: jest.fn(),
      getHostUptime: jest.fn(),
      saveHostPortScanSnapshot: jest.fn().mockResolvedValue(true),
    };
    commandRouter = {
      routeWakeCommand: jest.fn(),
      routeSleepHostCommand: jest.fn(),
      routeShutdownHostCommand: jest.fn(),
      routeScanHostsCommand: jest.fn(),
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

  describe('getHostHistory', () => {
    it('returns 400 for invalid history query parameters', async () => {
      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        query: { from: 'not-a-date' },
      });
      const res = createMockResponse();

      await controller.getHostHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(hostAggregator.getHostByFQN).not.toHaveBeenCalled();
    });

    it('returns 404 when host does not exist', async () => {
      hostAggregator.getHostByFQN.mockResolvedValue(null);

      const req = createMockRequest({ params: { fqn: 'missing@lab' } });
      const res = createMockResponse();

      await controller.getHostHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(hostAggregator.getHostStatusHistory).not.toHaveBeenCalled();
    });

    it('returns history payload when host exists', async () => {
      hostAggregator.getHostByFQN.mockResolvedValue({ name: 'desktop' });
      hostAggregator.getHostStatusHistory.mockResolvedValue([
        {
          hostFqn: 'desktop@lab',
          oldStatus: 'asleep',
          newStatus: 'awake',
          changedAt: '2026-02-18T10:00:00.000Z',
        },
      ]);

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        query: {
          from: '2026-02-18T09:00:00.000Z',
          to: '2026-02-18T11:00:00.000Z',
          limit: '10',
        },
      });
      const res = createMockResponse();

      await controller.getHostHistory(req, res);

      expect(hostAggregator.getHostStatusHistory).toHaveBeenCalledWith('desktop@lab', {
        from: '2026-02-18T09:00:00.000Z',
        to: '2026-02-18T11:00:00.000Z',
        limit: 10,
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          hostFqn: 'desktop@lab',
          entries: expect.any(Array),
        }),
      );
    });

    it('returns 400 when from is later than to', async () => {
      hostAggregator.getHostByFQN.mockResolvedValue({ name: 'desktop' });

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        query: {
          from: '2026-02-18T12:00:00.000Z',
          to: '2026-02-18T11:00:00.000Z',
        },
      });
      const res = createMockResponse();

      await controller.getHostHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(hostAggregator.getHostStatusHistory).not.toHaveBeenCalled();
    });
  });

  describe('getHostUptime', () => {
    it('returns uptime summary for valid period', async () => {
      hostAggregator.getHostUptime.mockResolvedValue({
        hostFqn: 'desktop@lab',
        period: '7d',
        from: '2026-02-11T10:00:00.000Z',
        to: '2026-02-18T10:00:00.000Z',
        uptimePercentage: 98.5,
        awakeMs: 1000,
        asleepMs: 100,
        transitions: 2,
        currentStatus: 'awake',
      });

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        query: { period: '7d' },
      });
      const res = createMockResponse();

      await controller.getHostUptime(req, res);

      expect(hostAggregator.getHostUptime).toHaveBeenCalledWith('desktop@lab', { period: '7d' });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ hostFqn: 'desktop@lab' }));
    });

    it('returns 400 when period format is invalid', async () => {
      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        query: { period: 'invalid' },
      });
      const res = createMockResponse();

      await controller.getHostUptime(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(hostAggregator.getHostUptime).not.toHaveBeenCalled();
    });

    it('maps missing host errors to 404', async () => {
      hostAggregator.getHostUptime.mockRejectedValue(new Error('Host desktop@lab not found'));

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
      });
      const res = createMockResponse();

      await controller.getHostUptime(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
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

    it('passes wolPort override from body to command router', async () => {
      commandRouter.routeWakeCommand.mockResolvedValue({
        success: true,
        message: 'Wake-on-LAN packet sent to desktop@lab',
        nodeId: 'node-1',
        location: 'lab',
      });

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        body: { wolPort: 7 },
      });
      const res = createMockResponse();

      await controller.wakeupHost(req, res);

      expect(commandRouter.routeWakeCommand).toHaveBeenCalledWith('desktop@lab', {
        idempotencyKey: null,
        verify: null,
        wolPort: 7,
      });
    });

    it('rejects invalid wake request body', async () => {
      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        body: { wolPort: 70_000 },
      });
      const res = createMockResponse();

      await controller.wakeupHost(req, res);

      expect(commandRouter.routeWakeCommand).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: 'Invalid request body',
          details: expect.any(Array),
        })
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

  describe('sleepHost', () => {
    it('requires explicit confirmation token', async () => {
      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        body: {},
      });
      const res = createMockResponse();

      await controller.sleepHost(req, res);

      expect(commandRouter.routeSleepHostCommand).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
        })
      );
    });

    it('dispatches sleep command with idempotency/correlation context', async () => {
      commandRouter.routeSleepHostCommand.mockResolvedValue({
        success: true,
        action: 'sleep',
        message: 'Remote sleep command executed for desktop',
        nodeId: 'node-1',
        location: 'lab',
      });

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        body: { confirm: 'sleep' },
        correlationId: 'cid-request',
        headers: { 'Idempotency-Key': ' sleep-1 ' },
      });
      const res = createMockResponse();

      await controller.sleepHost(req, res);

      expect(commandRouter.routeSleepHostCommand).toHaveBeenCalledWith('desktop@lab', {
        idempotencyKey: 'sleep-1',
        correlationId: 'cid-request',
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          action: 'sleep',
          correlationId: 'cid-request',
        })
      );
    });
  });

  describe('shutdownHost', () => {
    it('maps routing errors consistently', async () => {
      commandRouter.routeShutdownHostCommand.mockRejectedValue(new Error('Node node-1 is offline'));

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        body: { confirm: 'shutdown' },
      });
      const res = createMockResponse();

      await controller.shutdownHost(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Service Unavailable',
        message: 'Node node-1 is offline',
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

    it('returns queued delete response when router reports queued state', async () => {
      commandRouter.routeDeleteHostCommand.mockResolvedValue({
        success: true,
        commandId: 'cmd-delete-queued',
        state: 'queued',
      });

      const req = createMockRequest({ params: { fqn: 'desktop@lab' } });
      const res = createMockResponse();

      await controller.deleteHost(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Delete command queued (node offline)',
        commandId: 'cmd-delete-queued',
        state: 'queued',
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

  describe('scanHosts', () => {
    it('returns scan lifecycle payload from command router', async () => {
      commandRouter.routeScanHostsCommand.mockResolvedValue({
        state: 'acknowledged',
        commandId: 'scan-command-1',
        queuedAt: '2026-02-16T04:00:00.000Z',
        startedAt: '2026-02-16T04:00:00.000Z',
        completedAt: '2026-02-16T04:00:01.000Z',
        lastScanAt: '2026-02-16T04:00:01.000Z',
        message: 'Scan command dispatched to 2 connected node(s).',
        correlationId: 'cid-router',
      });

      const req = createMockRequest({ correlationId: 'cid-request' });
      const res = createMockResponse();

      await controller.scanHosts(req, res);

      expect(commandRouter.routeScanHostsCommand).toHaveBeenCalledWith({
        correlationId: 'cid-request',
      });
      expect(res.json).toHaveBeenCalledWith({
        state: 'acknowledged',
        commandId: 'scan-command-1',
        queuedAt: '2026-02-16T04:00:00.000Z',
        startedAt: '2026-02-16T04:00:00.000Z',
        completedAt: '2026-02-16T04:00:01.000Z',
        lastScanAt: '2026-02-16T04:00:01.000Z',
        message: 'Scan command dispatched to 2 connected node(s).',
        correlationId: 'cid-router',
      });
    });

    it('maps offline scan dispatch errors to 503 and includes correlation id', async () => {
      commandRouter.routeScanHostsCommand.mockRejectedValue(
        new Error('All nodes are offline; no connected nodes available for scan'),
      );

      const req = createMockRequest({ correlationId: 'cid-request' });
      const res = createMockResponse();

      await controller.scanHosts(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Service Unavailable',
        message: 'All nodes are offline; no connected nodes available for scan',
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

  describe('merge candidate and merge-mac flows', () => {
    it('returns merge candidates grouped by same hostname and subnet', async () => {
      hostAggregator.getAllHosts.mockResolvedValue([
        {
          nodeId: 'node-1',
          name: 'laptop',
          mac: 'AA:BB:CC:00:00:01',
          ip: '192.168.10.11',
          fullyQualifiedName: 'laptop@lab-node-1',
        },
        {
          nodeId: 'node-1',
          name: 'Laptop',
          mac: 'AA:BB:CC:00:00:02',
          ip: '192.168.10.99',
          fullyQualifiedName: 'Laptop@lab-node-1',
        },
        {
          nodeId: 'node-2',
          name: 'laptop',
          mac: 'AA:BB:CC:00:00:03',
          ip: '192.168.10.55',
          fullyQualifiedName: 'laptop@office-node-2',
        },
      ]);

      const req = createMockRequest({ correlationId: 'cid-request' });
      const res = createMockResponse();

      await controller.getMergeCandidates(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          candidates: [
            expect.objectContaining({
              targetFqn: 'laptop@lab-node-1',
              candidateFqn: 'Laptop@lab-node-1',
              nodeId: 'node-1',
              reason: 'same_hostname_subnet',
            }),
          ],
          correlationId: 'cid-request',
        }),
      );
    });

    it('returns 500 when listing merge candidates fails', async () => {
      hostAggregator.getAllHosts.mockRejectedValue(new Error('boom'));

      const req = createMockRequest();
      const res = createMockResponse();

      await controller.getMergeCandidates(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to list merge candidates',
        correlationId: undefined,
      });
    });

    it('merges a secondary mac and optionally deletes a source host', async () => {
      hostAggregator.getHostByFQN.mockResolvedValue({
        nodeId: 'node-1',
        name: 'desktop',
        mac: 'AA:BB:CC:00:00:01',
        secondaryMacs: [],
      });
      commandRouter.routeUpdateHostCommand.mockResolvedValue({
        success: true,
        commandId: 'cmd-merge-1',
        state: 'acknowledged',
        correlationId: 'cid-router',
      });
      commandRouter.routeDeleteHostCommand.mockResolvedValue({
        success: true,
      });

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        body: {
          mac: 'aa-bb-cc-00-00-02',
          sourceFqn: 'desktop-old@lab',
          deleteSourceHost: true,
        },
        correlationId: 'cid-request',
      });
      const res = createMockResponse();

      await controller.mergeHostMac(req, res);

      expect(commandRouter.routeUpdateHostCommand).toHaveBeenCalledWith(
        'desktop@lab',
        { mac: 'AA:BB:CC:00:00:01', secondaryMacs: ['AA:BB:CC:00:00:02'] },
        { idempotencyKey: null, correlationId: 'cid-request' },
      );
      expect(commandRouter.routeDeleteHostCommand).toHaveBeenCalledWith('desktop-old@lab', {
        idempotencyKey: null,
        correlationId: 'cid-request',
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Host MAC merged successfully',
        secondaryMacs: ['AA:BB:CC:00:00:02'],
        primaryMac: 'AA:BB:CC:00:00:01',
        commandId: 'cmd-merge-1',
        state: 'acknowledged',
        correlationId: 'cid-router',
      });
    });

    it('returns 400 for invalid merge body', async () => {
      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        body: { mac: 'not-a-mac' },
      });
      const res = createMockResponse();

      await controller.mergeHostMac(req, res);

      expect(commandRouter.routeUpdateHostCommand).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for invalid unmerge MAC path parameter', async () => {
      hostAggregator.getHostByFQN.mockResolvedValue({
        nodeId: 'node-1',
        name: 'desktop',
        mac: 'AA:BB:CC:00:00:01',
        secondaryMacs: ['AA:BB:CC:00:00:02'],
      });

      const req = createMockRequest({
        params: { fqn: 'desktop@lab', mac: 'bad-mac' },
      });
      const res = createMockResponse();

      await controller.unmergeHostMac(req, res);

      expect(commandRouter.routeUpdateHostCommand).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid MAC address format',
        correlationId: undefined,
      });
    });

    it('unmerges a secondary MAC and sends update command', async () => {
      hostAggregator.getHostByFQN.mockResolvedValue({
        nodeId: 'node-1',
        name: 'desktop',
        mac: 'AA:BB:CC:00:00:01',
        secondaryMacs: ['AA:BB:CC:00:00:02'],
      });
      commandRouter.routeUpdateHostCommand.mockResolvedValue({
        success: true,
        commandId: 'cmd-unmerge-1',
        state: 'acknowledged',
      });

      const req = createMockRequest({
        params: { fqn: 'desktop@lab', mac: 'AA:BB:CC:00:00:02' },
      });
      const res = createMockResponse();

      await controller.unmergeHostMac(req, res);

      expect(commandRouter.routeUpdateHostCommand).toHaveBeenCalledWith(
        'desktop@lab',
        { mac: 'AA:BB:CC:00:00:01', secondaryMacs: [] },
        { idempotencyKey: null, correlationId: null },
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Host MAC unmerged successfully',
        secondaryMacs: [],
        primaryMac: 'AA:BB:CC:00:00:01',
        commandId: 'cmd-unmerge-1',
        state: 'acknowledged',
        correlationId: undefined,
      });
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

    it('returns queued update response when router reports queued state', async () => {
      commandRouter.routeUpdateHostCommand.mockResolvedValue({
        success: true,
        commandId: 'cmd-update-queued',
        state: 'queued',
      });

      const req = createMockRequest({
        params: { fqn: 'desktop@lab' },
        body: { name: 'new-name' },
      });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Update command queued (node offline)',
        commandId: 'cmd-update-queued',
        state: 'queued',
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
