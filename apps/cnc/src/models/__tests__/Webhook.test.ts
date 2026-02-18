import db from '../../database/connection';
import WebhookModel from '../Webhook';

describe('WebhookModel', () => {
  beforeAll(async () => {
    await db.connect();
    await WebhookModel.ensureTable();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM webhook_delivery_logs');
    await db.query('DELETE FROM webhooks');
  });

  afterAll(async () => {
    await db.close();
  });

  it('creates and lists webhook subscriptions', async () => {
    const created = await WebhookModel.create({
      url: 'https://example.com/webhooks/a',
      events: ['host.awake', 'node.disconnected'],
      secret: 'shared-secret',
    });

    expect(created.url).toBe('https://example.com/webhooks/a');
    expect(created.events).toEqual(['host.awake', 'node.disconnected']);
    expect(created.hasSecret).toBe(true);

    const listed = await WebhookModel.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);

    const found = await WebhookModel.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.url).toBe(created.url);
  });

  it('filters webhook targets by subscribed event', async () => {
    await WebhookModel.create({
      url: 'https://example.com/webhooks/awake',
      events: ['host.awake'],
    });

    await WebhookModel.create({
      url: 'https://example.com/webhooks/sleep',
      events: ['host.asleep'],
    });

    const awakeTargets = await WebhookModel.listTargetsByEvent('host.awake');
    expect(awakeTargets).toHaveLength(1);
    expect(awakeTargets[0].url).toBe('https://example.com/webhooks/awake');

    const nodeTargets = await WebhookModel.listTargetsByEvent('node.connected');
    expect(nodeTargets).toHaveLength(0);
  });

  it('records and lists delivery log entries', async () => {
    const webhook = await WebhookModel.create({
      url: 'https://example.com/webhooks/delivery',
      events: ['scan.complete'],
    });

    await WebhookModel.recordDelivery({
      webhookId: webhook.id,
      eventType: 'scan.complete',
      attempt: 1,
      status: 'failed',
      responseStatus: 500,
      error: 'HTTP 500',
      payload: {
        event: 'scan.complete',
        timestamp: new Date().toISOString(),
        data: { nodeId: 'node-a', hostCount: 12 },
      },
    });

    await WebhookModel.recordDelivery({
      webhookId: webhook.id,
      eventType: 'scan.complete',
      attempt: 2,
      status: 'success',
      responseStatus: 204,
      error: null,
      payload: {
        event: 'scan.complete',
        timestamp: new Date().toISOString(),
        data: { nodeId: 'node-a', hostCount: 12 },
      },
    });

    const deliveries = await WebhookModel.listDeliveries(webhook.id, 10);
    expect(deliveries).toHaveLength(2);
    expect(deliveries[0].attempt).toBe(2);
    expect(deliveries[0].status).toBe('success');
    expect(deliveries[1].attempt).toBe(1);
    expect(deliveries[1].status).toBe('failed');
  });

  it('deletes webhook subscriptions', async () => {
    const webhook = await WebhookModel.create({
      url: 'https://example.com/webhooks/delete-me',
      events: ['host.removed'],
    });

    const deleted = await WebhookModel.delete(webhook.id);
    expect(deleted).toBe(true);

    const missing = await WebhookModel.findById(webhook.id);
    expect(missing).toBeNull();

    const deletedMissing = await WebhookModel.delete(webhook.id);
    expect(deletedMissing).toBe(false);
  });
});
