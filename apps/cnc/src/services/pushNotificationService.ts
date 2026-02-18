import type { PushNotificationEventType, PushNotificationPlatform } from '@kaonis/woly-protocol';
import config from '../config';
import PushNotificationModel, { DEFAULT_NOTIFICATION_PREFERENCES } from '../models/PushNotification';
import logger from '../utils/logger';
import {
  ApnsPushNotificationProvider,
  FcmPushNotificationProvider,
  type PushNotificationMessage,
  type PushNotificationProvider,
} from './pushNotificationProvider';

function resolveHour(date: Date, timezone?: string): number {
  if (!timezone) {
    return date.getUTCHours();
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: timezone,
    });
    const formatted = formatter.format(date);
    const parsed = Number.parseInt(formatted, 10);
    return Number.isFinite(parsed) ? parsed : date.getUTCHours();
  } catch {
    return date.getUTCHours();
  }
}

function isWithinQuietHours(
  quietHours: { startHour: number; endHour: number; timezone?: string } | null | undefined,
  now: Date,
): boolean {
  if (!quietHours) {
    return false;
  }

  const hour = resolveHour(now, quietHours.timezone);
  const { startHour, endHour } = quietHours;

  if (startHour === endHour) {
    return true;
  }

  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }

  return hour >= startHour || hour < endHour;
}

function normalizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, value ?? null]));
}

function buildMessage(eventType: PushNotificationEventType, payload: Record<string, unknown>): PushNotificationMessage {
  switch (eventType) {
    case 'host.awake':
      return {
        title: 'Host Awake',
        body: `${String(payload.hostFqn ?? payload.hostName ?? 'A host')} is now awake`,
        eventType,
        data: normalizePayload(payload),
      };
    case 'host.asleep':
      return {
        title: 'Host Asleep',
        body: `${String(payload.hostFqn ?? payload.hostName ?? 'A host')} is now asleep`,
        eventType,
        data: normalizePayload(payload),
      };
    case 'scan.complete':
      return {
        title: 'Scan Complete',
        body: `Node ${String(payload.nodeId ?? 'unknown')} scanned ${String(payload.hostCount ?? 0)} hosts`,
        eventType,
        data: normalizePayload(payload),
      };
    case 'schedule.wake':
      return {
        title: 'Scheduled Wake',
        body: `${String(payload.hostFqn ?? payload.hostName ?? 'Host')} wake schedule was executed`,
        eventType,
        data: normalizePayload(payload),
      };
    case 'node.disconnected':
      return {
        title: 'Node Offline',
        body: `Node ${String(payload.nodeId ?? 'unknown')} disconnected`,
        eventType,
        data: normalizePayload(payload),
      };
    default:
      return {
        title: 'WoLy Notification',
        body: eventType,
        eventType,
        data: normalizePayload(payload),
      };
  }
}

type PushNotificationServiceOptions = {
  now?: () => Date;
  providers?: Partial<Record<PushNotificationPlatform, PushNotificationProvider>>;
};

export class PushNotificationService {
  private readonly now: () => Date;
  private readonly providers: Record<PushNotificationPlatform, PushNotificationProvider>;

  constructor(options?: PushNotificationServiceOptions) {
    this.now = options?.now ?? (() => new Date());
    this.providers = {
      android: options?.providers?.android ?? new FcmPushNotificationProvider(),
      ios: options?.providers?.ios ?? new ApnsPushNotificationProvider(),
    };
  }

  async sendEvent(eventType: PushNotificationEventType, payload: Record<string, unknown>): Promise<void> {
    if (!config.pushNotificationsEnabled) {
      return;
    }

    const devices = await PushNotificationModel.listAllDevices();
    if (devices.length === 0) {
      return;
    }

    const userIds = devices.map((device) => device.userId);
    const preferencesByUser = await PushNotificationModel.getPreferencesByUsers(userIds);
    const now = this.now();

    for (const device of devices) {
      const preferences = preferencesByUser.get(device.userId) ?? DEFAULT_NOTIFICATION_PREFERENCES;
      if (!preferences.enabled || !preferences.events.includes(eventType)) {
        continue;
      }

      if (isWithinQuietHours(preferences.quietHours ?? null, now)) {
        continue;
      }

      const provider = this.providers[device.platform];
      const message = buildMessage(eventType, payload);

      try {
        const result = await provider.send(device.token, message);
        if (!result.success) {
          logger.warn('Push delivery attempt failed', {
            eventType,
            userId: device.userId,
            deviceId: device.id,
            platform: device.platform,
            statusCode: result.statusCode,
            error: result.error,
          });

          if (result.permanentFailure) {
            await PushNotificationModel.deleteDeviceByToken(device.token);
          }
        }
      } catch (error) {
        logger.error('Push delivery threw unexpected error', {
          eventType,
          userId: device.userId,
          deviceId: device.id,
          platform: device.platform,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export default PushNotificationService;
