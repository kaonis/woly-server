/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WebhookEventType } from './WebhookEventType';
export type WebhookDeliveryLog = {
    id: number;
    webhookId: string;
    eventType: WebhookEventType;
    attempt: number;
    status: 'success' | 'failed';
    responseStatus: number | null;
    error: string | null;
    payload: Record<string, any>;
    createdAt: string;
};

