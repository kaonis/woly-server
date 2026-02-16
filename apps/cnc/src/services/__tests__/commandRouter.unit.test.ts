import { EventEmitter } from 'events';
import { CommandRouter } from '../commandRouter';
import { CommandModel } from '../../models/Command';
import type { CommandResult } from '../../types';
import { runtimeMetrics } from '../runtimeMetrics';
import logger from '../../utils/logger';

interface CommandResolver {
  resolve: (result: CommandResult) => void;
  reject: (error: Error) => void;
}

interface PendingCommandEntry {
  resolvers: CommandResolver[];
  timeout: NodeJS.Timeout;
  correlationId: string | null;
}

interface CommandRouterInternals {
  executeCommand: (
    nodeId: string,
    command: { type: string; commandId: string; data: unknown },
    options: { idempotencyKey: string | null; correlationId: string | null }
  ) => Promise<CommandResult>;
  handleCommandResult: (result: CommandResult) => void;
  pendingCommands: Map<string, PendingCommandEntry>;
  commandTimeout: number;
}

class NodeManagerMock extends EventEmitter {
  getNodeStatus = jest.fn<Promise<'online' | 'offline'>, [string]>();
  sendCommand = jest.fn<void, [string, unknown]>();
}

type HostRecord = {
  nodeId: string;
  name: string;
  mac: string;
  ip: string;
  status: 'awake' | 'asleep';
  notes?: string | null;
  tags?: string[];
};

type HostAggregatorMock = {
  getHostByFQN: jest.Mock<Promise<HostRecord | null>, [string]>;
  onHostRemoved: jest.Mock<Promise<void>, [{ nodeId: string; name: string }]>;
};

function createRouter(): {
  router: CommandRouter;
  internals: CommandRouterInternals;
  nodeManager: NodeManagerMock;
  hostAggregator: HostAggregatorMock;
} {
  const nodeManager = new NodeManagerMock();
  const hostAggregator: HostAggregatorMock = {
    getHostByFQN: jest.fn(),
    onHostRemoved: jest.fn().mockResolvedValue(undefined),
  };

  const router = new CommandRouter(
    nodeManager as unknown as never,
    hostAggregator as unknown as never
  );

  return {
    router,
    internals: router as unknown as CommandRouterInternals,
    nodeManager,
    hostAggregator,
  };
}

function createQueuedRecord(commandId: string, payload: unknown) {
  const now = new Date();
  return {
    id: commandId,
    nodeId: 'node-1',
    type: 'scan',
    payload,
    idempotencyKey: null,
    state: 'queued' as const,
    error: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    completedAt: null,
  };
}

describe('CommandRouter unit behavior', () => {
  beforeEach(() => {
    runtimeMetrics.reset(0);
    jest.spyOn(CommandModel, 'findById').mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('routes wake command successfully and includes decoded location + correlationId', async () => {
    const { router, hostAggregator, nodeManager } = createRouter();
    hostAggregator.getHostByFQN.mockResolvedValue({
      nodeId: 'node-1',
      name: 'desk-pc',
      mac: 'AA:BB:CC:DD:EE:FF',
      ip: '192.168.1.10',
      status: 'awake',
    });
    nodeManager.getNodeStatus.mockResolvedValue('online');

    const executeSpy = jest.spyOn(router as unknown as CommandRouterInternals, 'executeCommand')
      .mockResolvedValue({
        commandId: 'cmd-1',
        success: true,
        timestamp: new Date(),
        correlationId: 'corr-123',
      });

    const result = await router.routeWakeCommand('desk-pc@Home%20Office', {
      idempotencyKey: 'idem-1',
      correlationId: 'corr-123',
    });

    expect(executeSpy).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({
        type: 'wake',
        data: expect.objectContaining({
          hostName: 'desk-pc',
          mac: 'AA:BB:CC:DD:EE:FF',
        }),
      }),
      {
        idempotencyKey: 'idem-1',
        correlationId: 'corr-123',
      }
    );
    expect(result).toEqual({
      success: true,
      message: 'Wake-on-LAN packet sent to desk-pc@Home%20Office',
      nodeId: 'node-1',
      location: 'Home Office',
      correlationId: 'corr-123',
    });
    router.cleanup();
  });

  it('reconciles stale in-flight commands with router timeout', async () => {
    const { router, internals } = createRouter();
    const reconcileSpy = jest.spyOn(CommandModel, 'reconcileStaleInFlight').mockResolvedValue(4);

    const count = await router.reconcileStaleInFlight();

    expect(count).toBe(4);
    expect(reconcileSpy).toHaveBeenCalledWith(internals.commandTimeout);
    router.cleanup();
  });

  it('rejects malformed FQN values before host lookup', async () => {
    const { router, hostAggregator } = createRouter();

    await expect(router.routeWakeCommand('malformed-fqn')).rejects.toThrow('Invalid FQN format');
    expect(hostAggregator.getHostByFQN).not.toHaveBeenCalled();
    router.cleanup();
  });

  it('rejects malformed encoded FQN location before host lookup', async () => {
    const { router, hostAggregator } = createRouter();

    await expect(router.routeWakeCommand('desk-pc@Lab%ZZ')).rejects.toThrow('Invalid FQN encoding');
    expect(hostAggregator.getHostByFQN).not.toHaveBeenCalled();
    router.cleanup();
  });

  it('builds update-host payload with fallback fields from stored host', async () => {
    const { router, hostAggregator, nodeManager } = createRouter();
    hostAggregator.getHostByFQN.mockResolvedValue({
      nodeId: 'node-2',
      name: 'old-name',
      mac: '00:11:22:33:44:55',
      ip: '10.0.0.10',
      status: 'asleep',
    });
    nodeManager.getNodeStatus.mockResolvedValue('online');

    const executeSpy = jest.spyOn(router as unknown as CommandRouterInternals, 'executeCommand')
      .mockResolvedValue({
        commandId: 'cmd-update-1',
        success: true,
        timestamp: new Date(),
      });

    await router.routeUpdateHostCommand('old-name@SiteA', { name: 'new-name' });

    expect(executeSpy).toHaveBeenCalledWith(
      'node-2',
      expect.objectContaining({
        type: 'update-host',
        data: {
          currentName: 'old-name',
          name: 'new-name',
          mac: '00:11:22:33:44:55',
          ip: '10.0.0.10',
          status: 'asleep',
          notes: undefined,
          tags: undefined,
        },
      }),
      {
        idempotencyKey: null,
        correlationId: null,
      }
    );
    router.cleanup();
  });

  it('builds update-host payload with metadata overrides', async () => {
    const { router, hostAggregator, nodeManager } = createRouter();
    hostAggregator.getHostByFQN.mockResolvedValue({
      nodeId: 'node-2',
      name: 'old-name',
      mac: '00:11:22:33:44:55',
      ip: '10.0.0.10',
      status: 'asleep',
      notes: 'legacy note',
      tags: ['legacy'],
    });
    nodeManager.getNodeStatus.mockResolvedValue('online');

    const executeSpy = jest.spyOn(
      router as unknown as CommandRouterInternals,
      'executeCommand'
    ).mockResolvedValue({
      commandId: 'cmd-update-2',
      success: true,
      timestamp: new Date(),
    });

    await router.routeUpdateHostCommand('old-name@SiteA', {
      notes: null,
      tags: ['prod', 'critical'],
    });

    expect(executeSpy).toHaveBeenCalledWith(
      'node-2',
      expect.objectContaining({
        type: 'update-host',
        data: expect.objectContaining({
          notes: null,
          tags: ['prod', 'critical'],
        }),
      }),
      {
        idempotencyKey: null,
        correlationId: null,
      }
    );
    router.cleanup();
  });

  it('throws explicit wake errors when executeCommand returns unsuccessful result', async () => {
    const { router, hostAggregator, nodeManager } = createRouter();
    hostAggregator.getHostByFQN.mockResolvedValue({
      nodeId: 'node-1',
      name: 'desk-pc',
      mac: 'AA:BB:CC:DD:EE:FF',
      ip: '192.168.1.10',
      status: 'awake',
    });
    nodeManager.getNodeStatus.mockResolvedValue('online');
    jest.spyOn(router as unknown as CommandRouterInternals, 'executeCommand').mockResolvedValue({
      commandId: 'cmd-wake-fail',
      success: false,
      timestamp: new Date(),
    });

    await expect(router.routeWakeCommand('desk-pc@Lab')).rejects.toThrow('Wake command failed');
    router.cleanup();
  });

  it('routes scan command with immediate=false and correlation id', async () => {
    const { router, nodeManager } = createRouter();
    nodeManager.getNodeStatus.mockResolvedValue('online');
    const executeSpy = jest.spyOn(router as unknown as CommandRouterInternals, 'executeCommand')
      .mockResolvedValue({
        commandId: 'cmd-scan-1',
        success: true,
        timestamp: new Date(),
      });

    await router.routeScanCommand('node-7', false, { correlationId: 'corr-scan' });

    expect(executeSpy).toHaveBeenCalledWith(
      'node-7',
      expect.objectContaining({
        type: 'scan',
        data: { immediate: false },
      }),
      { idempotencyKey: null, correlationId: 'corr-scan' }
    );
    router.cleanup();
  });

  it('routes ping-host command and returns node-agent ping payload', async () => {
    const { router, hostAggregator, nodeManager } = createRouter();
    hostAggregator.getHostByFQN.mockResolvedValue({
      nodeId: 'node-9',
      name: 'desk-pc',
      mac: 'AA:BB:CC:DD:EE:FF',
      ip: '192.168.1.40',
      status: 'awake',
    });
    nodeManager.getNodeStatus.mockResolvedValue('online');

    const executeSpy = jest.spyOn(
      router as unknown as CommandRouterInternals,
      'executeCommand'
    ).mockResolvedValue({
      commandId: 'cmd-ping-1',
      success: true,
      timestamp: new Date(),
      correlationId: 'corr-ping',
      hostPing: {
        hostName: 'desk-pc',
        mac: 'AA:BB:CC:DD:EE:FF',
        ip: '192.168.1.40',
        reachable: false,
        status: 'asleep',
        latencyMs: 19,
        checkedAt: '2026-02-16T23:00:00.000Z',
      },
    });

    const result = await router.routePingHostCommand('desk-pc@Lab', {
      correlationId: 'corr-ping',
    });

    expect(executeSpy).toHaveBeenCalledWith(
      'node-9',
      expect.objectContaining({
        type: 'ping-host',
        data: {
          hostName: 'desk-pc',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.40',
        },
      }),
      {
        idempotencyKey: null,
        correlationId: 'corr-ping',
      }
    );
    expect(result).toEqual({
      target: 'desk-pc@Lab',
      checkedAt: '2026-02-16T23:00:00.000Z',
      latencyMs: 19,
      success: false,
      status: 'asleep',
      source: 'node-agent',
      correlationId: 'corr-ping',
    });
    router.cleanup();
  });

  it('throws when update-host routing cannot find host', async () => {
    const { router, hostAggregator } = createRouter();
    hostAggregator.getHostByFQN.mockResolvedValue(null);

    await expect(router.routeUpdateHostCommand('missing@lab', {})).rejects.toThrow(
      'Host not found: missing@lab'
    );
    router.cleanup();
  });

  it('throws when update-host routing node is offline', async () => {
    const { router, hostAggregator, nodeManager } = createRouter();
    hostAggregator.getHostByFQN.mockResolvedValue({
      nodeId: 'node-offline',
      name: 'host-a',
      mac: 'AA:AA:AA:AA:AA:AA',
      ip: '10.0.0.8',
      status: 'asleep',
    });
    nodeManager.getNodeStatus.mockResolvedValue('offline');

    await expect(router.routeUpdateHostCommand('host-a@lab', {})).rejects.toThrow(
      'Node node-offline is offline'
    );
    router.cleanup();
  });

  it('removes host from aggregator only after successful delete command', async () => {
    const { router, hostAggregator, nodeManager } = createRouter();
    hostAggregator.getHostByFQN.mockResolvedValue({
      nodeId: 'node-3',
      name: 'media-pc',
      mac: '00:AA:BB:CC:DD:EE',
      ip: '10.0.0.20',
      status: 'awake',
    });
    nodeManager.getNodeStatus.mockResolvedValue('online');

    const executeSpy = jest.spyOn(router as unknown as CommandRouterInternals, 'executeCommand')
      .mockResolvedValue({
        commandId: 'cmd-del-1',
        success: true,
        timestamp: new Date(),
      });

    const result = await router.routeDeleteHostCommand('media-pc@Lab');
    expect(result.success).toBe(true);
    expect(executeSpy).toHaveBeenCalled();
    expect(hostAggregator.onHostRemoved).toHaveBeenCalledWith({
      nodeId: 'node-3',
      name: 'media-pc',
    });
    router.cleanup();
  });

  it('keeps host when delete command fails', async () => {
    const { router, hostAggregator, nodeManager } = createRouter();
    hostAggregator.getHostByFQN.mockResolvedValue({
      nodeId: 'node-4',
      name: 'office-pc',
      mac: '11:22:33:44:55:66',
      ip: '10.0.0.30',
      status: 'awake',
    });
    nodeManager.getNodeStatus.mockResolvedValue('online');
    jest.spyOn(router as unknown as CommandRouterInternals, 'executeCommand')
      .mockResolvedValue({
        commandId: 'cmd-del-2',
        success: false,
        error: 'rejected by node',
        timestamp: new Date(),
      });

    await router.routeDeleteHostCommand('office-pc@Lab');
    expect(hostAggregator.onHostRemoved).not.toHaveBeenCalled();
    router.cleanup();
  });

  it('returns cached acknowledged command without re-sending', async () => {
    const { internals, nodeManager, router } = createRouter();
    const now = new Date();
    const enqueueSpy = jest.spyOn(CommandModel, 'enqueue').mockResolvedValue({
      id: 'cmd-ack-1',
      nodeId: 'node-1',
      type: 'scan',
      payload: { type: 'scan', commandId: 'cmd-ack-1', data: { immediate: true } },
      idempotencyKey: null,
      state: 'acknowledged',
      error: null,
      retryCount: 2,
      createdAt: now,
      updatedAt: now,
      sentAt: now,
      completedAt: now,
    });

    const result = await internals.executeCommand(
      'node-1',
      { type: 'scan', commandId: 'cmd-ack-1', data: { immediate: true } },
      { idempotencyKey: null, correlationId: 'corr-cache' }
    );

    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(nodeManager.sendCommand).not.toHaveBeenCalled();
    expect(result).toEqual({
      commandId: 'cmd-ack-1',
      success: true,
      timestamp: now,
      correlationId: 'corr-cache',
    });
    router.cleanup();
  });

  it('scopes idempotency keys by command type before enqueue', async () => {
    const { internals, router } = createRouter();
    const now = new Date();
    const enqueueSpy = jest.spyOn(CommandModel, 'enqueue').mockResolvedValue({
      id: 'cmd-scope-1',
      nodeId: 'node-1',
      type: 'wake',
      payload: {
        type: 'wake',
        commandId: 'cmd-scope-1',
        data: { hostName: 'desk-pc', mac: 'AA:BB:CC:DD:EE:FF' },
      },
      idempotencyKey: 'wake:idem-shared',
      state: 'acknowledged',
      error: null,
      retryCount: 1,
      createdAt: now,
      updatedAt: now,
      sentAt: now,
      completedAt: now,
    });

    await internals.executeCommand(
      'node-1',
      {
        type: 'wake',
        commandId: 'cmd-scope-1',
        data: { hostName: 'desk-pc', mac: 'AA:BB:CC:DD:EE:FF' },
      },
      { idempotencyKey: 'idem-shared', correlationId: null }
    );

    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'wake:idem-shared',
      })
    );
    router.cleanup();
  });

  it('marks command as failed when sendCommand throws', async () => {
    const { internals, nodeManager, router } = createRouter();
    const queued = createQueuedRecord('cmd-send-fail', {
      type: 'scan',
      commandId: 'cmd-send-fail',
      data: { immediate: true },
    });

    jest.spyOn(CommandModel, 'enqueue').mockResolvedValue(queued);
    jest.spyOn(CommandModel, 'markSent').mockResolvedValue(undefined);
    const markFailedSpy = jest.spyOn(CommandModel, 'markFailed').mockResolvedValue(undefined);
    nodeManager.sendCommand.mockImplementation(() => {
      throw new Error('socket closed');
    });

    await expect(
      internals.executeCommand(
        'node-1',
        { type: 'scan', commandId: 'cmd-send-fail', data: { immediate: true } },
        { idempotencyKey: null, correlationId: null }
      )
    ).rejects.toThrow('socket closed');

    expect(markFailedSpy).toHaveBeenCalledWith('cmd-send-fail', 'socket closed');
    router.cleanup();
  });

  it('returns terminal failed/timed-out records without sending a command', async () => {
    const { internals, nodeManager, router } = createRouter();
    const now = new Date();
    const enqueueSpy = jest.spyOn(CommandModel, 'enqueue');

    enqueueSpy.mockResolvedValueOnce({
      id: 'cmd-failed',
      nodeId: 'node-1',
      type: 'scan',
      payload: { type: 'scan', commandId: 'cmd-failed', data: { immediate: true } },
      idempotencyKey: null,
      state: 'failed',
      error: null,
      retryCount: 3,
      createdAt: now,
      updatedAt: now,
      sentAt: now,
      completedAt: now,
    });
    const failed = await internals.executeCommand(
      'node-1',
      { type: 'scan', commandId: 'cmd-failed', data: { immediate: true } },
      { idempotencyKey: null, correlationId: 'corr-failed' }
    );
    expect(failed).toEqual({
      commandId: 'cmd-failed',
      success: false,
      error: 'Command failed',
      timestamp: now,
      correlationId: 'corr-failed',
    });

    enqueueSpy.mockResolvedValueOnce({
      id: 'cmd-timeout',
      nodeId: 'node-1',
      type: 'scan',
      payload: { type: 'scan', commandId: 'cmd-timeout', data: { immediate: true } },
      idempotencyKey: null,
      state: 'timed_out',
      error: 'timed out previously',
      retryCount: 4,
      createdAt: now,
      updatedAt: now,
      sentAt: now,
      completedAt: now,
    });
    const timedOut = await internals.executeCommand(
      'node-1',
      { type: 'scan', commandId: 'cmd-timeout', data: { immediate: true } },
      { idempotencyKey: null, correlationId: null }
    );
    expect(timedOut).toEqual({
      commandId: 'cmd-timeout',
      success: false,
      error: 'timed out previously',
      timestamp: now,
      correlationId: undefined,
    });

    expect(nodeManager.sendCommand).not.toHaveBeenCalled();
    router.cleanup();
  });

  it('times out queued command and marks it timed_out', async () => {
    jest.useFakeTimers();
    const { internals, nodeManager, router } = createRouter();
    internals.commandTimeout = 25;

    const queued = createQueuedRecord('cmd-timeout-1', {
      type: 'scan',
      commandId: 'cmd-timeout-1',
      data: { immediate: true },
    });
    jest.spyOn(CommandModel, 'enqueue').mockResolvedValue(queued);
    jest.spyOn(CommandModel, 'markSent').mockResolvedValue(undefined);
    const markTimedOutSpy = jest.spyOn(CommandModel, 'markTimedOut').mockResolvedValue(undefined);
    nodeManager.sendCommand.mockImplementation(() => undefined);

    const promise = internals.executeCommand(
      'node-1',
      { type: 'scan', commandId: 'cmd-timeout-1', data: { immediate: true } },
      { idempotencyKey: null, correlationId: 'corr-timeout' }
    );
    const rejection = expect(promise).rejects.toThrow('timed out');

    await jest.advanceTimersByTimeAsync(40);

    await rejection;
    expect(markTimedOutSpy).toHaveBeenCalledWith(
      'cmd-timeout-1',
      expect.stringContaining('timed out')
    );
    router.cleanup();
  });

  it('logs markTimedOut persistence failures after timeout', async () => {
    jest.useFakeTimers();
    const { internals, nodeManager, router } = createRouter();
    internals.commandTimeout = 25;

    const queued = createQueuedRecord('cmd-timeout-error', {
      type: 'scan',
      commandId: 'cmd-timeout-error',
      data: { immediate: true },
    });
    jest.spyOn(CommandModel, 'enqueue').mockResolvedValue(queued);
    jest.spyOn(CommandModel, 'markSent').mockResolvedValue(undefined);
    jest.spyOn(CommandModel, 'markTimedOut').mockRejectedValue(new Error('persist timeout failure'));
    const loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    nodeManager.sendCommand.mockImplementation(() => undefined);

    const promise = internals.executeCommand(
      'node-1',
      { type: 'scan', commandId: 'cmd-timeout-error', data: { immediate: true } },
      { idempotencyKey: null, correlationId: null }
    );
    const rejection = expect(promise).rejects.toThrow('timed out');
    await jest.advanceTimersByTimeAsync(40);
    await rejection;
    await Promise.resolve();

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Failed to mark command as timed out',
      expect.objectContaining({ commandId: 'cmd-timeout-error' })
    );
    router.cleanup();
  });

  it('applies retry backoff for queued retries before dispatch', async () => {
    jest.useFakeTimers();
    const { internals, nodeManager, router } = createRouter();
    const queued = {
      ...createQueuedRecord('cmd-retry', {
        type: 'scan',
        commandId: 'cmd-retry',
        data: { immediate: true },
      }),
      retryCount: 2,
    };

    jest.spyOn(CommandModel, 'enqueue').mockResolvedValue(queued);
    jest.spyOn(CommandModel, 'markSent').mockResolvedValue(undefined);
    jest.spyOn(CommandModel, 'markAcknowledged').mockResolvedValue(undefined);
    jest
      .spyOn(router as unknown as { calculateBackoffDelay: (retryCount: number) => number }, 'calculateBackoffDelay')
      .mockReturnValue(50);
    nodeManager.sendCommand.mockImplementation(() => undefined);

    const promise = internals.executeCommand(
      'node-1',
      { type: 'scan', commandId: 'cmd-retry', data: { immediate: true } },
      { idempotencyKey: null, correlationId: null }
    );
    await Promise.resolve();
    expect(nodeManager.sendCommand).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(49);
    expect(nodeManager.sendCommand).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(nodeManager.sendCommand).toHaveBeenCalledTimes(1);

    internals.handleCommandResult({
      commandId: 'cmd-retry',
      success: true,
      timestamp: new Date(),
    });

    await expect(promise).resolves.toEqual(
      expect.objectContaining({ commandId: 'cmd-retry', success: true })
    );
    router.cleanup();
  });

  it('does not resend commands that are already in sent state', async () => {
    const { internals, nodeManager, router } = createRouter();
    const now = new Date();
    jest.spyOn(CommandModel, 'enqueue').mockResolvedValue({
      id: 'cmd-sent',
      nodeId: 'node-1',
      type: 'scan',
      payload: { type: 'scan', commandId: 'cmd-sent', data: { immediate: true } },
      idempotencyKey: null,
      state: 'sent',
      error: null,
      retryCount: 1,
      createdAt: now,
      updatedAt: now,
      sentAt: now,
      completedAt: null,
    });

    const promise = internals.executeCommand(
      'node-1',
      { type: 'scan', commandId: 'cmd-sent', data: { immediate: true } },
      { idempotencyKey: null, correlationId: null }
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(nodeManager.sendCommand).not.toHaveBeenCalled();
    router.cleanup();
    await expect(promise).rejects.toThrow('CommandRouter shutting down');
  });

  it('resolves multiple waiters for the same command id from one result', async () => {
    const { internals, nodeManager, router } = createRouter();
    const queued = createQueuedRecord('cmd-shared', {
      type: 'scan',
      commandId: 'cmd-shared',
      data: { immediate: true },
    });

    jest.spyOn(CommandModel, 'enqueue').mockResolvedValue(queued);
    jest.spyOn(CommandModel, 'markSent').mockResolvedValue(undefined);
    jest.spyOn(CommandModel, 'markAcknowledged').mockResolvedValue(undefined);
    nodeManager.sendCommand.mockImplementation(() => undefined);

    const first = internals.executeCommand(
      'node-1',
      { type: 'scan', commandId: 'cmd-shared', data: { immediate: true } },
      { idempotencyKey: null, correlationId: 'corr-shared' }
    );
    const second = internals.executeCommand(
      'node-1',
      { type: 'scan', commandId: 'cmd-shared', data: { immediate: true } },
      { idempotencyKey: null, correlationId: 'corr-shared' }
    );

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    expect(internals.pendingCommands.get('cmd-shared')?.resolvers).toHaveLength(2);

    internals.handleCommandResult({
      commandId: 'cmd-shared',
      success: true,
      timestamp: new Date(),
    });

    await expect(first).resolves.toEqual(
      expect.objectContaining({ commandId: 'cmd-shared', success: true, correlationId: 'corr-shared' })
    );
    await expect(second).resolves.toEqual(
      expect.objectContaining({ commandId: 'cmd-shared', success: true, correlationId: 'corr-shared' })
    );
    expect(nodeManager.sendCommand).toHaveBeenCalledTimes(1);
    router.cleanup();
  });

  it('rejects pending waiters when command result is unsuccessful', async () => {
    const { internals, nodeManager, router } = createRouter();
    const queued = createQueuedRecord('cmd-failure-result', {
      type: 'scan',
      commandId: 'cmd-failure-result',
      data: { immediate: true },
    });

    jest.spyOn(CommandModel, 'enqueue').mockResolvedValue(queued);
    jest.spyOn(CommandModel, 'markSent').mockResolvedValue(undefined);
    jest.spyOn(CommandModel, 'markFailed').mockResolvedValue(undefined);
    nodeManager.sendCommand.mockImplementation(() => undefined);

    const pending = internals.executeCommand(
      'node-1',
      { type: 'scan', commandId: 'cmd-failure-result', data: { immediate: true } },
      { idempotencyKey: null, correlationId: 'corr-fail' }
    );
    await new Promise((resolve) => setImmediate(resolve));

    internals.handleCommandResult({
      commandId: 'cmd-failure-result',
      success: false,
      error: 'node rejected command',
      timestamp: new Date(),
    });

    await expect(pending).rejects.toThrow('node rejected command');
    router.cleanup();
  });

  it('logs persistence failures while handling command results', async () => {
    const { internals, router } = createRouter();
    const loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    jest.spyOn(CommandModel, 'markAcknowledged').mockRejectedValue(new Error('ack persist failure'));
    jest.spyOn(CommandModel, 'markFailed').mockRejectedValue(new Error('fail persist failure'));

    internals.handleCommandResult({
      commandId: 'cmd-ack-persist-fail',
      success: true,
      timestamp: new Date(),
    });
    internals.handleCommandResult({
      commandId: 'cmd-fail-persist-fail',
      success: false,
      error: 'bad news',
      timestamp: new Date(),
    });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Failed to mark command as acknowledged',
      expect.objectContaining({ commandId: 'cmd-ack-persist-fail' })
    );
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Failed to mark command as failed',
      expect.objectContaining({ commandId: 'cmd-fail-persist-fail' })
    );
    router.cleanup();
  });

  it('attributes metrics to persisted command type when pending state is missing', async () => {
    const { internals, router } = createRouter();
    jest.spyOn(CommandModel, 'findById').mockResolvedValue({
      id: 'cmd-late-result',
      nodeId: 'node-1',
      type: 'wake',
      payload: { type: 'wake', commandId: 'cmd-late-result', data: { hostName: 'desk', mac: 'AA' } },
      idempotencyKey: null,
      state: 'sent',
      error: null,
      retryCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      sentAt: new Date(),
      completedAt: null,
    });
    jest.spyOn(CommandModel, 'markFailed').mockResolvedValue(undefined);

    internals.handleCommandResult({
      commandId: 'cmd-late-result',
      success: false,
      error: 'late result failure',
      timestamp: new Date(),
    });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(runtimeMetrics.snapshot().commands.outcomesByType.wake.failed).toBe(1);
    expect(runtimeMetrics.snapshot().commands.outcomesByType.unknown).toBeUndefined();
    router.cleanup();
  });

  it('unsubscribes command-result listener from node manager on cleanup', () => {
    const { router, nodeManager } = createRouter();
    expect(nodeManager.listenerCount('command-result')).toBe(1);
    router.cleanup();
    expect(nodeManager.listenerCount('command-result')).toBe(0);
  });
});
