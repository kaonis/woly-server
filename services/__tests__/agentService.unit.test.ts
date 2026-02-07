import { EventEmitter } from 'events';
import { AgentService } from '../agentService';
import { cncClient } from '../cncClient';
import { Host } from '../../types';

type MockCncClient = {
  send: jest.Mock;
  isConnected: jest.Mock;
  connect: jest.Mock;
  disconnect: jest.Mock;
} & EventEmitter;

jest.mock('../cncClient', () => ({
  cncClient: Object.assign(new EventEmitter(), {
    send: jest.fn(),
    isConnected: jest.fn(() => true),
    connect: jest.fn(),
    disconnect: jest.fn(),
  }),
}));

jest.mock('../../config/agent', () => ({
  agentConfig: {
    nodeId: 'node-1',
    location: 'lab',
    cncUrl: 'ws://localhost:8080',
    authToken: 'token',
    reconnectInterval: 1000,
    maxReconnectAttempts: 3,
  },
  validateAgentConfig: jest.fn(),
}));

describe('AgentService command handlers', () => {
  let service: AgentService;
  let mockCncClient: MockCncClient;
  let hostDbMock: {
    syncWithNetwork: jest.Mock;
    getAllHosts: jest.Mock;
    getHost: jest.Mock;
    updateHost: jest.Mock;
    deleteHost: jest.Mock;
  };

  const sampleHost: Host = {
    name: 'PHANTOM-MBP',
    mac: 'AA:BB:CC:DD:EE:FF',
    ip: '192.168.1.100',
    status: 'awake',
    lastSeen: null,
    discovered: 1,
    pingResponsive: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockCncClient = (cncClient as unknown) as MockCncClient;
    service = new AgentService();
    ((service as unknown) as { isRunning: boolean }).isRunning = true;
    hostDbMock = {
      syncWithNetwork: jest.fn().mockResolvedValue(undefined),
      getAllHosts: jest.fn().mockResolvedValue([sampleHost]),
      getHost: jest.fn(),
      updateHost: jest.fn().mockResolvedValue(undefined),
      deleteHost: jest.fn().mockResolvedValue(undefined),
    };
    ((service as unknown) as { hostDb: unknown }).hostDb = hostDbMock;
  });

  it('runs scan immediately when immediate=true', async () => {
    await ((service as unknown) as {
      handleScanCommand: (command: unknown) => Promise<void>;
    }).handleScanCommand({
      type: 'scan',
      commandId: 'cmd-immediate',
      data: { immediate: true },
    });

    expect(hostDbMock.syncWithNetwork).toHaveBeenCalledTimes(1);
    expect(hostDbMock.getAllHosts).toHaveBeenCalledTimes(1);
    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'command-result',
        data: expect.objectContaining({
          commandId: 'cmd-immediate',
          success: true,
          message: 'Scan completed, found 1 hosts',
        }),
      })
    );
  });

  it('schedules background scan when immediate=false', async () => {
    jest.useFakeTimers();

    await ((service as unknown) as {
      handleScanCommand: (command: unknown) => Promise<void>;
    }).handleScanCommand({
      type: 'scan',
      commandId: 'cmd-background',
      data: { immediate: false },
    });

    expect(hostDbMock.syncWithNetwork).not.toHaveBeenCalled();
    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'command-result',
        data: expect.objectContaining({
          commandId: 'cmd-background',
          success: true,
          message: 'Background scan scheduled',
        }),
      })
    );

    jest.runOnlyPendingTimers();
    await Promise.resolve();
    expect(hostDbMock.syncWithNetwork).toHaveBeenCalledTimes(1);
  });

  it('supports rename-safe update-host using currentName', async () => {
    const updatedHost: Host = { ...sampleHost, name: 'RENAMED-HOST', ip: '192.168.1.101' };
    hostDbMock.getHost.mockResolvedValueOnce(sampleHost).mockResolvedValueOnce(updatedHost);
    const sendHostUpdatedSpy = jest
      .spyOn((service as unknown) as { sendHostUpdated: (host: Host) => void }, 'sendHostUpdated')
      .mockImplementation(() => {});

    await ((service as unknown) as {
      handleUpdateHostCommand: (command: unknown) => Promise<void>;
    }).handleUpdateHostCommand({
      type: 'update-host',
      commandId: 'cmd-rename',
      data: {
        currentName: 'PHANTOM-MBP',
        name: 'RENAMED-HOST',
        ip: '192.168.1.101',
      },
    });

    expect(hostDbMock.getHost).toHaveBeenNthCalledWith(1, 'PHANTOM-MBP');
    expect(hostDbMock.updateHost).toHaveBeenCalledWith('PHANTOM-MBP', {
      name: 'RENAMED-HOST',
      mac: undefined,
      ip: '192.168.1.101',
      status: undefined,
    });
    expect(hostDbMock.getHost).toHaveBeenNthCalledWith(2, 'RENAMED-HOST');
    expect(sendHostUpdatedSpy).toHaveBeenCalledWith(updatedHost);
    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'command-result',
        data: expect.objectContaining({
          commandId: 'cmd-rename',
          success: true,
          message: 'Host PHANTOM-MBP renamed to RENAMED-HOST and updated successfully',
        }),
      })
    );
  });
});
