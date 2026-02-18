/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WebhookEventType } from './WebhookEventType';
export type WebhookSubscription = {
    id: string;
    url: string;
    events: Array<WebhookEventType>;
    hasSecret: boolean;
    createdAt: string;
    updatedAt: string;
};

