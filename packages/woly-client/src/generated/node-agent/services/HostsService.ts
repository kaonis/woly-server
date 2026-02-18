/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Host } from '../models/Host';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class HostsService {
    /**
     * Get all hosts
     * Retrieve a list of all network hosts (both discovered and manually added)
     * @returns any List of hosts with scan status
     * @throws ApiError
     */
    public static getHosts(): CancelablePromise<{
        hosts?: Array<Host>;
        /**
         * Whether a network scan is currently running
         */
        scanInProgress?: boolean;
        /**
         * Timestamp of the last completed scan
         */
        lastScanTime?: string | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/hosts',
            errors: {
                401: `Unauthorized - API key required (when NODE_API_KEY is configured)`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Add a new host manually
     * Manually add a host to the database (not discovered automatically)
     * @param requestBody
     * @returns Host Host added successfully
     * @throws ApiError
     */
    public static postHosts(
        requestBody: {
            /**
             * Unique hostname
             */
            name: string;
            /**
             * MAC address in XX:XX:XX:XX:XX:XX format
             */
            mac: string;
            /**
             * IPv4 address
             */
            ip: string;
            /**
             * Optional operator notes for the host
             */
            notes?: string | null;
            /**
             * Optional host tags
             */
            tags?: Array<string>;
        },
    ): CancelablePromise<Host> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/hosts',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request parameters`,
                401: `Unauthorized - API key required (when NODE_API_KEY is configured)`,
                429: `Rate limit exceeded`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Get a specific host by name
     * Retrieve detailed information about a single host
     * @param name The hostname to retrieve
     * @returns Host Host found
     * @throws ApiError
     */
    public static getHosts1(
        name: string,
    ): CancelablePromise<Host> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/hosts/{name}',
            path: {
                'name': name,
            },
            errors: {
                401: `Unauthorized - API key required (when NODE_API_KEY is configured)`,
                404: `Host not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Update host properties
     * Update host name, MAC address, or IP address
     * @param name Existing host name
     * @param requestBody
     * @returns Host Host updated successfully
     * @throws ApiError
     */
    public static putHosts(
        name: string,
        requestBody: {
            name?: string;
            mac?: string;
            ip?: string;
            wolPort?: number;
            notes?: string | null;
            tags?: Array<string>;
        },
    ): CancelablePromise<Host> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/hosts/{name}',
            path: {
                'name': name,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                404: `Host not found`,
                409: `Conflict (duplicate name/mac/ip)`,
            },
        });
    }
    /**
     * Delete a host
     * Remove host from local database
     * @param name Host name to delete
     * @returns any Host deleted successfully
     * @throws ApiError
     */
    public static deleteHosts(
        name: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/hosts/{name}',
            path: {
                'name': name,
            },
            errors: {
                404: `Host not found`,
            },
        });
    }
    /**
     * Get MAC address vendor information
     * Look up the manufacturer/vendor of a network device by MAC address. Results are cached for 24 hours.
     * @param mac MAC address to look up
     * @returns any Vendor information retrieved
     * @throws ApiError
     */
    public static getHostsMacVendor(
        mac: string,
    ): CancelablePromise<{
        mac?: string;
        vendor?: string;
        source?: string;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/hosts/mac-vendor/{mac}',
            path: {
                'mac': mac,
            },
            errors: {
                400: `Invalid request parameters`,
                401: `Unauthorized - API key required (when NODE_API_KEY is configured)`,
                429: `Rate limit exceeded (external API or internal throttling)`,
                500: `Internal server error`,
            },
        });
    }
}
