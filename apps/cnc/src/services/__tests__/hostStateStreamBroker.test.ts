import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type { AuthContext } from '../../types/auth';
import { HostStateStreamBroker } from '../hostStateStreamBroker';

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
  readyState: number;
  on: jest.Mock;
  send: jest.Mock;
  close: jest.Mock;
};

function createMockWs(): {
  ws: WebSocket;
  mock: MockWs;
  handlers: Record<string, (...args: unknown[]) => void>;
} {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const mock: MockWs = {
    readyState: WebSocket.OPEN,
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    send: jest.fn(),
    close: jest.fn(),
  };

  return { ws: mock as unknown as WebSocket, mock, handlers };
}

function parseSentPayload(sendCallArg: unknown): Record<string, unknown> {
  if (typeof sendCallArg !== 'string') {
    return {};
  }

  return JSON.parse(sendCallArg) as Record<string, unknown>;
}

describe('HostStateStreamBroker', () => {
  const auth: AuthContext = {
    sub: 'mobile-client',
    roles: ['operator'],
    claims: {},
  };

  it('sends non-mutating connected event and tracks connection close metadata', () => {
    const hostAggregator = new EventEmitter();
    const broker = new HostStateStreamBroker(hostAggregator as unknown as never);
    const { ws, mock, handlers } = createMockWs();

    broker.handleConnection(ws, auth);

    expect(mock.send).toHaveBeenCalledTimes(1);
    const connectedPayload = parseSentPayload(mock.send.mock.calls[0]?.[0]);
    expect(connectedPayload).toMatchObject({
      type: 'connected',
      changed: false,
      payload: { subscriber: 'mobile-client' },
    });

    handlers.close?.(1006, Buffer.from('abnormal closure', 'utf8'));

    expect(broker.getStats()).toMatchObject({
      activeClients: 0,
      totalConnections: 1,
      totalDisconnects: 1,
      closeCodes: { '1006': 1 },
      closeReasons: { 'abnormal closure': 1 },
    });
  });

  it('broadcasts host mutation events in source order for connected clients', () => {
    const hostAggregator = new EventEmitter();
    const broker = new HostStateStreamBroker(hostAggregator as unknown as never);
    const { ws, mock } = createMockWs();

    broker.handleConnection(ws, auth);

    hostAggregator.emit('host-added', {
      nodeId: 'node-1',
      fullyQualifiedName: 'office-pc@home',
      host: { name: 'office-pc', status: 'awake' },
    });
    hostAggregator.emit('host-updated', {
      nodeId: 'node-1',
      fullyQualifiedName: 'office-pc@home',
      host: { name: 'office-pc', status: 'asleep' },
    });
    hostAggregator.emit('host-removed', {
      nodeId: 'node-1',
      name: 'office-pc',
    });

    const eventTypes = mock.send.mock.calls
      .slice(1)
      .map((call) => parseSentPayload(call[0]).type);

    expect(eventTypes).toEqual(['host.discovered', 'host.updated', 'host.removed']);
    expect(broker.getStats()).toMatchObject({
      events: {
        totalBroadcasts: 3,
        deliveries: 3,
        byType: {
          'host.discovered': 1,
          'host.updated': 1,
          'host.removed': 1,
        },
      },
    });
  });

  it('tracks dropped broadcasts when no subscribers are connected', () => {
    const hostAggregator = new EventEmitter();
    const broker = new HostStateStreamBroker(hostAggregator as unknown as never);

    hostAggregator.emit('node-hosts-unreachable', {
      nodeId: 'node-1',
      count: 2,
    });

    expect(broker.getStats()).toMatchObject({
      events: {
        totalBroadcasts: 1,
        droppedNoSubscribers: 1,
        deliveries: 0,
      },
    });
  });

  it('records websocket errors and send failures', () => {
    const hostAggregator = new EventEmitter();
    const broker = new HostStateStreamBroker(hostAggregator as unknown as never);
    const { ws, mock, handlers } = createMockWs();

    broker.handleConnection(ws, auth);

    mock.send.mockImplementation(() => {
      throw new Error('send failed');
    });

    hostAggregator.emit('host-updated', {
      nodeId: 'node-2',
      fullyQualifiedName: 'studio-pc@hq',
      host: { name: 'studio-pc', status: 'awake' },
    });
    handlers.error?.(new Error('socket failure'));

    expect(broker.getStats()).toMatchObject({
      activeClients: 0,
      totalErrors: 1,
      events: {
        totalBroadcasts: 1,
        sendFailures: 1,
      },
    });
  });

  it('closes all clients and detaches listeners on shutdown', () => {
    const hostAggregator = new EventEmitter();
    const broker = new HostStateStreamBroker(hostAggregator as unknown as never);
    const first = createMockWs();
    const second = createMockWs();

    broker.handleConnection(first.ws, auth);
    broker.handleConnection(second.ws, auth);
    broker.shutdown();

    expect(first.mock.close).toHaveBeenCalledWith(1000, 'Server shutdown');
    expect(second.mock.close).toHaveBeenCalledWith(1000, 'Server shutdown');
    expect(broker.getStats().activeClients).toBe(0);
  });
});
