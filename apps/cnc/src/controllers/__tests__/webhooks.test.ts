import type { Request, Response } from 'express';
import { WebhooksController } from '../webhooks';
import WebhookModel from '../../models/Webhook';

jest.mock('../../models/Webhook', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    list: jest.fn(),
    delete: jest.fn(),
    findById: jest.fn(),
    listDeliveries: jest.fn(),
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

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function createMockRequest(options?: {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
}): Request {
  return {
    params: options?.params ?? {},
    query: options?.query ?? {},
    body: options?.body ?? {},
  } as unknown as Request;
}

describe('WebhooksController', () => {
  let controller: WebhooksController;
  const mockedWebhookModel = WebhookModel as jest.Mocked<typeof WebhookModel>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new WebhooksController();
  });

  it('returns 400 for invalid create payloads', async () => {
    const req = createMockRequest({
      body: { url: 'not-a-url', events: [] },
    });
    const res = createMockResponse();

    await controller.createWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockedWebhookModel.create).not.toHaveBeenCalled();
  });

  it('creates webhooks when payload is valid', async () => {
    mockedWebhookModel.create.mockResolvedValue({
      id: 'webhook-1',
      url: 'https://example.com/hooks/woly',
      events: ['host.awake'],
      hasSecret: true,
      createdAt: '2026-02-18T00:00:00.000Z',
      updatedAt: '2026-02-18T00:00:00.000Z',
    });

    const req = createMockRequest({
      body: {
        url: 'https://example.com/hooks/woly',
        events: ['host.awake'],
        secret: 'secret',
      },
    });
    const res = createMockResponse();

    await controller.createWebhook(req, res);

    expect(mockedWebhookModel.create).toHaveBeenCalledWith({
      url: 'https://example.com/hooks/woly',
      events: ['host.awake'],
      secret: 'secret',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'webhook-1',
      }),
    );
  });

  it('lists webhooks', async () => {
    mockedWebhookModel.list.mockResolvedValue([
      {
        id: 'webhook-1',
        url: 'https://example.com/hooks/woly',
        events: ['host.awake'],
        hasSecret: false,
        createdAt: '2026-02-18T00:00:00.000Z',
        updatedAt: '2026-02-18T00:00:00.000Z',
      },
    ]);

    const req = createMockRequest();
    const res = createMockResponse();

    await controller.listWebhooks(req, res);

    expect(mockedWebhookModel.list).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      webhooks: [
        expect.objectContaining({
          id: 'webhook-1',
        }),
      ],
    });
  });

  it('returns 404 when deleting a missing webhook', async () => {
    mockedWebhookModel.delete.mockResolvedValue(false);

    const req = createMockRequest({ params: { id: 'missing' } });
    const res = createMockResponse();

    await controller.deleteWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Not Found',
      message: 'Webhook missing not found',
    });
  });

  it('returns 400 for invalid delivery log queries', async () => {
    const req = createMockRequest({
      params: { id: 'webhook-1' },
      query: { limit: '0' },
    });
    const res = createMockResponse();

    await controller.getWebhookDeliveries(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockedWebhookModel.listDeliveries).not.toHaveBeenCalled();
  });

  it('returns delivery logs for existing webhooks', async () => {
    mockedWebhookModel.findById.mockResolvedValue({
      id: 'webhook-1',
      url: 'https://example.com/hooks/woly',
      events: ['host.awake'],
      hasSecret: false,
      createdAt: '2026-02-18T00:00:00.000Z',
      updatedAt: '2026-02-18T00:00:00.000Z',
    });
    mockedWebhookModel.listDeliveries.mockResolvedValue([
      {
        id: 1,
        webhookId: 'webhook-1',
        eventType: 'host.awake',
        attempt: 1,
        status: 'success',
        responseStatus: 204,
        error: null,
        payload: { event: 'host.awake' },
        createdAt: '2026-02-18T00:01:00.000Z',
      },
    ]);

    const req = createMockRequest({
      params: { id: 'webhook-1' },
      query: { limit: '50' },
    });
    const res = createMockResponse();

    await controller.getWebhookDeliveries(req, res);

    expect(mockedWebhookModel.listDeliveries).toHaveBeenCalledWith('webhook-1', 50);
    expect(res.json).toHaveBeenCalledWith({
      webhookId: 'webhook-1',
      deliveries: [
        expect.objectContaining({
          id: 1,
        }),
      ],
    });
  });
});
