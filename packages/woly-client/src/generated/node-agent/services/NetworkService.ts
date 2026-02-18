/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Host } from '../models/Host';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class NetworkService {
    /**
     * Trigger immediate network scan
     * Force an immediate network discovery scan using ARP, ICMP ping, and DNS/NetBIOS lookups. Rate limited to 5 requests per minute.
     * @returns any Scan completed successfully
     * @throws ApiError
     */
    public static postHostsScan(): CancelablePromise<{
        message?: string;
        hostsCount?: number;
        hosts?: Array<Host>;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/hosts/scan',
            errors: {
                401: `Unauthorized - API key required (when NODE_API_KEY is configured)`,
                429: `Rate limit exceeded`,
                500: `Internal server error`,
            },
        });
    }
}
