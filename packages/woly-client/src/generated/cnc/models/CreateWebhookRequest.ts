/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WebhookEventType } from './WebhookEventType';
export type CreateWebhookRequest = {
    url: string;
    /**
     * Webhook event filters. Invalid or duplicate values are rejected with a 400 response.
     */
    events: Array<WebhookEventType>;
    secret?: string | null;
};

