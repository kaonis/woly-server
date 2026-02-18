import logger from '../../utils/logger';
import type { PluginEventBus } from '../pluginEventBus';
import type { PluginContext, PluginFactory, WolyPlugin } from './types';
import { PushNotificationsPlugin } from './pushNotificationsPlugin';
import { WebhookPlugin } from './webhookPlugin';

const DEFAULT_PLUGIN_FACTORIES: Record<string, PluginFactory> = {
  webhook: () => new WebhookPlugin(),
  'push-notifications': () => new PushNotificationsPlugin(),
};

type PluginManagerOptions = {
  eventBus: PluginEventBus;
  enabledPlugins: string[];
  pluginFactories?: Record<string, PluginFactory>;
};

export class PluginManager {
  private readonly eventBus: PluginEventBus;
  private readonly enabledPlugins: string[];
  private readonly pluginFactories: Record<string, PluginFactory>;
  private readonly activePlugins: WolyPlugin[] = [];
  private started = false;

  constructor(options: PluginManagerOptions) {
    this.eventBus = options.eventBus;
    this.enabledPlugins = options.enabledPlugins;
    this.pluginFactories = options.pluginFactories ?? DEFAULT_PLUGIN_FACTORIES;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    const context: PluginContext = {
      eventBus: this.eventBus,
    };

    for (const pluginId of this.getDedupedEnabledPluginIds()) {
      const factory = this.pluginFactories[pluginId];
      if (!factory) {
        logger.warn('Skipping unknown CNC plugin', { pluginId });
        continue;
      }

      try {
        const plugin = factory();
        await plugin.init(context);
        this.activePlugins.push(plugin);
        logger.info('Started CNC plugin', {
          pluginId,
          version: plugin.version,
        });
      } catch (error) {
        logger.error('Failed to start CNC plugin', {
          pluginId,
          error,
        });
      }
    }
  }

  async shutdown(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.started = false;

    for (let index = this.activePlugins.length - 1; index >= 0; index -= 1) {
      const plugin = this.activePlugins[index];
      try {
        await plugin.destroy();
      } catch (error) {
        logger.warn('Failed to shutdown CNC plugin cleanly', {
          pluginName: plugin.name,
          error,
        });
      }
    }

    this.activePlugins.length = 0;
  }

  getActivePluginNames(): string[] {
    return this.activePlugins.map((plugin) => plugin.name);
  }

  private getDedupedEnabledPluginIds(): string[] {
    const deduped = new Set<string>();
    for (const pluginId of this.enabledPlugins) {
      const normalized = pluginId.trim();
      if (!normalized) {
        continue;
      }
      deduped.add(normalized);
    }
    return [...deduped];
  }
}

export default PluginManager;
