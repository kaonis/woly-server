/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WebhookEventType } from './WebhookEventType';
export type CreateWebhookRequest = {
    url: string;
    events: Array<WebhookEventType>;
    secret?: string | null;
};

