/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WebhookEventType } from './WebhookEventType';
export type Error = {
    /**
     * Error type
     */
    error?: string;
    /**
     * Human-readable error message
     */
    message?: string;
    /**
     * Error code (for authentication errors)
     */
    code?: string;
    /**
     * Structured validation details when a request payload fails schema validation.
     */
    details?: Array<Record<string, any>>;
    /**
     * Supported webhook event filters returned with webhook validation errors.
     */
    supportedEvents?: Array<WebhookEventType>;
};

