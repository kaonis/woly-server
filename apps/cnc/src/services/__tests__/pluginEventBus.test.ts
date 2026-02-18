import { PluginEventBus } from '../pluginEventBus';
import logger from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('PluginEventBus', () => {
  const mockedLogger = logger as jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishes events to subscribed handlers', () => {
    const bus = new PluginEventBus();
    const handler = jest.fn();

    bus.subscribe('node.connected', handler);

    bus.publish({
      type: 'node.connected',
      timestamp: '2026-02-18T20:00:00.000Z',
      data: {
        nodeId: 'node-1',
      },
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'node.connected',
        data: {
          nodeId: 'node-1',
        },
      })
    );
  });

  it('unsubscribe detaches handlers', () => {
    const bus = new PluginEventBus();
    const handler = jest.fn();

    const unsubscribe = bus.subscribe('scan.complete', handler);
    unsubscribe();

    bus.publish({
      type: 'scan.complete',
      timestamp: '2026-02-18T20:00:00.000Z',
      data: {
        nodeId: 'node-1',
        hostCount: 5,
      },
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('logs and continues when a handler throws', () => {
    const bus = new PluginEventBus();
    const failingHandler = jest.fn(() => {
      throw new Error('handler boom');
    });
    const healthyHandler = jest.fn();

    bus.subscribe('host.removed', failingHandler);
    bus.subscribe('host.removed', healthyHandler);

    bus.publish({
      type: 'host.removed',
      timestamp: '2026-02-18T20:00:00.000Z',
      data: {
        nodeId: 'node-1',
        name: 'desktop',
      },
    });

    expect(failingHandler).toHaveBeenCalledTimes(1);
    expect(healthyHandler).toHaveBeenCalledTimes(1);
    expect(mockedLogger.error).toHaveBeenCalledWith(
      'Plugin event handler failed',
      expect.objectContaining({
        eventType: 'host.removed',
      })
    );
  });
});
