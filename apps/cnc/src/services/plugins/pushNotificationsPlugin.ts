import config from '../../config';
import type { PushNotificationEventType } from '@kaonis/woly-protocol';
import PushNotificationService from '../pushNotificationService';
import type { PluginContext, WolyPlugin } from './types';

export class PushNotificationsPlugin implements WolyPlugin {
  readonly name = 'push-notifications';
  readonly version = '1.0.0';

  private readonly service: PushNotificationService;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(options?: { service?: PushNotificationService }) {
    this.service = options?.service ?? new PushNotificationService();
  }

  init(context: PluginContext): void {
    if (!config.pushNotificationsEnabled) {
      return;
    }

    this.unsubscribers.push(
      context.eventBus.subscribe('host.status-transition', (event) => {
        const mappedEventType: PushNotificationEventType =
          event.data.newStatus === 'awake' ? 'host.awake' : 'host.asleep';

        void this.service.sendEvent(mappedEventType, {
          hostFqn: event.data.hostFqn,
          oldStatus: event.data.oldStatus,
          newStatus: event.data.newStatus,
          changedAt: event.data.changedAt,
        });
      })
    );

    this.unsubscribers.push(
      context.eventBus.subscribe('scan.complete', (event) => {
        void this.service.sendEvent('scan.complete', event.data);
      })
    );

    this.unsubscribers.push(
      context.eventBus.subscribe('node.disconnected', (event) => {
        void this.service.sendEvent('node.disconnected', event.data);
      })
    );
  }

  destroy(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers.length = 0;
  }
}

export default PushNotificationsPlugin;
