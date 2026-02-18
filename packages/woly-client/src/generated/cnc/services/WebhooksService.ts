/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateWebhookRequest } from '../models/CreateWebhookRequest';
import type { DeleteWebhookResponse } from '../models/DeleteWebhookResponse';
import type { WebhookDeliveriesResponse } from '../models/WebhookDeliveriesResponse';
import type { WebhooksResponse } from '../models/WebhooksResponse';
import type { WebhookSubscription } from '../models/WebhookSubscription';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class WebhooksService {
    /**
     * Register a webhook endpoint
     * Registers a webhook URL and subscribed event types for host/node lifecycle notifications.
     * @param requestBody
     * @returns WebhookSubscription Webhook created
     * @throws ApiError
     */
    public static postApiWebhooks(
        requestBody: CreateWebhookRequest,
    ): CancelablePromise<WebhookSubscription> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/webhooks',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request parameters`,
                401: `Missing or invalid authentication`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * List configured webhooks
     * @returns WebhooksResponse Registered webhook list
     * @throws ApiError
     */
    public static getApiWebhooks(): CancelablePromise<WebhooksResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/webhooks',
            errors: {
                401: `Missing or invalid authentication`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Delete a webhook registration
     * @param id
     * @returns DeleteWebhookResponse Webhook deleted
     * @throws ApiError
     */
    public static deleteApiWebhooks(
        id: string,
    ): CancelablePromise<DeleteWebhookResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/webhooks/{id}',
            path: {
                'id': id,
            },
            errors: {
                401: `Missing or invalid authentication`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * List webhook delivery attempts for debugging
     * @param id
     * @param limit
     * @returns WebhookDeliveriesResponse Delivery attempt logs
     * @throws ApiError
     */
    public static getApiWebhooksDeliveries(
        id: string,
        limit?: number,
    ): CancelablePromise<WebhookDeliveriesResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/webhooks/{id}/deliveries',
            path: {
                'id': id,
            },
            query: {
                'limit': limit,
            },
            errors: {
                400: `Invalid request parameters`,
                401: `Missing or invalid authentication`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
}
