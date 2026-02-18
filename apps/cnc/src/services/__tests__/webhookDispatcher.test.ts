import { WebhookDispatcher } from '../webhookDispatcher';
import WebhookModel from '../../models/Webhook';

jest.mock('../../models/Webhook', () => ({
  __esModule: true,
  default: {
    listTargetsByEvent: jest.fn(),
    recordDelivery: jest.fn(),
  },
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('WebhookDispatcher', () => {
  const mockedWebhookModel = WebhookModel as jest.Mocked<typeof WebhookModel>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('skips delivery when no webhook targets are configured for event', async () => {
    const fetchMock = jest.fn() as unknown as typeof fetch;
    mockedWebhookModel.listTargetsByEvent.mockResolvedValue([] as never);

    const dispatcher = new WebhookDispatcher({
      fetchImpl: fetchMock,
      retryBaseDelayMs: 10,
      deliveryTimeoutMs: 1000,
    });

    await dispatcher.dispatchEvent('host.awake', {
      hostFqn: 'desktop@home-node',
      oldStatus: 'asleep',
      newStatus: 'awake',
      changedAt: '2026-02-18T20:00:00.000Z',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockedWebhookModel.recordDelivery).not.toHaveBeenCalled();
  });

  it('delivers webhook payloads with HMAC signature and logs success', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 204,
    })) as unknown as typeof fetch;

    mockedWebhookModel.listTargetsByEvent.mockResolvedValue([
      {
        id: 'webhook-1',
        url: 'https://example.com/hooks/woly',
        events: ['host.awake'],
        secret: 'shared-secret',
      },
    ] as never);

    const dispatcher = new WebhookDispatcher({
      fetchImpl: fetchMock,
      retryBaseDelayMs: 10,
      deliveryTimeoutMs: 1000,
    });

    await dispatcher.dispatchEvent('host.awake', {
      hostFqn: 'desktop@home-node',
      oldStatus: 'asleep',
      newStatus: 'awake',
      changedAt: '2026-02-18T20:00:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/hooks/woly',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Woly-Event': 'host.awake',
          'X-Woly-Delivery-Attempt': '1',
          'X-Woly-Signature': expect.stringMatching(/^sha256=/),
        }),
      }),
    );

    expect(mockedWebhookModel.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookId: 'webhook-1',
        eventType: 'host.awake',
        attempt: 1,
        status: 'success',
        responseStatus: 204,
      }),
    );
  });

  it('retries failed deliveries with exponential backoff up to success', async () => {
    jest.useFakeTimers();

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 }) as unknown as typeof fetch;

    mockedWebhookModel.listTargetsByEvent.mockResolvedValue([
      {
        id: 'webhook-2',
        url: 'https://example.com/hooks/retry',
        events: ['scan.complete'],
        secret: null,
      },
    ] as never);

    const dispatcher = new WebhookDispatcher({
      fetchImpl: fetchMock,
      retryBaseDelayMs: 25,
      deliveryTimeoutMs: 1000,
    });

    await dispatcher.dispatchEvent('scan.complete', {
      nodeId: 'node-1',
      hostCount: 3,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockedWebhookModel.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookId: 'webhook-2',
        eventType: 'scan.complete',
        attempt: 1,
        status: 'failed',
        responseStatus: 503,
      }),
    );

    await jest.advanceTimersByTimeAsync(25);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockedWebhookModel.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookId: 'webhook-2',
        eventType: 'scan.complete',
        attempt: 2,
        status: 'success',
        responseStatus: 200,
      }),
    );

    dispatcher.shutdown();
  });
});
