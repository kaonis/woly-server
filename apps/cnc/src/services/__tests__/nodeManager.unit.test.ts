import type WebSocket from 'ws';
import config from '../../config';
import logger from '../../utils/logger';
import { NodeModel } from '../../models/Node';
import { NodeManager } from '../nodeManager';

jest.mock('../../models/Node', () => ({
  NodeModel: {
    register: jest.fn(),
    updateHeartbeat: jest.fn(),
    findById: jest.fn(),
    markStaleNodesOffline: jest.fn(),
    getOfflineNodes: jest.fn(),
  },
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

type MockWs = {
  on: jest.Mock;
  send: jest.Mock;
  close: jest.Mock;
};

function createMockWs(): { ws: WebSocket; mock: MockWs; handlers: Record<string, (...args: unknown[]) => unknown> } {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  const mock: MockWs = {
    on: jest.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      handlers[event] = handler;
    }),
    send: jest.fn(),
    close: jest.fn(),
  };

  return { ws: mock as unknown as WebSocket, mock, handlers };
}

function createHostAggregatorMock() {
  return {
    onHostDiscovered: jest.fn().mockResolvedValue(undefined),
    onHostUpdated: jest.fn().mockResolvedValue(undefined),
    onHostRemoved: jest.fn().mockResolvedValue(undefined),
    markNodeHostsUnreachable: jest.fn().mockResolvedValue(undefined),
  };
}

const mockedNodeModel = NodeModel as jest.Mocked<typeof NodeModel>;
const mockedLogger = logger as jest.Mocked<typeof logger>;
const originalFetch = global.fetch;

describe('NodeManager unit branches', () => {
  let hostAggregator: ReturnType<typeof createHostAggregatorMock>;
  let nodeManager: NodeManager;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    hostAggregator = createHostAggregatorMock();
    nodeManager = new NodeManager(hostAggregator as unknown as never);
    fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  });

  afterEach(() => {
    nodeManager.shutdown();
  });

  afterAll(() => {
    (global as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  it('rejects malformed auth contexts before websocket handlers are attached', async () => {
    const first = createMockWs();
    await nodeManager.handleConnection(first.ws, null);
    expect(first.mock.close).toHaveBeenCalledWith(4001, 'Invalid authentication token');

    const second = createMockWs();
    await nodeManager.handleConnection(second.ws, { token: 'missing-kind' });
    expect(second.mock.close).toHaveBeenCalledWith(4001, 'Invalid authentication token');

    const third = createMockWs();
    await nodeManager.handleConnection(third.ws, { kind: 'session-token', token: 'invalid-token' });
    expect(third.mock.close).toHaveBeenCalledWith(4001, 'Invalid authentication token');
  });

  it('handles unexpected exceptions from handleMessage and emits protocol error payload', async () => {
    const { ws, mock, handlers } = createMockWs();
    await nodeManager.handleConnection(ws, { kind: 'static-token', token: 'dev-token-home' });

    jest
      .spyOn(nodeManager as unknown as { handleMessage: (ws: WebSocket, message: unknown) => Promise<void> }, 'handleMessage')
      .mockRejectedValue(new Error('unexpected'));

    await handlers.message?.(
      Buffer.from(
        JSON.stringify({
          type: 'heartbeat',
          data: { nodeId: 'node-1', timestamp: new Date().toISOString() },
        })
      )
    );

    expect(mockedLogger.error).toHaveBeenCalledWith('Error handling node message', {
      error: expect.any(Error),
    });
    expect(mock.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'error', message: 'Invalid message format' })
    );
  });

  it('logs websocket error events', async () => {
    const { ws, handlers } = createMockWs();
    await nodeManager.handleConnection(ws, { kind: 'static-token', token: 'dev-token-home' });

    const wsError = new Error('socket failure');
    handlers.error?.(wsError);

    expect(mockedLogger.error).toHaveBeenCalledWith('WebSocket error', { error: wsError });
  });

  it('returns offline and logs when getNodeStatus lookup throws', async () => {
    mockedNodeModel.findById.mockRejectedValue(new Error('lookup failed'));

    const status = await nodeManager.getNodeStatus('node-db-error');

    expect(status).toBe('offline');
    expect(mockedLogger.error).toHaveBeenCalledWith('Failed to get node status', {
      nodeId: 'node-db-error',
      error: expect.any(Error),
    });
  });

  it('rejects invalid outbound command payloads', async () => {
    (nodeManager as unknown as {
      connections: Map<string, { ws: WebSocket; nodeId: string; location: string; registeredAt: Date }>;
    }).connections.set('node-1', {
      nodeId: 'node-1',
      ws: createMockWs().ws,
      location: 'Lab',
      registeredAt: new Date(),
    });

    await expect(
      nodeManager.sendCommand('node-1', {
        type: 'wake',
        commandId: 'cmd-invalid',
        data: { hostName: 'desktop' },
      } as unknown as never)
    ).rejects.toThrow('Invalid outbound command payload: wake');
  });

  it('routes commands through node tunnel endpoint when publicUrl is available', async () => {
    const { ws, mock } = createMockWs();
    (nodeManager as unknown as {
      connections: Map<
        string,
        {
          ws: WebSocket;
          nodeId: string;
          location: string;
          registeredAt: Date;
          publicUrl?: string;
          authTokenHint?: string;
        }
      >;
    }).connections.set('node-1', {
      nodeId: 'node-1',
      ws,
      location: 'Lab',
      registeredAt: new Date(),
      publicUrl: 'https://node-1.example.trycloudflare.com',
      authTokenHint: 'dev-token-home',
    });

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'command-result',
        data: {
          nodeId: 'node-1',
          commandId: 'cmd-tunnel-1',
          success: true,
          message: 'Wake completed',
          timestamp: new Date().toISOString(),
        },
      }),
    });

    const commandResultListener = jest.fn();
    nodeManager.on('command-result', commandResultListener);

    await nodeManager.sendCommand('node-1', {
      type: 'wake',
      commandId: 'cmd-tunnel-1',
      data: { hostName: 'desktop', mac: 'AA:BB:CC:DD:EE:FF' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://node-1.example.trycloudflare.com/agent/commands',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(mock.send).not.toHaveBeenCalled();
    expect(commandResultListener).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'node-1',
        commandId: 'cmd-tunnel-1',
        success: true,
      }),
    );
  });

  it('falls back to websocket transport when tunnel dispatch fails', async () => {
    const { ws, mock } = createMockWs();
    (nodeManager as unknown as {
      connections: Map<
        string,
        {
          ws: WebSocket;
          nodeId: string;
          location: string;
          registeredAt: Date;
          publicUrl?: string;
          authTokenHint?: string;
        }
      >;
    }).connections.set('node-1', {
      nodeId: 'node-1',
      ws,
      location: 'Lab',
      registeredAt: new Date(),
      publicUrl: 'https://node-1.example.trycloudflare.com',
      authTokenHint: 'dev-token-home',
    });

    fetchMock.mockRejectedValueOnce(new Error('tunnel unavailable'));

    await nodeManager.sendCommand('node-1', {
      type: 'wake',
      commandId: 'cmd-ws-fallback',
      data: { hostName: 'desktop', mac: 'AA:BB:CC:DD:EE:FF' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mock.send).toHaveBeenCalledWith(
      expect.stringContaining('cmd-ws-fallback'),
    );
  });

  it('handles unknown node host events and aggregator failures gracefully', async () => {
    await (nodeManager as unknown as {
      handleHostDiscovered: (data: {
        nodeId: string;
        name: string;
        mac: string;
        ip: string;
        status: 'awake' | 'asleep';
        lastSeen: string;
        discovered: number;
      }) => Promise<void>;
    }).handleHostDiscovered({
      nodeId: 'unknown-node',
      name: 'host-a',
      mac: 'AA:BB:CC:DD:EE:01',
      ip: '10.0.0.10',
      status: 'awake',
      lastSeen: new Date().toISOString(),
      discovered: 1,
    });

    expect(mockedLogger.warn).toHaveBeenCalledWith('Received host event from unknown node', {
      nodeId: 'unknown-node',
    });

    (nodeManager as unknown as {
      connections: Map<string, { ws: WebSocket; nodeId: string; location: string; registeredAt: Date }>;
    }).connections.set('node-known', {
      nodeId: 'node-known',
      ws: createMockWs().ws,
      location: 'Lab',
      registeredAt: new Date(),
    });

    hostAggregator.onHostDiscovered.mockRejectedValueOnce(new Error('discover fail'));
    await (nodeManager as unknown as {
      handleHostDiscovered: (data: {
        nodeId: string;
        name: string;
        mac: string;
        ip: string;
        status: 'awake' | 'asleep';
        lastSeen: string;
        discovered: number;
      }) => Promise<void>;
    }).handleHostDiscovered({
      nodeId: 'node-known',
      name: 'host-b',
      mac: 'AA:BB:CC:DD:EE:02',
      ip: '10.0.0.11',
      status: 'awake',
      lastSeen: new Date().toISOString(),
      discovered: 1,
    });

    hostAggregator.onHostUpdated.mockRejectedValueOnce(new Error('update fail'));
    await (nodeManager as unknown as {
      handleHostUpdated: (data: {
        nodeId: string;
        name: string;
        mac: string;
        ip: string;
        status: 'awake' | 'asleep';
        lastSeen: string;
        discovered: number;
      }) => Promise<void>;
    }).handleHostUpdated({
      nodeId: 'node-known',
      name: 'host-c',
      mac: 'AA:BB:CC:DD:EE:03',
      ip: '10.0.0.12',
      status: 'asleep',
      lastSeen: new Date().toISOString(),
      discovered: 2,
    });

    hostAggregator.onHostRemoved.mockRejectedValueOnce(new Error('remove fail'));
    await (nodeManager as unknown as {
      handleHostRemoved: (data: { nodeId: string; name: string }) => Promise<void>;
    }).handleHostRemoved({
      nodeId: 'node-known',
      name: 'host-c',
    });

    expect(mockedLogger.error).toHaveBeenCalledWith('Failed to handle host-discovered', {
      error: expect.any(Error),
    });
    expect(mockedLogger.error).toHaveBeenCalledWith('Failed to handle host-updated', {
      error: expect.any(Error),
    });
    expect(mockedLogger.error).toHaveBeenCalledWith('Failed to handle host-removed', {
      error: expect.any(Error),
    });
  });

  it('covers message budget reset, message type extraction, and payload sanitization helpers', () => {
    const internals = nodeManager as unknown as {
      messageRateWindows: WeakMap<WebSocket, { windowStartMs: number; count: number }>;
      consumeInboundMessageBudget: (ws: WebSocket) => boolean;
      extractMessageType: (payload: unknown) => string;
      sanitizeLogPayload: (value: unknown, depth?: number) => unknown;
    };
    const { ws } = createMockWs();

    internals.messageRateWindows.set(ws, {
      windowStartMs: Date.now() - 1500,
      count: 999,
    });
    expect(internals.consumeInboundMessageBudget(ws)).toBe(true);

    expect(internals.extractMessageType(null)).toBe('unknown');
    expect(internals.extractMessageType({})).toBe('unknown');
    expect(internals.extractMessageType({ type: 'heartbeat' })).toBe('heartbeat');

    expect(internals.sanitizeLogPayload(null)).toBeNull();
    expect(internals.sanitizeLogPayload('x', 5)).toBe('[truncated-depth]');
    expect(internals.sanitizeLogPayload(7)).toBe(7);
    expect(internals.sanitizeLogPayload(true)).toBe(true);
    expect(internals.sanitizeLogPayload(['ok', 'a'.repeat(2100)])).toEqual([
      'ok',
      expect.stringContaining('[truncated]'),
    ]);
    expect(
      internals.sanitizeLogPayload({
        tokenValue: 'secret',
        nested: { passwordHint: 'pw', safe: 'ok' },
      })
    ).toEqual({
      tokenValue: '[REDACTED]',
      nested: {
        passwordHint: '[REDACTED]',
        safe: 'ok',
      },
    });
    expect(internals.sanitizeLogPayload(Symbol('sym'))).toContain('Symbol(sym)');
  });

  it('emits scan-complete events when node scan completion is reported', async () => {
    const scanComplete = jest.fn();
    nodeManager.on('scan-complete', scanComplete);

    await (nodeManager as unknown as {
      handleScanComplete: (data: { nodeId: string; hostCount: number }) => Promise<void>;
    }).handleScanComplete({
      nodeId: 'node-a',
      hostCount: 12,
    });

    expect(scanComplete).toHaveBeenCalledWith({
      nodeId: 'node-a',
      hostCount: 12,
    });
  });

  it('handles heartbeat interval paths: stale-node processing and interval-level errors', async () => {
    jest.useFakeTimers();
    nodeManager.shutdown();

    mockedNodeModel.markStaleNodesOffline.mockResolvedValueOnce(1);
    mockedNodeModel.getOfflineNodes.mockResolvedValueOnce([
      { id: 'offline-a' },
      { id: 'connected-a' },
    ] as unknown as never);

    hostAggregator.markNodeHostsUnreachable
      .mockRejectedValueOnce(new Error('mark fail'))
      .mockResolvedValue(undefined);

    nodeManager = new NodeManager(hostAggregator as unknown as never);
    (nodeManager as unknown as {
      connections: Map<string, { ws: WebSocket; nodeId: string; location: string; registeredAt: Date }>;
    }).connections.set('connected-a', {
      nodeId: 'connected-a',
      ws: createMockWs().ws,
      location: 'Lab',
      registeredAt: new Date(),
    });

    await jest.advanceTimersByTimeAsync(config.nodeHeartbeatInterval + 5);
    expect(mockedNodeModel.markStaleNodesOffline).toHaveBeenCalled();
    expect(mockedNodeModel.getOfflineNodes).toHaveBeenCalled();
    expect(hostAggregator.markNodeHostsUnreachable).toHaveBeenCalledWith('offline-a');
    expect(mockedLogger.error).toHaveBeenCalledWith('Failed to mark offline node hosts as unreachable', {
      nodeId: 'offline-a',
      error: expect.any(Error),
    });

    mockedNodeModel.markStaleNodesOffline.mockRejectedValueOnce(new Error('interval boom'));
    await jest.advanceTimersByTimeAsync(config.nodeHeartbeatInterval + 5);
    expect(mockedLogger.error).toHaveBeenCalledWith('Error in heartbeat check', {
      error: expect.any(Error),
    });
  });
});
