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

  it('does not schedule reconnect after intentional disconnect', async () => {
    await client.connect();

    const onReconnectDisabled = jest.fn();
    client.on('reconnect-disabled', onReconnectDisabled);

    client.disconnect();

    expect(onReconnectDisabled).toHaveBeenCalledTimes(1);
    expect(runtimeTelemetryMock.recordReconnectScheduled).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
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

  it('dispatches ping-host commands to the node-agent command handler', async () => {
    await client.connect();

    const onPingHost = jest.fn();
    client.on('command:ping-host', onPingHost);

    mockSockets[0].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'ping-host',
          commandId: 'cmd-ping-1',
          data: {
            hostName: 'PC-01',
            mac: 'AA:BB:CC:DD:EE:FF',
            ip: '192.168.1.50',
          },
        })
      )
    );

    expect(onPingHost).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ping-host',
        commandId: 'cmd-ping-1',
      })
    );
  });

  it('dispatches scan-host-ports commands to the node-agent command handler', async () => {
    await client.connect();

    const onScanHostPorts = jest.fn();
    client.on('command:scan-host-ports', onScanHostPorts);

    mockSockets[0].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'scan-host-ports',
          commandId: 'cmd-port-scan-1',
          data: {
            hostName: 'PC-01',
            mac: 'AA:BB:CC:DD:EE:FF',
            ip: '192.168.1.50',
            ports: [22, 443],
            timeoutMs: 250,
          },
        })
      )
    );

    expect(onScanHostPorts).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'scan-host-ports',
        commandId: 'cmd-port-scan-1',
      })
    );
  });

  it('dispatches sleep-host commands to the node-agent command handler', async () => {
    await client.connect();

    const onSleepHost = jest.fn();
    client.on('command:sleep-host', onSleepHost);

    mockSockets[0].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'sleep-host',
          commandId: 'cmd-sleep-1',
          data: {
            hostName: 'PC-01',
            mac: 'AA:BB:CC:DD:EE:FF',
            ip: '192.168.1.50',
            confirmation: 'sleep',
          },
        })
      )
    );

    expect(onSleepHost).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sleep-host',
        commandId: 'cmd-sleep-1',
      })
    );
  });

  it('dispatches shutdown-host commands to the node-agent command handler', async () => {
    await client.connect();

    const onShutdownHost = jest.fn();
    client.on('command:shutdown-host', onShutdownHost);

    mockSockets[0].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'shutdown-host',
          commandId: 'cmd-shutdown-1',
          data: {
            hostName: 'PC-01',
            mac: 'AA:BB:CC:DD:EE:FF',
            ip: '192.168.1.50',
            confirmation: 'shutdown',
          },
        })
      )
    );

    expect(onShutdownHost).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'shutdown-host',
        commandId: 'cmd-shutdown-1',
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

  it('short-circuits connect when a connect attempt is already in progress', async () => {
    ((client as unknown) as { isConnecting: boolean }).isConnecting = true;

    await client.connect();

    expect(mockSockets).toHaveLength(0);
    expect(logger.debug).toHaveBeenCalledWith('Already connecting or connected to C&C');
  });

  it('clears heartbeat/reconnect timers on disconnect', async () => {
    ((client as unknown) as { heartbeatTimer: NodeJS.Timeout | null }).heartbeatTimer = setInterval(
      () => {},
      1_000
    );
    ((client as unknown) as { reconnectTimer: NodeJS.Timeout | null }).reconnectTimer = setTimeout(
      () => {},
      1_000
    );

    client.disconnect();

    expect(((client as unknown) as { heartbeatTimer: NodeJS.Timeout | null }).heartbeatTimer).toBeNull();
    expect(((client as unknown) as { reconnectTimer: NodeJS.Timeout | null }).reconnectTimer).toBeNull();
  });

  it('warns when sending while disconnected', () => {
    client.send({
      type: 'heartbeat',
      data: {
        nodeId: 'node-1',
        timestamp: new Date(),
      },
    });

    expect(logger.warn).toHaveBeenCalledWith('Cannot send message: not connected to C&C', {
      messageType: 'heartbeat',
    });
  });

  it('handles websocket send failures gracefully', async () => {
    await client.connect();
    mockSockets[0].send = () => {
      throw new Error('socket write failed');
    };

    client.send({
      type: 'heartbeat',
      data: {
        nodeId: 'node-1',
        timestamp: new Date(),
      },
    });

    expect(logger.error).toHaveBeenCalledWith('Failed to send message to C&C', {
      error: expect.any(Error),
      messageType: 'heartbeat',
    });
  });

  it('falls back to default network metadata when no external IPv4 interface exists', () => {
    jest.spyOn(os, 'networkInterfaces').mockReturnValue({
      lo0: [
        {
          address: '127.0.0.1',
          netmask: '255.0.0.0',
          family: 'IPv4',
          mac: '00:00:00:00:00:00',
          internal: true,
          cidr: '127.0.0.1/8',
        },
      ] as any[],
    });

    const networkInfo = ((client as unknown) as { resolveNetworkInfo: () => { subnet: string; gateway: string } })
      .resolveNetworkInfo();
    expect(networkInfo).toEqual({
      subnet: '0.0.0.0/0',
      gateway: '0.0.0.0',
    });
  });

  it('returns fallback gateway for malformed or out-of-range addresses', () => {
    const deriveGatewayFromAddress = ((client as unknown) as { deriveGatewayFromAddress: (address: string) => string })
      .deriveGatewayFromAddress;

    expect(deriveGatewayFromAddress('invalid')).toBe('0.0.0.0');
    expect(deriveGatewayFromAddress('300.1.1.1')).toBe('0.0.0.0');
  });

  it('logs structured validation details for malformed JSON frames', async () => {
    await client.connect();

    mockSockets[0].emit('message', Buffer.from('{invalid-json'));

    expect(logger.error).toHaveBeenCalledWith(
      'Protocol validation failed',
      expect.objectContaining({
        direction: 'inbound',
        messageType: 'malformed-json',
      })
    );
  });

  it('dispatches wake/scan/update/delete command frames', async () => {
    await client.connect();
    const onWake = jest.fn();
    const onScan = jest.fn();
    const onUpdate = jest.fn();
    const onDelete = jest.fn();
    client.on('command:wake', onWake);
    client.on('command:scan', onScan);
    client.on('command:update-host', onUpdate);
    client.on('command:delete-host', onDelete);

    mockSockets[0].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'wake',
          commandId: 'wake-1',
          data: { hostName: 'PC-01', mac: 'AA:BB:CC:DD:EE:FF' },
        })
      )
    );
    mockSockets[0].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'scan',
          commandId: 'scan-1',
          data: { immediate: true },
        })
      )
    );
    mockSockets[0].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'update-host',
          commandId: 'update-1',
          data: { name: 'PC-01' },
        })
      )
    );
    mockSockets[0].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'delete-host',
          commandId: 'delete-1',
          data: { name: 'PC-01' },
        })
      )
    );

    expect(onWake).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('catches and logs listener exceptions while dispatching commands', async () => {
    await client.connect();
    client.on('command:wake', () => {
      throw new Error('handler exploded');
    });

    mockSockets[0].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'wake',
          commandId: 'wake-err',
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

  it('accepts registered frames without protocolVersion and starts heartbeat', async () => {
    await client.connect();
    mockSockets[0].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'registered',
          data: {
            nodeId: 'node-1',
            heartbeatInterval: 250,
          },
        })
      )
    );

    expect(logger.warn).toHaveBeenCalledWith(
      'Registration missing protocolVersion; assuming compatibility fallback',
      expect.objectContaining({
        supportedProtocolVersions: expect.any(Array),
      })
    );
    expect(client.isConnected()).toBe(true);
  });

  it('records revoked-auth close events and disables reconnect only when flagged', async () => {
    await client.connect();
    mockSockets[0].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'registered',
          data: {
            nodeId: 'node-1',
            heartbeatInterval: 250,
            protocolVersion: PROTOCOL_VERSION,
          },
        })
      )
    );
    const onRevoked = jest.fn();
    client.on('auth-revoked', onRevoked);

    mockSockets[0].emit('close', 4003, Buffer.from('revoked'));

    expect(onRevoked).toHaveBeenCalledTimes(1);
    expect(runtimeTelemetryMock.recordAuthRevoked).toHaveBeenCalledTimes(1);
    expect(((client as unknown) as { heartbeatTimer: NodeJS.Timeout | null }).heartbeatTimer).toBeNull();
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });

  it('does not double-schedule reconnect when timer already exists', () => {
    ((client as unknown) as { scheduleReconnect: () => void }).scheduleReconnect();
    ((client as unknown) as { scheduleReconnect: () => void }).scheduleReconnect();

    expect(runtimeTelemetryMock.recordReconnectScheduled).toHaveBeenCalledTimes(1);
  });

  it('reuses cached session tokens until refresh window and then refreshes', async () => {
    mockedAgentConfig.sessionTokenUrl = 'https://cnc.example/api/nodes/session-token';
    ((client as unknown) as { sessionToken: { token: string; expiresAtMs: number | null } | null }).sessionToken = {
      token: 'test-cached',
      expiresAtMs: Date.now() + 120_000,
    };

    await expect(
      ((client as unknown) as { resolveConnectionToken: () => Promise<string> }).resolveConnectionToken()
    ).resolves.toBe('test-cached');
    expect(mockAxiosPost).not.toHaveBeenCalled();

    ((client as unknown) as { sessionToken: { token: string; expiresAtMs: number | null } | null }).sessionToken = {
      token: 'test-expiring',
      expiresAtMs: Date.now() + 500,
    };
    mockAxiosPost.mockResolvedValueOnce({ data: { token: 'test-refresh', expiresInSeconds: 120 } });

    await expect(
      ((client as unknown) as { resolveConnectionToken: () => Promise<string> }).resolveConnectionToken()
    ).resolves.toBe('test-refresh');
    expect(logger.info).toHaveBeenCalledWith('Session token nearing expiry, requesting refresh');
  });

  it('validates session token response shape and expiry parsing', () => {
    const parseSessionTokenResponse = (client as unknown) as {
      parseSessionTokenResponse: (data: unknown) => { token: string; expiresAtMs: number | null };
    };

    expect(() => parseSessionTokenResponse.parseSessionTokenResponse(null)).toThrow(
      'Session token response is invalid'
    );
    expect(() => parseSessionTokenResponse.parseSessionTokenResponse({})).toThrow(
      'Session token response missing token'
    );

    expect(
      parseSessionTokenResponse.parseSessionTokenResponse({
        token: 'ok',
        expiresAt: 1_700_000_000,
      })
    ).toEqual({
      token: 'ok',
      expiresAtMs: 1_700_000_000_000,
    });

    const parsed = parseSessionTokenResponse.parseSessionTokenResponse({
      token: 'ok',
      expiresInSeconds: 30,
    });
    expect(parsed.token).toBe('ok');
    expect(parsed.expiresAtMs).toEqual(expect.any(Number));
  });

  it('handles bootstrap token expiry failures as auth-expired', () => {
    const onExpired = jest.fn();
    client.on('auth-expired', onExpired);

    ((client as unknown) as { handleSessionTokenError: (error: unknown) => void }).handleSessionTokenError({
      response: { status: 401 },
    });

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(runtimeTelemetryMock.recordAuthExpired).toHaveBeenCalledTimes(1);
  });

  it('exposes defensive helper behavior for message typing/correlation and log sanitization', () => {
    const helpers = (client as unknown) as {
      extractHttpStatus: (error: unknown) => number | null;
      extractMessageType: (payload: unknown) => string;
      extractCorrelationId: (payload: unknown) => string;
      sanitizeProtocolLogData: (value: unknown, depth?: number) => unknown;
    };

    expect(helpers.extractHttpStatus('not-an-error')).toBeNull();
    expect(helpers.extractMessageType(null)).toBe('unknown');
    expect(helpers.extractCorrelationId({ data: { commandId: 'nested-cmd' } })).toBe('nested-cmd');
    expect(helpers.extractCorrelationId('missing')).toEqual(expect.any(String));

    const deepPayload = { a: { b: { c: { d: { e: { f: 'too-deep' } } } } } };
    const sanitizedDeep = helpers.sanitizeProtocolLogData(deepPayload) as Record<string, unknown>;
    expect(sanitizedDeep.a).toEqual(expect.objectContaining({ b: expect.any(Object) }));
    expect(helpers.sanitizeProtocolLogData([1, 'two', { token: 'abc' }])).toEqual([
      1,
      'two',
      { token: '[REDACTED]' },
    ]);
    expect(helpers.sanitizeProtocolLogData(Symbol('raw'))).toBe('Symbol(raw)');
  });
});
