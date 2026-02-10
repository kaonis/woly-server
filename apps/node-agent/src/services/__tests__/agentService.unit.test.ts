import { EventEmitter } from 'events';
import { AgentService } from '../agentService';
import { cncClient } from '../cncClient';
import { Host } from '../../types';
import { validateAgentConfig } from '../../config/agent';
import * as wakeOnLan from 'wake_on_lan';

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

jest.mock('wake_on_lan', () => ({
  wake: jest.fn(),
}));

describe('AgentService command handlers', () => {
  let service: AgentService;
  let mockCncClient: MockCncClient;
  let hostDbMock: {
    syncWithNetwork: jest.Mock;
    getAllHosts: jest.Mock;
    getHost: jest.Mock;
    getHostByMAC: jest.Mock;
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
    mockCncClient.removeAllListeners();
    service = new AgentService();
    hostDbMock = {
      syncWithNetwork: jest.fn().mockResolvedValue(undefined),
      getAllHosts: jest.fn().mockResolvedValue([sampleHost]),
      getHost: jest.fn(),
      getHostByMAC: jest.fn(),
      updateHost: jest.fn().mockResolvedValue(undefined),
      deleteHost: jest.fn().mockResolvedValue(undefined),
    };
    ((service as unknown) as { hostDb: unknown }).hostDb = hostDbMock;
    ((wakeOnLan.wake as unknown) as jest.Mock).mockImplementation(
      (_mac: string, callback: (error: Error | null) => void) => callback(null)
    );
  });

  it('starts and stops agent service lifecycle', async () => {
    await service.start();

    expect(validateAgentConfig).toHaveBeenCalledTimes(1);
    expect(mockCncClient.connect).toHaveBeenCalledTimes(1);
    expect(service.isActive()).toBe(true);

    service.stop();
    expect(mockCncClient.disconnect).toHaveBeenCalledTimes(1);
    expect(service.isActive()).toBe(false);
  });

  it('does not reconnect when already running', async () => {
    await service.start();
    await service.start();

    expect(mockCncClient.connect).toHaveBeenCalledTimes(1);
  });

  it('throws on start when config validation fails', async () => {
    ((validateAgentConfig as unknown) as jest.Mock).mockImplementationOnce(() => {
      throw new Error('bad config');
    });

    await expect(service.start()).rejects.toThrow('bad config');
    expect(mockCncClient.connect).not.toHaveBeenCalled();
  });

  it('does nothing on stop when service is not running', () => {
    service.stop();
    expect(mockCncClient.disconnect).not.toHaveBeenCalled();
  });

  it('handles successful wake command', async () => {
    hostDbMock.getHost.mockResolvedValueOnce(sampleHost);

    await ((service as unknown) as {
      handleWakeCommand: (command: unknown) => Promise<void>;
    }).handleWakeCommand({
      type: 'wake',
      commandId: 'cmd-wake-ok',
      data: { hostName: sampleHost.name, mac: sampleHost.mac },
    });

    expect(wakeOnLan.wake).toHaveBeenCalledWith(sampleHost.mac, expect.any(Function));
    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'command-result',
        data: expect.objectContaining({
          commandId: 'cmd-wake-ok',
          success: true,
          message: `Wake-on-LAN packet sent to ${sampleHost.name} (${sampleHost.mac})`,
        }),
      })
    );
  });

  it('sends failure result for wake when wake-on-lan fails', async () => {
    hostDbMock.getHost.mockResolvedValueOnce(undefined);
    hostDbMock.getHostByMAC.mockResolvedValueOnce(undefined);
    ((wakeOnLan.wake as unknown) as jest.Mock).mockImplementation(
      (_mac: string, callback: (error: Error | null) => void) =>
        callback(new Error('WOL send failed'))
    );

    await ((service as unknown) as {
      handleWakeCommand: (command: unknown) => Promise<void>;
    }).handleWakeCommand({
      type: 'wake',
      commandId: 'cmd-wake-missing',
      data: { hostName: 'UNKNOWN', mac: 'INVALID-MAC' },
    });

    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'command-result',
        data: expect.objectContaining({
          commandId: 'cmd-wake-missing',
          success: false,
          error: 'WOL send failed',
        }),
      })
    );
  });

  it('sends failure result for wake when wake-on-lan fails for known host', async () => {
    hostDbMock.getHost.mockResolvedValueOnce(sampleHost);
    ((wakeOnLan.wake as unknown) as jest.Mock).mockImplementation(
      (_mac: string, callback: (error: Error | null) => void) =>
        callback(new Error('WOL send failed'))
    );

    await ((service as unknown) as {
      handleWakeCommand: (command: unknown) => Promise<void>;
    }).handleWakeCommand({
      type: 'wake',
      commandId: 'cmd-wake-error',
      data: { hostName: sampleHost.name, mac: sampleHost.mac },
    });

    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'command-result',
        data: expect.objectContaining({
          commandId: 'cmd-wake-error',
          success: false,
          error: 'WOL send failed',
        }),
      })
    );
  });

  it('falls back to command MAC when hostname lookup fails', async () => {
    hostDbMock.getHost.mockResolvedValueOnce(undefined);
    hostDbMock.getHostByMAC.mockResolvedValueOnce(sampleHost);

    await ((service as unknown) as {
      handleWakeCommand: (command: unknown) => Promise<void>;
    }).handleWakeCommand({
      type: 'wake',
      commandId: 'cmd-wake-fallback-mac',
      data: { hostName: 'STALE-NAME', mac: sampleHost.mac },
    });

    expect(hostDbMock.getHost).toHaveBeenCalledWith('STALE-NAME');
    expect(hostDbMock.getHostByMAC).toHaveBeenCalledWith(sampleHost.mac);
    expect(wakeOnLan.wake).toHaveBeenCalledWith(sampleHost.mac, expect.any(Function));
    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'command-result',
        data: expect.objectContaining({
          commandId: 'cmd-wake-fallback-mac',
          success: true,
          message: `Wake-on-LAN packet sent to ${sampleHost.name} (${sampleHost.mac})`,
        }),
      })
    );
  });

  it('returns missing-db error for commands that require host database', async () => {
    ((service as unknown) as { hostDb: unknown }).hostDb = null;

    await ((service as unknown) as {
      handleWakeCommand: (command: unknown) => Promise<void>;
    }).handleWakeCommand({
      type: 'wake',
      commandId: 'cmd-wake-no-db',
      data: { hostName: 'PHANTOM-MBP', mac: 'AA:BB:CC:DD:EE:FF' },
    });

    await ((service as unknown) as {
      handleScanCommand: (command: unknown) => Promise<void>;
    }).handleScanCommand({
      type: 'scan',
      commandId: 'cmd-scan-no-db',
      data: { immediate: true },
    });

    await ((service as unknown) as {
      handleUpdateHostCommand: (command: unknown) => Promise<void>;
    }).handleUpdateHostCommand({
      type: 'update-host',
      commandId: 'cmd-update-no-db',
      data: { name: 'PHANTOM-MBP' },
    });

    await ((service as unknown) as {
      handleDeleteHostCommand: (command: unknown) => Promise<void>;
    }).handleDeleteHostCommand({
      type: 'delete-host',
      commandId: 'cmd-delete-no-db',
      data: { name: 'PHANTOM-MBP' },
    });

    expect(mockCncClient.send).toHaveBeenCalledTimes(4);
    expect(mockCncClient.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          commandId: 'cmd-wake-no-db',
          success: false,
          error: 'Host database not initialized',
        }),
      })
    );
    expect(mockCncClient.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          commandId: 'cmd-scan-no-db',
          success: false,
          error: 'Host database not initialized',
        }),
      })
    );
    expect(mockCncClient.send).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        data: expect.objectContaining({
          commandId: 'cmd-update-no-db',
          success: false,
          error: 'Host database not initialized',
        }),
      })
    );
    expect(mockCncClient.send).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        data: expect.objectContaining({
          commandId: 'cmd-delete-no-db',
          success: false,
          error: 'Host database not initialized',
        }),
      })
    );
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

  it('sends scan failure when immediate scan throws', async () => {
    hostDbMock.syncWithNetwork.mockRejectedValueOnce(new Error('scan failed'));

    await ((service as unknown) as {
      handleScanCommand: (command: unknown) => Promise<void>;
    }).handleScanCommand({
      type: 'scan',
      commandId: 'cmd-scan-fail',
      data: { immediate: true },
    });

    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'command-result',
        data: expect.objectContaining({
          commandId: 'cmd-scan-fail',
          success: false,
          error: 'scan failed',
        }),
      })
    );
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

  it('returns update failure when host does not exist', async () => {
    hostDbMock.getHost.mockResolvedValueOnce(undefined);

    await ((service as unknown) as {
      handleUpdateHostCommand: (command: unknown) => Promise<void>;
    }).handleUpdateHostCommand({
      type: 'update-host',
      commandId: 'cmd-update-missing',
      data: { name: 'MISSING-HOST' },
    });

    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'command-result',
        data: expect.objectContaining({
          commandId: 'cmd-update-missing',
          success: false,
          error: 'Host MISSING-HOST not found',
        }),
      })
    );
  });

  it('rejects update-host payload with invalid status', async () => {
    await ((service as unknown) as {
      handleUpdateHostCommand: (command: unknown) => Promise<void>;
    }).handleUpdateHostCommand({
      type: 'update-host',
      commandId: 'cmd-update-invalid-status',
      data: {
        name: 'PHANTOM-MBP',
        status: 'offline',
      },
    });

    expect(hostDbMock.getHost).not.toHaveBeenCalled();
    expect(hostDbMock.updateHost).not.toHaveBeenCalled();
    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'command-result',
        data: expect.objectContaining({
          commandId: 'cmd-update-invalid-status',
          success: false,
          error: 'Invalid update-host payload: status must be awake or asleep',
        }),
      })
    );
  });

  it('rejects update-host payload with invalid ip format', async () => {
    await ((service as unknown) as {
      handleUpdateHostCommand: (command: unknown) => Promise<void>;
    }).handleUpdateHostCommand({
      type: 'update-host',
      commandId: 'cmd-update-invalid-ip',
      data: {
        name: 'PHANTOM-MBP',
        ip: 'not-an-ip',
      },
    });

    expect(hostDbMock.getHost).not.toHaveBeenCalled();
    expect(hostDbMock.updateHost).not.toHaveBeenCalled();
    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'command-result',
        data: expect.objectContaining({
          commandId: 'cmd-update-invalid-ip',
          success: false,
          error: 'Invalid update-host payload: ip must be a valid IPv4 address',
        }),
      })
    );
  });

  it('rejects update-host payload with invalid mac format', async () => {
    await ((service as unknown) as {
      handleUpdateHostCommand: (command: unknown) => Promise<void>;
    }).handleUpdateHostCommand({
      type: 'update-host',
      commandId: 'cmd-update-invalid-mac',
      data: {
        name: 'PHANTOM-MBP',
        mac: 'INVALID-MAC',
      },
    });

    expect(hostDbMock.getHost).not.toHaveBeenCalled();
    expect(hostDbMock.updateHost).not.toHaveBeenCalled();
    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'command-result',
        data: expect.objectContaining({
          commandId: 'cmd-update-invalid-mac',
          success: false,
          error: 'Invalid update-host payload: mac has invalid format',
        }),
      })
    );
  });

  it('deletes host and sends removal event', async () => {
    const sendHostRemovedSpy = jest
      .spyOn((service as unknown) as { sendHostRemoved: (name: string) => void }, 'sendHostRemoved')
      .mockImplementation(() => {});

    await ((service as unknown) as {
      handleDeleteHostCommand: (command: unknown) => Promise<void>;
    }).handleDeleteHostCommand({
      type: 'delete-host',
      commandId: 'cmd-delete-ok',
      data: { name: 'PHANTOM-MBP' },
    });

    expect(hostDbMock.deleteHost).toHaveBeenCalledWith('PHANTOM-MBP');
    expect(sendHostRemovedSpy).toHaveBeenCalledWith('PHANTOM-MBP');
    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'command-result',
        data: expect.objectContaining({
          commandId: 'cmd-delete-ok',
          success: true,
          message: 'Host PHANTOM-MBP deleted successfully',
        }),
      })
    );
  });

  it('returns delete failure when deletion throws', async () => {
    hostDbMock.deleteHost.mockRejectedValueOnce(new Error('delete failed'));

    await ((service as unknown) as {
      handleDeleteHostCommand: (command: unknown) => Promise<void>;
    }).handleDeleteHostCommand({
      type: 'delete-host',
      commandId: 'cmd-delete-fail',
      data: { name: 'PHANTOM-MBP' },
    });

    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'command-result',
        data: expect.objectContaining({
          commandId: 'cmd-delete-fail',
          success: false,
          error: 'delete failed',
        }),
      })
    );
  });

  it('forwards host database events when active', async () => {
    await service.start();
    const dbEmitter = Object.assign(new EventEmitter(), {
      getAllHosts: jest.fn().mockResolvedValue([]),
    });

    service.setHostDatabase((dbEmitter as unknown) as any);
    dbEmitter.emit('host-discovered', sampleHost);
    dbEmitter.emit('host-updated', sampleHost);
    dbEmitter.emit('scan-complete', 9);

    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'host-discovered' })
    );
    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'host-updated' })
    );
    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'scan-complete',
        data: expect.objectContaining({ hostCount: 9 }),
      })
    );
  });

  it('sends initial hosts on connected event', async () => {
    await service.start();
    const dbEmitter = Object.assign(new EventEmitter(), {
      getAllHosts: jest.fn().mockResolvedValue([sampleHost]),
    });
    service.setHostDatabase((dbEmitter as unknown) as any);

    mockCncClient.emit('connected');
    await Promise.resolve();

    expect(mockCncClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'host-discovered',
        data: expect.objectContaining({ name: sampleHost.name }),
      })
    );
  });
});
