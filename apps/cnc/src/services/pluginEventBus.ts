import logger from '../utils/logger';
import type { CncPluginEventMap, CncPluginEventType } from './plugins/types';

type PluginEventHandler<T extends CncPluginEventType> = (event: CncPluginEventMap[T]) => void;

export class PluginEventBus {
  private readonly handlers = new Map<CncPluginEventType, Set<PluginEventHandler<CncPluginEventType>>>();

  subscribe<T extends CncPluginEventType>(eventType: T, handler: PluginEventHandler<T>): () => void {
    const typedHandlers = this.handlers.get(eventType) ?? new Set<PluginEventHandler<CncPluginEventType>>();
    typedHandlers.add(handler as PluginEventHandler<CncPluginEventType>);
    this.handlers.set(eventType, typedHandlers);

    return () => {
      this.unsubscribe(eventType, handler);
    };
  }

  unsubscribe<T extends CncPluginEventType>(eventType: T, handler: PluginEventHandler<T>): void {
    const typedHandlers = this.handlers.get(eventType);
    if (!typedHandlers) {
      return;
    }

    typedHandlers.delete(handler as PluginEventHandler<CncPluginEventType>);
    if (typedHandlers.size === 0) {
      this.handlers.delete(eventType);
    }
  }

  publish<T extends CncPluginEventType>(event: CncPluginEventMap[T]): void {
    const typedHandlers = this.handlers.get(event.type);
    if (!typedHandlers || typedHandlers.size === 0) {
      return;
    }

    for (const handler of typedHandlers) {
      try {
        handler(event as CncPluginEventMap[CncPluginEventType]);
      } catch (error) {
        logger.error('Plugin event handler failed', {
          eventType: event.type,
          error,
        });
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export type { CncPluginEventMap, CncPluginEventType } from './plugins/types';
