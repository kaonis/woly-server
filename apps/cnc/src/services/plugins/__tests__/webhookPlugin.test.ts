import { PluginEventBus } from '../../pluginEventBus';
import { WebhookPlugin } from '../webhookPlugin';

describe('WebhookPlugin', () => {
  it('maps host status transition events to host.awake and host.asleep webhooks', () => {
    const dispatchEvent = jest.fn().mockResolvedValue(undefined);
    const shutdown = jest.fn();

    const plugin = new WebhookPlugin({
      dispatcher: {
        dispatchEvent,
        shutdown,
      } as never,
    });

    const eventBus = new PluginEventBus();
    plugin.init({ eventBus });

    eventBus.publish({
      type: 'host.status-transition',
      timestamp: '2026-02-18T20:00:00.000Z',
      data: {
        hostFqn: 'desktop@node-1',
        oldStatus: 'asleep',
        newStatus: 'awake',
        changedAt: '2026-02-18T20:00:00.000Z',
      },
    });

    eventBus.publish({
      type: 'host.status-transition',
      timestamp: '2026-02-18T20:05:00.000Z',
      data: {
        hostFqn: 'desktop@node-1',
        oldStatus: 'awake',
        newStatus: 'asleep',
        changedAt: '2026-02-18T20:05:00.000Z',
      },
    });

    expect(dispatchEvent).toHaveBeenNthCalledWith(
      1,
      'host.awake',
      expect.objectContaining({
        hostFqn: 'desktop@node-1',
      }),
    );

    expect(dispatchEvent).toHaveBeenNthCalledWith(
      2,
      'host.asleep',
      expect.objectContaining({
        hostFqn: 'desktop@node-1',
      }),
    );
  });

  it('forwards direct event mappings and cleans up on destroy', () => {
    const dispatchEvent = jest.fn().mockResolvedValue(undefined);
    const shutdown = jest.fn();

    const plugin = new WebhookPlugin({
      dispatcher: {
        dispatchEvent,
        shutdown,
      } as never,
    });

    const eventBus = new PluginEventBus();
    plugin.init({ eventBus });

    eventBus.publish({
      type: 'scan.complete',
      timestamp: '2026-02-18T20:00:00.000Z',
      data: {
        nodeId: 'node-1',
        hostCount: 5,
      },
    });

    expect(dispatchEvent).toHaveBeenCalledWith(
      'scan.complete',
      expect.objectContaining({
        nodeId: 'node-1',
        hostCount: 5,
      }),
    );

    plugin.destroy();

    eventBus.publish({
      type: 'scan.complete',
      timestamp: '2026-02-18T20:01:00.000Z',
      data: {
        nodeId: 'node-1',
        hostCount: 6,
      },
    });

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });
});
