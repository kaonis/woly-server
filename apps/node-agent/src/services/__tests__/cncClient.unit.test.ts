import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import os from 'os';
import { join } from 'path';

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

const runtimeTelemetryMock = {
  recordReconnectScheduled: jest.fn(),
  recordReconnectFailed: jest.fn(),
  recordAuthExpired: jest.fn(),
  recordAuthRevoked: jest.fn(),
  recordAuthUnavailable: jest.fn(),
  recordProtocolValidationFailure: jest.fn(),
  recordProtocolUnsupported: jest.fn(),
  recordProtocolError: jest.fn(),
};

jest.mock('../runtimeTelemetry', () => ({
  runtimeTelemetry: runtimeTelemetryMock,
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
import { PROTOCOL_VERSION } from '@kaonis/woly-protocol';

const nodeAgentPackage = JSON.parse(
  readFileSync(join(__dirname, '../../../package.json'), 'utf-8')
) as { version: string };

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
    jest.restoreAllMocks();
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

  it('includes protocol version metadata in registration payload', async () => {
    await client.connect();
    mockSockets[0].emit('open');

    const registrationMessage = JSON.parse(mockSockets[0].sentMessages[0]);
    expect(registrationMessage.type).toBe('register');
    expect(registrationMessage.data.metadata.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(registrationMessage.data.metadata.version).toBe(nodeAgentPackage.version);
    expect(registrationMessage.data.metadata.networkInfo.subnet).toEqual(expect.any(String));
    expect(registrationMessage.data.metadata.networkInfo.gateway).toEqual(expect.any(String));
  });

  it('derives subnet and gateway metadata from active network interface', async () => {
    jest.spyOn(os, 'networkInterfaces').mockReturnValue({
      en0: [
        {
          address: '192.168.50.24',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: 'aa:bb:cc:dd:ee:ff',
          internal: false,
          cidr: '192.168.50.24/24',
        },
      ] as any[],
    });

    await client.connect();
    mockSockets[0].emit('open');

    const registrationMessage = JSON.parse(mockSockets[0].sentMessages[0]);
    expect(registrationMessage.data.metadata.networkInfo).toEqual({
      subnet: '192.168.50.24/24',
      gateway: '192.168.50.1',
    });
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
    expect(runtimeTelemetryMock.recordAuthExpired).toHaveBeenCalledTimes(1);
    expect(runtimeTelemetryMock.recordReconnectScheduled).toHaveBeenCalledTimes(1);
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
    expect(runtimeTelemetryMock.recordAuthRevoked).toHaveBeenCalledTimes(1);
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
    expect(runtimeTelemetryMock.recordAuthUnavailable).toHaveBeenCalledTimes(1);
  });

  it('records reconnect failure when max reconnect attempts are exhausted', async () => {
    mockedAgentConfig.maxReconnectAttempts = 1;
    await client.connect();

    const onReconnectFailed = jest.fn();
    client.on('reconnect-failed', onReconnectFailed);

    mockSockets[0].emit('close', 1006, Buffer.from('network down'));
    jest.advanceTimersByTime(mockedAgentConfig.reconnectInterval);
    await flushPromises();
    await flushPromises();

    expect(mockSockets).toHaveLength(2);
    mockSockets[1].emit('close', 1006, Buffer.from('network down'));

    expect(onReconnectFailed).toHaveBeenCalledTimes(1);
    expect(runtimeTelemetryMock.recordReconnectFailed).toHaveBeenCalledTimes(1);
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
    expect(runtimeTelemetryMock.recordProtocolValidationFailure).toHaveBeenCalledWith('inbound');
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
        validationIssues: expect.any(Array),
      })
    );
    expect(runtimeTelemetryMock.recordProtocolValidationFailure).toHaveBeenCalledWith('outbound');
  });

  it('allows outbound host payloads with pingResponsive set to null', async () => {
    await client.connect();

    client.send({
      type: 'host-updated',
      data: {
        nodeId: 'node-1',
        name: 'Host-01',
        mac: 'AA:BB:CC:DD:EE:FF',
        ip: '192.168.1.50',
        status: 'awake',
        lastSeen: null,
        discovered: 1,
        pingResponsive: (null as unknown) as number,
      },
    });

    expect(mockSockets[0].sentMessages).toHaveLength(1);
  });

  it('redacts auth tokens in validation error logs', async () => {
    await client.connect();

    client.send({
      type: 'register',
      data: {
        nodeId: 'node-1',
        name: '',
        location: 'lab',
        authToken: 'secret-token',
        metadata: {
          version: '1.0.0',
          platform: 'darwin',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: {
            subnet: '192.168.1.0/24',
            gateway: '192.168.1.1',
          },
        },
      },
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Protocol validation failed',
      expect.objectContaining({
        direction: 'outbound',
        messageType: 'register',
        rawData: expect.objectContaining({
          data: expect.objectContaining({
            authToken: '[REDACTED]',
          }),
        }),
        validationIssues: expect.any(Array),
      })
    );
  });

  it('rejects unsupported protocol versions during registration handshake', async () => {
    await client.connect();
    mockSockets[0].emit('open');

    const onProtocolUnsupported = jest.fn();
    client.on('protocol-unsupported', onProtocolUnsupported);

    mockSockets[0].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'registered',
          data: {
            nodeId: 'node-1',
            heartbeatInterval: 30000,
            protocolVersion: '9.9.9',
          },
        })
      )
    );

    expect(onProtocolUnsupported).toHaveBeenCalledWith(
      expect.objectContaining({
        receivedProtocolVersion: '9.9.9',
      })
    );
    expect(client.isConnected()).toBe(false);
    expect(runtimeTelemetryMock.recordProtocolUnsupported).toHaveBeenCalledTimes(1);
  });

  it('disables reconnection after protocol version mismatch to prevent infinite loop', async () => {
    await client.connect();
    mockSockets[0].emit('open');

    const onReconnectDisabled = jest.fn();
    client.on('reconnect-disabled', onReconnectDisabled);

    // Send unsupported protocol version
    mockSockets[0].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'registered',
          data: {
            nodeId: 'node-1',
            heartbeatInterval: 30000,
            protocolVersion: '9.9.9',
          },
        })
      )
    );

    // Trigger close event
    await flushPromises();

    // Verify reconnection is disabled
    expect(onReconnectDisabled).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'Reconnection disabled (e.g., protocol version mismatch)'
    );

    // Advance timers to verify no reconnection attempt
    jest.advanceTimersByTime(mockedAgentConfig.reconnectInterval + 1000);
    await flushPromises();

    // Should still have only one socket (no reconnection)
    expect(mockSockets).toHaveLength(1);
  });

  it('handles C&C protocol error frames', async () => {
    await client.connect();
    const onProtocolError = jest.fn();
    client.on('protocol-error', onProtocolError);

    mockSockets[0].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'error',
          message: 'Invalid protocol payload',
        })
      )
    );

    expect(onProtocolError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Invalid protocol payload',
      })
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Received protocol error from C&C',
      expect.objectContaining({
        message: 'Invalid protocol payload',
      })
    );
    expect(runtimeTelemetryMock.recordProtocolError).toHaveBeenCalledTimes(1);
  });
});
