/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class WakeOnLanService {
    /**
     * Wake up a host using Wake-on-LAN
     * Send a Wake-on-LAN magic packet to the specified host
     * @param name The hostname to wake up
     * @param verify Enable/disable post-WoL wake verification for this request
     * @param verifyTimeoutMs Verification timeout in milliseconds (bounded by server limits)
     * @param verifyPollIntervalMs Verification polling interval in milliseconds (bounded by server limits)
     * @param requestBody
     * @returns any Magic packet sent successfully
     * @throws ApiError
     */
    public static postHostsWakeup(
        name: string,
        verify?: boolean,
        verifyTimeoutMs?: number,
        verifyPollIntervalMs?: number,
        requestBody?: {
            /**
             * Optional WoL UDP destination port override for this request
             */
            wolPort?: number;
        },
    ): CancelablePromise<{
        success?: boolean;
        name?: string;
        mac?: string;
        wolPort?: number;
        message?: string;
        verification?: {
            enabled?: boolean;
            status?: 'not_requested' | 'woke' | 'timeout' | 'not_confirmed' | 'host_not_found' | 'error';
            attempts?: number;
            timeoutMs?: number;
            pollIntervalMs?: number;
            elapsedMs?: number;
            lastObservedStatus?: 'awake' | 'asleep' | 'unknown';
            source?: 'database' | 'ping';
            message?: string;
        };
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/hosts/wakeup/{name}',
            path: {
                'name': name,
            },
            query: {
                'verify': verify,
                'verifyTimeoutMs': verifyTimeoutMs,
                'verifyPollIntervalMs': verifyPollIntervalMs,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized - API key required (when NODE_API_KEY is configured)`,
                404: `Host not found`,
                429: `Rate limit exceeded`,
                500: `Internal server error`,
            },
        });
    }
}
