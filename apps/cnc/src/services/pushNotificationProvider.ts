import config from '../config';

export interface PushNotificationMessage {
  title: string;
  body: string;
  eventType: string;
  data: Record<string, unknown>;
}

export interface PushDispatchResult {
  success: boolean;
  statusCode: number | null;
  error: string | null;
  permanentFailure: boolean;
}

export interface PushNotificationProvider {
  send(token: string, message: PushNotificationMessage): Promise<PushDispatchResult>;
}

function parseResponseText(text: string | null): string | null {
  if (!text) {
    return null;
  }
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class FcmPushNotificationProvider implements PushNotificationProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly serverKey: string;
  private readonly endpoint: string;

  constructor(options?: { fetchImpl?: typeof fetch; serverKey?: string; endpoint?: string }) {
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.serverKey = options?.serverKey ?? config.fcmServerKey;
    this.endpoint = options?.endpoint ?? 'https://fcm.googleapis.com/fcm/send';
  }

  async send(token: string, message: PushNotificationMessage): Promise<PushDispatchResult> {
    if (!this.serverKey) {
      return {
        success: false,
        statusCode: null,
        error: 'FCM server key is not configured',
        permanentFailure: false,
      };
    }

    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${this.serverKey}`,
      },
      body: JSON.stringify({
        to: token,
        priority: 'high',
        notification: {
          title: message.title,
          body: message.body,
        },
        data: {
          eventType: message.eventType,
          ...message.data,
        },
      }),
    });

    if (response.ok) {
      return {
        success: true,
        statusCode: response.status,
        error: null,
        permanentFailure: false,
      };
    }

    const text = parseResponseText(await response.text().catch(() => null));
    const permanentFailure =
      response.status === 400 ||
      response.status === 404 ||
      response.status === 410 ||
      (text !== null && /NotRegistered|InvalidRegistration/i.test(text));

    return {
      success: false,
      statusCode: response.status,
      error: text,
      permanentFailure,
    };
  }
}

export class ApnsPushNotificationProvider implements PushNotificationProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly bearerToken: string;
  private readonly topic: string;
  private readonly host: string;

  constructor(options?: { fetchImpl?: typeof fetch; bearerToken?: string; topic?: string; host?: string }) {
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.bearerToken = options?.bearerToken ?? config.apnsBearerToken;
    this.topic = options?.topic ?? config.apnsTopic;
    this.host = options?.host ?? config.apnsHost;
  }

  async send(token: string, message: PushNotificationMessage): Promise<PushDispatchResult> {
    if (!this.bearerToken || !this.topic) {
      return {
        success: false,
        statusCode: null,
        error: 'APNS credentials are not configured',
        permanentFailure: false,
      };
    }

    const endpoint = `${this.host.replace(/\/$/, '')}/3/device/${encodeURIComponent(token)}`;
    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `bearer ${this.bearerToken}`,
        'apns-topic': this.topic,
        'apns-push-type': 'alert',
      },
      body: JSON.stringify({
        aps: {
          alert: {
            title: message.title,
            body: message.body,
          },
          sound: 'default',
        },
        data: {
          eventType: message.eventType,
          ...message.data,
        },
      }),
    });

    if (response.ok) {
      return {
        success: true,
        statusCode: response.status,
        error: null,
        permanentFailure: false,
      };
    }

    const text = parseResponseText(await response.text().catch(() => null));
    const permanentFailure = response.status === 400 || response.status === 410;

    return {
      success: false,
      statusCode: response.status,
      error: text,
      permanentFailure,
    };
  }
}
