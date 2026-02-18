import { createHmac } from 'crypto';
import type { Host, HostStatus, WebhookEventType } from '@kaonis/woly-protocol';
import config from '../config';
import type { HostAggregator } from './hostAggregator';
import type { NodeManager } from './nodeManager';
import WebhookModel, { type WebhookTarget } from '../models/Webhook';
import logger from '../utils/logger';

type HostDiscoveredPayload = {
  nodeId: string;
  hostFqn: string;
  host: Host;
};

type HostRemovedPayload = {
  nodeId: string;
  name: string;
};

type HostStatusTransitionPayload = {
  hostFqn: string;
  oldStatus: HostStatus;
  newStatus: HostStatus;
  changedAt: string;
};

type NodeConnectionPayload = {
  nodeId: string;
};

type ScanCompletePayload = {
  nodeId: string;
  hostCount: number;
};

type WebhookEnvelope = {
  event: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
};

type FetchImpl = typeof fetch;

const MAX_DELIVERY_ATTEMPTS = 3;

export class WebhookDispatcher {
  private readonly fetchImpl: FetchImpl;
  private readonly retryBaseDelayMs: number;
  private readonly deliveryTimeoutMs: number;
  private readonly pendingTimers = new Set<NodeJS.Timeout>();
  private started = false;

  constructor(
    private readonly hostAggregator: HostAggregator,
    private readonly nodeManager: NodeManager,
    options?: {
      fetchImpl?: FetchImpl;
      retryBaseDelayMs?: number;
      deliveryTimeoutMs?: number;
    },
  ) {
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.retryBaseDelayMs = options?.retryBaseDelayMs ?? config.webhookRetryBaseDelayMs;
    this.deliveryTimeoutMs = options?.deliveryTimeoutMs ?? config.webhookDeliveryTimeoutMs;
  }

  private readonly onHostAdded = (payload: HostDiscoveredPayload): void => {
    const data = {
      nodeId: payload.nodeId,
      hostFqn: payload.hostFqn,
      host: payload.host,
    };

    void this.dispatch('host.discovered', data);
  };

  private readonly onHostRemoved = (payload: HostRemovedPayload): void => {
    void this.dispatch('host.removed', {
      nodeId: payload.nodeId,
      name: payload.name,
    });
  };

  private readonly onHostStatusTransition = (payload: HostStatusTransitionPayload): void => {
    const eventType: WebhookEventType = payload.newStatus === 'awake' ? 'host.awake' : 'host.asleep';
    void this.dispatch(eventType, {
      hostFqn: payload.hostFqn,
      oldStatus: payload.oldStatus,
      newStatus: payload.newStatus,
      changedAt: payload.changedAt,
    });
  };

  private readonly onNodeConnected = (payload: NodeConnectionPayload): void => {
    void this.dispatch('node.connected', { nodeId: payload.nodeId });
  };

  private readonly onNodeDisconnected = (payload: NodeConnectionPayload): void => {
    void this.dispatch('node.disconnected', { nodeId: payload.nodeId });
  };

  private readonly onScanComplete = (payload: ScanCompletePayload): void => {
    void this.dispatch('scan.complete', {
      nodeId: payload.nodeId,
      hostCount: payload.hostCount,
    });
  };

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.hostAggregator.on('host-added', this.onHostAdded);
    this.hostAggregator.on('host-removed', this.onHostRemoved);
    this.hostAggregator.on('host-status-transition', this.onHostStatusTransition);
    this.nodeManager.on('node-connected', this.onNodeConnected);
    this.nodeManager.on('node-disconnected', this.onNodeDisconnected);
    this.nodeManager.on('scan-complete', this.onScanComplete);
  }

  shutdown(): void {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.hostAggregator.off('host-added', this.onHostAdded);
    this.hostAggregator.off('host-removed', this.onHostRemoved);
    this.hostAggregator.off('host-status-transition', this.onHostStatusTransition);
    this.nodeManager.off('node-connected', this.onNodeConnected);
    this.nodeManager.off('node-disconnected', this.onNodeDisconnected);
    this.nodeManager.off('scan-complete', this.onScanComplete);

    for (const timer of this.pendingTimers) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();
  }

  private createEnvelope(eventType: WebhookEventType, data: Record<string, unknown>): WebhookEnvelope {
    return {
      event: eventType,
      timestamp: new Date().toISOString(),
      data,
    };
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    return String(error);
  }

  private async dispatch(eventType: WebhookEventType, data: Record<string, unknown>): Promise<void> {
    let targets: WebhookTarget[];

    try {
      targets = await WebhookModel.listTargetsByEvent(eventType);
    } catch (error) {
      logger.error('Failed to load webhook targets for event dispatch', {
        eventType,
        error: this.formatError(error),
      });
      return;
    }

    if (targets.length === 0) {
      return;
    }

    const envelope = this.createEnvelope(eventType, data);
    await Promise.all(targets.map((target) => this.deliver(target, envelope, 1)));
  }

  private buildSignature(secret: string, body: string): string {
    const digest = createHmac('sha256', secret).update(body).digest('hex');
    return `sha256=${digest}`;
  }

  private async postWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.deliveryTimeoutMs);

    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private scheduleRetry(target: WebhookTarget, envelope: WebhookEnvelope, nextAttempt: number): void {
    const delayMs = this.retryBaseDelayMs * Math.pow(2, Math.max(nextAttempt - 2, 0));
    const timer = setTimeout(() => {
      this.pendingTimers.delete(timer);
      void this.deliver(target, envelope, nextAttempt);
    }, delayMs);

    this.pendingTimers.add(timer);
  }

  private async deliver(target: WebhookTarget, envelope: WebhookEnvelope, attempt: number): Promise<void> {
    const payloadJson = JSON.stringify(envelope);
    let status: 'success' | 'failed' = 'failed';
    let responseStatus: number | null = null;
    let errorMessage: string | null = null;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'woly-cnc-webhook/1.0',
      'X-Woly-Event': envelope.event,
      'X-Woly-Delivery-Attempt': String(attempt),
    };

    if (target.secret) {
      headers['X-Woly-Signature'] = this.buildSignature(target.secret, payloadJson);
    }

    try {
      const response = await this.postWithTimeout(target.url, {
        method: 'POST',
        headers,
        body: payloadJson,
      });

      responseStatus = response.status;
      if (response.ok) {
        status = 'success';
      } else {
        errorMessage = `HTTP ${response.status}`;
      }
    } catch (error) {
      errorMessage = this.formatError(error);
    }

    try {
      await WebhookModel.recordDelivery({
        webhookId: target.id,
        eventType: envelope.event,
        attempt,
        status,
        responseStatus,
        error: errorMessage,
        payload: envelope,
      });
    } catch (error) {
      logger.warn('Failed to record webhook delivery log', {
        webhookId: target.id,
        eventType: envelope.event,
        attempt,
        error: this.formatError(error),
      });
    }

    if (status === 'success') {
      return;
    }

    if (attempt >= MAX_DELIVERY_ATTEMPTS) {
      logger.warn('Webhook delivery failed after max retries', {
        webhookId: target.id,
        url: target.url,
        eventType: envelope.event,
        attempt,
        error: errorMessage,
        responseStatus,
      });
      return;
    }

    this.scheduleRetry(target, envelope, attempt + 1);
  }
}

export default WebhookDispatcher;
