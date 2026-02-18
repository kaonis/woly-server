import { PluginManager } from '../pluginManager';
import { PluginEventBus } from '../../pluginEventBus';
import logger from '../../../utils/logger';

jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('PluginManager', () => {
  const mockedLogger = logger as jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts known plugins and skips unknown plugin ids', async () => {
    const init = jest.fn();
    const destroy = jest.fn();

    const manager = new PluginManager({
      eventBus: new PluginEventBus(),
      enabledPlugins: ['mock-plugin', 'unknown-plugin', 'mock-plugin'],
      pluginFactories: {
        'mock-plugin': () => ({
          name: 'mock-plugin',
          version: '1.0.0',
          init,
          destroy,
        }),
      },
    });

    await manager.start();

    expect(init).toHaveBeenCalledTimes(1);
    expect(manager.getActivePluginNames()).toEqual(['mock-plugin']);
    expect(mockedLogger.warn).toHaveBeenCalledWith('Skipping unknown CNC plugin', {
      pluginId: 'unknown-plugin',
    });
  });

  it('shuts down started plugins', async () => {
    const destroy = jest.fn();

    const manager = new PluginManager({
      eventBus: new PluginEventBus(),
      enabledPlugins: ['mock-plugin'],
      pluginFactories: {
        'mock-plugin': () => ({
          name: 'mock-plugin',
          version: '1.0.0',
          init: jest.fn(),
          destroy,
        }),
      },
    });

    await manager.start();
    await manager.shutdown();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(manager.getActivePluginNames()).toEqual([]);
  });
});
