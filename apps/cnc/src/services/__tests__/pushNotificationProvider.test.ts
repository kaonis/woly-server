import {
  ApnsPushNotificationProvider,
  FcmPushNotificationProvider,
  type PushNotificationMessage,
} from '../pushNotificationProvider';

const MESSAGE: PushNotificationMessage = {
  title: 'Wake Alert',
  body: 'Host desktop is awake',
  eventType: 'host.awake',
  data: {
    hostFqn: 'desktop@node-1',
  },
};

describe('pushNotificationProvider', () => {
  it('returns non-permanent failure when FCM key is missing', async () => {
    const fetchMock = jest.fn() as unknown as typeof fetch;
    const provider = new FcmPushNotificationProvider({
      fetchImpl: fetchMock,
      serverKey: '',
    });

    const result = await provider.send('token-123', MESSAGE);

    expect(result).toEqual({
      success: false,
      statusCode: null,
      error: 'FCM server key is not configured',
      permanentFailure: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends FCM payload and marks permanent failure for unregistered tokens', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 200,
      text: async () => 'NotRegistered',
    })) as unknown as typeof fetch;

    const provider = new FcmPushNotificationProvider({
      fetchImpl: fetchMock,
      serverKey: 'server-key',
    });

    const result = await provider.send('token-123', MESSAGE);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://fcm.googleapis.com/fcm/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'key=server-key',
        }),
      }),
    );
    expect(result).toEqual({
      success: false,
      statusCode: 200,
      error: 'NotRegistered',
      permanentFailure: true,
    });
  });

  it('sends APNS payload when credentials exist', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
    })) as unknown as typeof fetch;

    const provider = new ApnsPushNotificationProvider({
      fetchImpl: fetchMock,
      bearerToken: 'apns-token',
      topic: 'com.example.woly',
      host: 'https://api.sandbox.push.apple.com',
    });

    const result = await provider.send('ios-token-123', MESSAGE);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.sandbox.push.apple.com/3/device/ios-token-123',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'bearer apns-token',
          'apns-topic': 'com.example.woly',
        }),
      }),
    );
    expect(result).toEqual({
      success: true,
      statusCode: 200,
      error: null,
      permanentFailure: false,
    });
  });

  it('marks APNS 410 responses as permanent failures', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 410,
      text: async () => 'Unregistered',
    })) as unknown as typeof fetch;

    const provider = new ApnsPushNotificationProvider({
      fetchImpl: fetchMock,
      bearerToken: 'apns-token',
      topic: 'com.example.woly',
      host: 'https://api.push.apple.com',
    });

    const result = await provider.send('ios-token-123', MESSAGE);

    expect(result).toEqual({
      success: false,
      statusCode: 410,
      error: 'Unregistered',
      permanentFailure: true,
    });
  });
});
