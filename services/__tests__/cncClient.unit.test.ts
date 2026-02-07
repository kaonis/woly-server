import { EventEmitter } from 'events';

const mockAxiosPost = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: (...args: unknown[]) => mockAxiosPost(...args),
  },
}));

const mockedAgentConfig = {
  mode: 'agent' as const,
  cncUrl: 'ws://cnc.example',
  nodeId: 'node-1',
  location: 'lab',
  authToken: 'bootstrap-token',
  publicUrl: '',
  sessionTokenUrl: '',
  sessionTokenRequestTimeoutMs: 5000,
  sessionTokenRefreshBufferSeconds: 60,
  wsAllowQueryTokenFallback: false,
  heartbeatInterval: 30000,
  reconnectInterval: 1000,
  maxReconnectAttempts: 3,
};

jest.mock('../../config/agent', () => ({
  agentConfig: mockedAgentConfig,
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockSockets: MockWebSocket[] = [];

class MockWebSocket extends EventEmitter {
  public static OPEN = 1;
  public static CLOSED = 3;
  public readyState = MockWebSocket.OPEN;
  public sentMessages: string[] = [];

  constructor(
    public readonly url: string,
    public readonly protocols?: string | string[],
    public readonly options?: { headers?: Record<string, string> }
  ) {
    super();
    mockSockets.push(this);
  }

  public send(data: string): void {
    this.sentMessages.push(data);
  }

  public close(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', code, Buffer.from(reason));
  }
}

jest.mock('ws', () => ({
  __esModule: true,
  default: MockWebSocket,
}));

import { CncClient } from '../cncClient';
import { logger } from '../../utils/logger';

describe('CncClient Phase 1 auth lifecycle', () => {
  let client: CncClient;

  const flushPromises = async (): Promise<void> => {
    await Promise.resolve();
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockSockets.length = 0;
    mockedAgentConfig.sessionTokenUrl = '';
    mockedAgentConfig.wsAllowQueryTokenFallback = false;
    mockedAgentConfig.reconnectInterval = 1000;
    mockedAgentConfig.maxReconnectAttempts = 3;
    client = new CncClient();
    mockAxiosPost.mockReset();
  });

  afterEach(() => {
    client.disconnect();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('uses Authorization/subprotocol auth and no query token by default', async () => {
    await client.connect();

    expect(mockSockets).toHaveLength(1);
    expect(mockSockets[0].url).toBe('ws://cnc.example/ws/node');
    expect(mockSockets[0].protocols).toEqual(['bearer', 'bootstrap-token']);
    expect(mockSockets[0].options?.headers?.Authorization).toBe('Bearer bootstrap-token');
  });

  it('optionally keeps query token fallback for transition mode', async () => {
    mockedAgentConfig.wsAllowQueryTokenFallback = true;
    await client.connect();

    expect(mockSockets).toHaveLength(1);
    expect(mockSockets[0].url).toBe('ws://cnc.example/ws/node?token=bootstrap-token');
  });

  it('refreshes session token before reconnect after auth-expired close', async () => {
    mockedAgentConfig.sessionTokenUrl = 'https://cnc.example/api/nodes/session-token';
    mockAxiosPost
      .mockResolvedValueOnce({ data: { token: 'session-1', expiresInSeconds: 120 } })
      .mockResolvedValueOnce({ data: { token: 'session-2', expiresInSeconds: 120 } });

    await client.connect();
    expect(mockSockets[0].options?.headers?.Authorization).toBe('Bearer session-1');

    mockSockets[0].emit('close', 4001, Buffer.from('token expired'));
    jest.advanceTimersByTime(mockedAgentConfig.reconnectInterval);
    await flushPromises();
    await flushPromises();

    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    expect(mockSockets).toHaveLength(2);
    expect(mockSockets[1].options?.headers?.Authorization).toBe('Bearer session-2');
  });

  it('emits auth-revoked when session token minting is rejected', async () => {
    mockedAgentConfig.sessionTokenUrl = 'https://cnc.example/api/nodes/session-token';
    mockAxiosPost.mockRejectedValueOnce({ response: { status: 403 } });

    const onRevoked = jest.fn();
    client.on('auth-revoked', onRevoked);

    await client.connect();

    expect(onRevoked).toHaveBeenCalledTimes(1);
    expect(mockSockets).toHaveLength(0);
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });

  it('emits auth-unavailable when session token service is unreachable', async () => {
    mockedAgentConfig.sessionTokenUrl = 'https://cnc.example/api/nodes/session-token';
    mockAxiosPost.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const onUnavailable = jest.fn();
    client.on('auth-unavailable', onUnavailable);

    await client.connect();

    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(mockSockets).toHaveLength(0);
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });

  it('rejects malformed inbound command payloads with structured validation logs', async () => {
    await client.connect();

    mockSockets[0].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'wake',
          data: { hostName: 'PC-01', mac: 'AA:BB:CC:DD:EE:FF' },
        })
      )
    );

    expect(logger.error).toHaveBeenCalledWith(
      'Protocol validation failed',
      expect.objectContaining({
        direction: 'inbound',
        messageType: 'wake',
      })
    );
  });

  it('rejects unknown inbound command types without crashing the dispatcher loop', async () => {
    await client.connect();

    const onWake = jest.fn();
    client.on('command:wake', onWake);

    mockSockets[0].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'power-cycle',
          commandId: 'cmd-unknown',
          data: {},
        })
      )
    );

    expect(onWake).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Protocol validation failed',
      expect.objectContaining({
        direction: 'inbound',
        messageType: 'power-cycle',
      })
    );
  });

  it('rejects malformed outbound node messages and logs validation errors', async () => {
    await client.connect();

    client.send({
      type: 'host-discovered',
      data: {
        nodeId: 'node-1',
        name: 'Host-01',
        mac: 'AA:BB:CC:DD:EE:FF',
        ip: '192.168.1.50',
        status: ('invalid-status' as unknown) as 'awake',
        lastSeen: null,
        discovered: 1,
      },
    });

    expect(mockSockets[0].sentMessages).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(
      'Protocol validation failed',
      expect.objectContaining({
        direction: 'outbound',
        messageType: 'host-discovered',
      })
    );
  });
});
