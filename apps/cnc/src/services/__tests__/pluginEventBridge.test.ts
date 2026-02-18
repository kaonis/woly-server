import { EventEmitter } from 'events';
import { PluginEventBridge } from '../pluginEventBridge';
import type { PluginEventBus } from '../pluginEventBus';

describe('PluginEventBridge', () => {
  it('bridges host and node events into plugin bus events', () => {
    const hostAggregator = new EventEmitter();
    const nodeManager = new EventEmitter();
    const publish = jest.fn();
    const eventBus = {
      publish,
    } as unknown as PluginEventBus;

    const bridge = new PluginEventBridge(hostAggregator as never, nodeManager as never, eventBus);
    bridge.start();

    hostAggregator.emit('host-added', {
      nodeId: 'node-1',
      fullyQualifiedName: 'desktop@node-1',
      host: {
        name: 'desktop',
        mac: 'aa:bb:cc:dd:ee:ff',
        status: 'awake',
      },
    });

    hostAggregator.emit('host-status-transition', {
      hostFqn: 'desktop@node-1',
      oldStatus: 'asleep',
      newStatus: 'awake',
      changedAt: '2026-02-18T20:00:00.000Z',
    });

    nodeManager.emit('node-connected', {
      nodeId: 'node-1',
    });

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'host.discovered',
        data: expect.objectContaining({
          hostFqn: 'desktop@node-1',
        }),
      })
    );

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'host.status-transition',
        data: expect.objectContaining({
          hostFqn: 'desktop@node-1',
          newStatus: 'awake',
        }),
      })
    );

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'node.connected',
        data: {
          nodeId: 'node-1',
        },
      })
    );
  });

  it('detaches listeners on shutdown', () => {
    const hostAggregator = new EventEmitter();
    const nodeManager = new EventEmitter();
    const publish = jest.fn();
    const eventBus = {
      publish,
    } as unknown as PluginEventBus;

    const bridge = new PluginEventBridge(hostAggregator as never, nodeManager as never, eventBus);
    bridge.start();
    bridge.shutdown();

    hostAggregator.emit('host-removed', {
      nodeId: 'node-1',
      name: 'desktop',
    });

    nodeManager.emit('scan-complete', {
      nodeId: 'node-1',
      hostCount: 3,
    });

    expect(publish).not.toHaveBeenCalled();
  });
});
