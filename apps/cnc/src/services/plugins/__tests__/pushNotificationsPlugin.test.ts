import { PluginEventBus } from '../../pluginEventBus';
import { PushNotificationsPlugin } from '../pushNotificationsPlugin';

jest.mock('../../../config', () => ({
  __esModule: true,
  default: {
    pushNotificationsEnabled: true,
  },
}));

describe('PushNotificationsPlugin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const config = require('../../../config').default as { pushNotificationsEnabled: boolean };
    config.pushNotificationsEnabled = true;
  });

  it('maps bus events to push event types', () => {
    const sendEvent = jest.fn().mockResolvedValue(undefined);

    const plugin = new PushNotificationsPlugin({
      service: {
        sendEvent,
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
      type: 'scan.complete',
      timestamp: '2026-02-18T20:00:00.000Z',
      data: {
        nodeId: 'node-1',
        hostCount: 12,
      },
    });

    eventBus.publish({
      type: 'node.disconnected',
      timestamp: '2026-02-18T20:00:00.000Z',
      data: {
        nodeId: 'node-1',
      },
    });

    expect(sendEvent).toHaveBeenNthCalledWith(
      1,
      'host.awake',
      expect.objectContaining({
        hostFqn: 'desktop@node-1',
      }),
    );
    expect(sendEvent).toHaveBeenNthCalledWith(
      2,
      'scan.complete',
      expect.objectContaining({
        nodeId: 'node-1',
      }),
    );
    expect(sendEvent).toHaveBeenNthCalledWith(
      3,
      'node.disconnected',
      expect.objectContaining({
        nodeId: 'node-1',
      }),
    );
  });

  it('unsubscribes handlers on destroy', () => {
    const sendEvent = jest.fn().mockResolvedValue(undefined);

    const plugin = new PushNotificationsPlugin({
      service: {
        sendEvent,
      } as never,
    });

    const eventBus = new PluginEventBus();
    plugin.init({ eventBus });
    plugin.destroy();

    eventBus.publish({
      type: 'scan.complete',
      timestamp: '2026-02-18T20:00:00.000Z',
      data: {
        nodeId: 'node-1',
        hostCount: 12,
      },
    });

    expect(sendEvent).not.toHaveBeenCalled();
  });

  it('does not subscribe when push notifications are disabled', () => {
    const config = require('../../../config').default as { pushNotificationsEnabled: boolean };
    config.pushNotificationsEnabled = false;

    const sendEvent = jest.fn().mockResolvedValue(undefined);
    const plugin = new PushNotificationsPlugin({
      service: {
        sendEvent,
      } as never,
    });

    const eventBus = new PluginEventBus();
    plugin.init({ eventBus });

    eventBus.publish({
      type: 'scan.complete',
      timestamp: '2026-02-18T20:00:00.000Z',
      data: {
        nodeId: 'node-1',
        hostCount: 12,
      },
    });

    expect(sendEvent).not.toHaveBeenCalled();
  });
});
