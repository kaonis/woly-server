import type { WebhookEventType } from '@kaonis/woly-protocol';
import { WebhookDispatcher } from '../webhookDispatcher';
import type { PluginContext, WolyPlugin } from './types';

export class WebhookPlugin implements WolyPlugin {
  readonly name = 'webhook';
  readonly version = '1.0.0';

  private readonly dispatcher: WebhookDispatcher;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(options?: { dispatcher?: WebhookDispatcher }) {
    this.dispatcher = options?.dispatcher ?? new WebhookDispatcher();
  }

  init(context: PluginContext): void {
    this.unsubscribers.push(
      context.eventBus.subscribe('host.discovered', (event) => {
        void this.dispatcher.dispatchEvent('host.discovered', event.data);
      })
    );

    this.unsubscribers.push(
      context.eventBus.subscribe('host.removed', (event) => {
        void this.dispatcher.dispatchEvent('host.removed', event.data);
      })
    );

    this.unsubscribers.push(
      context.eventBus.subscribe('host.status-transition', (event) => {
        const webhookEventType: WebhookEventType = event.data.newStatus === 'awake' ? 'host.awake' : 'host.asleep';
        void this.dispatcher.dispatchEvent(webhookEventType, {
          hostFqn: event.data.hostFqn,
          oldStatus: event.data.oldStatus,
          newStatus: event.data.newStatus,
          changedAt: event.data.changedAt,
        });
      })
    );

    this.unsubscribers.push(
      context.eventBus.subscribe('node.connected', (event) => {
        void this.dispatcher.dispatchEvent('node.connected', event.data);
      })
    );

    this.unsubscribers.push(
      context.eventBus.subscribe('node.disconnected', (event) => {
        void this.dispatcher.dispatchEvent('node.disconnected', event.data);
      })
    );

    this.unsubscribers.push(
      context.eventBus.subscribe('scan.complete', (event) => {
        void this.dispatcher.dispatchEvent('scan.complete', event.data);
      })
    );
  }

  destroy(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers.length = 0;
    this.dispatcher.shutdown();
  }
}

export default WebhookPlugin;
