/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CommandResult } from '../models/CommandResult';
import type { Host } from '../models/Host';
import type { HostStats } from '../models/HostStats';
import type { HostStatusHistoryResponse } from '../models/HostStatusHistoryResponse';
import type { HostUptimeSummary } from '../models/HostUptimeSummary';
import type { HostWakeSchedule } from '../models/HostWakeSchedule';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class HostsService {
    /**
     * Get all aggregated hosts
     * Retrieve all hosts from all nodes with optional filtering by node ID
     * @param nodeId Optional node ID to filter hosts
     * @returns any List of hosts with statistics
     * @throws ApiError
     */
    public static getApiHosts(
        nodeId?: string,
    ): CancelablePromise<{
        hosts?: Array<Host>;
        stats?: HostStats;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/hosts',
            query: {
                'nodeId': nodeId,
            },
            errors: {
                304: `Not Modified (If-None-Match matched current ETag)`,
                401: `Missing or invalid authentication`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Get host by fully qualified name
     * Retrieve detailed information about a specific host using its FQN (hostname@location)
     * @param fqn Fully qualified name (hostname@location)
     * @returns Host Host found
     * @throws ApiError
     */
    public static getApiHosts1(
        fqn: string,
    ): CancelablePromise<Host> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/hosts/{fqn}',
            path: {
                'fqn': fqn,
            },
            errors: {
                401: `Missing or invalid authentication`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Update host information
     * Update a host's properties via its managing node
     * @param fqn Fully qualified name (hostname@location)
     * @param requestBody
     * @param idempotencyKey Optional idempotency key to prevent duplicate commands
     * @returns any Host updated successfully
     * @throws ApiError
     */
    public static putApiHosts(
        fqn: string,
        requestBody: {
            name?: string;
            mac?: string;
            ip?: string;
            wolPort?: number;
            status?: 'awake' | 'asleep';
            notes?: string | null;
            tags?: Array<string>;
        },
        idempotencyKey?: string,
    ): CancelablePromise<{
        success?: boolean;
        message?: string;
    }> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/hosts/{fqn}',
            path: {
                'fqn': fqn,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Missing or invalid authentication`,
                404: `Resource not found`,
                500: `Internal server error`,
                503: `Service unavailable (e.g., node offline)`,
                504: `Command timeout`,
            },
        });
    }
    /**
     * Delete a host
     * Remove a host from its managing node
     * @param fqn Fully qualified name (hostname@location)
     * @param idempotencyKey Optional idempotency key to prevent duplicate commands
     * @returns any Host deleted successfully
     * @throws ApiError
     */
    public static deleteApiHosts(
        fqn: string,
        idempotencyKey?: string,
    ): CancelablePromise<{
        success?: boolean;
        message?: string;
    }> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/hosts/{fqn}',
            path: {
                'fqn': fqn,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            errors: {
                401: `Missing or invalid authentication`,
                404: `Resource not found`,
                500: `Internal server error`,
                503: `Service unavailable (e.g., node offline)`,
                504: `Command timeout`,
            },
        });
    }
    /**
     * Get host status transition history
     * Returns host awake/asleep transition events for a given time window.
     * @param fqn
     * @param from
     * @param to
     * @param limit
     * @returns HostStatusHistoryResponse Host transition history
     * @throws ApiError
     */
    public static getApiHostsHistory(
        fqn: string,
        from?: string,
        to?: string,
        limit?: number,
    ): CancelablePromise<HostStatusHistoryResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/hosts/{fqn}/history',
            path: {
                'fqn': fqn,
            },
            query: {
                'from': from,
                'to': to,
                'limit': limit,
            },
            errors: {
                400: `Invalid request parameters`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Get host uptime summary
     * Returns uptime analytics over a relative period (for example 7d).
     * @param fqn
     * @param period
     * @returns HostUptimeSummary Uptime summary
     * @throws ApiError
     */
    public static getApiHostsUptime(
        fqn: string,
        period?: string,
    ): CancelablePromise<HostUptimeSummary> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/hosts/{fqn}/uptime',
            path: {
                'fqn': fqn,
            },
            query: {
                'period': period,
            },
            errors: {
                400: `Invalid request parameters`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Wake up a host using Wake-on-LAN
     * Send a Wake-on-LAN magic packet to the specified host via its managing node
     * @param fqn Fully qualified name (hostname@location)
     * @param idempotencyKey Optional idempotency key to prevent duplicate commands
     * @param requestBody
     * @returns CommandResult Wake command sent successfully
     * @throws ApiError
     */
    public static postApiHostsWakeup(
        fqn: string,
        idempotencyKey?: string,
        requestBody?: {
            /**
             * Enable asynchronous wake verification for this command
             */
            verify?: boolean;
            /**
             * Optional WoL UDP destination port override for this wake request
             */
            wolPort?: number;
        },
    ): CancelablePromise<CommandResult> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/hosts/wakeup/{fqn}',
            path: {
                'fqn': fqn,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Missing or invalid authentication`,
                404: `Resource not found`,
                503: `Service unavailable (e.g., node offline)`,
                504: `Command timeout`,
            },
        });
    }
    /**
     * Ping a host via its managing node agent
     * Executes ICMP reachability from the node agent (not from the mobile app) and returns a normalized ping result.
     * @param fqn Fully qualified name (hostname@location)
     * @returns any Host ping command completed
     * @throws ApiError
     */
    public static getApiHostsPing(
        fqn: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/hosts/ping/{fqn}',
            path: {
                'fqn': fqn,
            },
            errors: {
                401: `Missing or invalid authentication`,
                404: `Resource not found`,
                500: `Internal server error`,
                503: `Service unavailable (e.g., node offline)`,
                504: `Command timeout`,
            },
        });
    }
    /**
     * Trigger immediate host discovery scan across connected nodes
     * Dispatches scan commands to connected nodes and returns a normalized command lifecycle payload.
     * @returns any Scan command dispatched to one or more connected nodes
     * @throws ApiError
     */
    public static postApiHostsScan(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/hosts/scan',
            errors: {
                401: `Missing or invalid authentication`,
                409: `One or more node scans are already in progress`,
                500: `Internal server error`,
                503: `Service unavailable (e.g., node offline)`,
                504: `Command timeout`,
            },
        });
    }
    /**
     * Get latest host port-scan payload
     * Returns a mobile-compatible host port-scan payload shape for CNC mode.
     * If a fresh scan is not available, a node-side probe is executed.
     *
     * @param fqn Fully qualified name (hostname@location)
     * @returns any Port payload shape returned
     * @throws ApiError
     */
    public static getApiHostsPorts(
        fqn: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/hosts/ports/{fqn}',
            path: {
                'fqn': fqn,
            },
            errors: {
                401: `Missing or invalid authentication`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Trigger host-side scan operation and return compatible port payload
     * Dispatches a node-side TCP scan for the host's managing node and returns
     * a mobile-compatible port payload shape including discovered open TCP ports.
     *
     * @param fqn Fully qualified name (hostname@location)
     * @returns any Scan dispatched/completed and payload returned
     * @throws ApiError
     */
    public static getApiHostsScanPorts(
        fqn: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/hosts/scan-ports/{fqn}',
            path: {
                'fqn': fqn,
            },
            errors: {
                401: `Missing or invalid authentication`,
                404: `Resource not found`,
                409: `Scan already in progress on target node`,
                500: `Internal server error`,
                503: `Service unavailable (e.g., node offline)`,
                504: `Command timeout`,
            },
        });
    }
    /**
     * Get MAC address vendor information
     * Look up the manufacturer/vendor of a network device by MAC address.
     * Results are cached for 24 hours to minimize external API calls.
     * The external macvendors.com API is rate-limited to one request per second.
     *
     * @param mac MAC address to look up (case-insensitive, accepts colon or hyphen delimiters)
     * @returns any Vendor information retrieved successfully
     * @throws ApiError
     */
    public static getApiHostsMacVendor(
        mac: string,
    ): CancelablePromise<{
        /**
         * MAC address as provided in request
         */
        mac: string;
        /**
         * Vendor/manufacturer name (or "Unknown Vendor" if not found)
         */
        vendor: string;
        /**
         * Data source (includes "cached" suffix for cached results)
         */
        source: string;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/hosts/mac-vendor/{mac}',
            path: {
                'mac': mac,
            },
            errors: {
                400: `Bad request - MAC address missing or invalid format`,
                401: `Missing or invalid authentication`,
                429: `Rate limit exceeded - wait before retrying`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * List wake schedules across all hosts
     * @param enabled Optional filter for enabled/disabled schedules.
     * @param nodeId Optional node id filter.
     * @returns any Aggregated schedules list
     * @throws ApiError
     */
    public static getApiSchedules(
        enabled?: boolean,
        nodeId?: string,
    ): CancelablePromise<{
        schedules?: Array<HostWakeSchedule>;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/schedules',
            query: {
                'enabled': enabled,
                'nodeId': nodeId,
            },
            errors: {
                304: `Not Modified (If-None-Match matched current ETag)`,
                400: `Invalid request parameters`,
                401: `Missing or invalid authentication`,
            },
        });
    }
    /**
     * Get wake schedule by id
     * @param id
     * @returns HostWakeSchedule Schedule entry
     * @throws ApiError
     */
    public static getApiSchedules1(
        id: string,
    ): CancelablePromise<HostWakeSchedule> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/schedules/{id}',
            path: {
                'id': id,
            },
            errors: {
                401: `Missing or invalid authentication`,
                404: `Resource not found`,
            },
        });
    }
    /**
     * List wake schedules for a host
     * @param fqn
     * @returns any Host schedules
     * @throws ApiError
     */
    public static getApiHostsSchedules(
        fqn: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/hosts/{fqn}/schedules',
            path: {
                'fqn': fqn,
            },
            errors: {
                401: `Missing or invalid authentication`,
                404: `Resource not found`,
            },
        });
    }
    /**
     * Create a wake schedule for a host
     * @param fqn
     * @returns any Created schedule
     * @throws ApiError
     */
    public static postApiHostsSchedules(
        fqn: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/hosts/{fqn}/schedules',
            path: {
                'fqn': fqn,
            },
            errors: {
                400: `Invalid request parameters`,
                401: `Missing or invalid authentication`,
                404: `Resource not found`,
            },
        });
    }
    /**
     * Update wake schedule by id
     * @param id
     * @returns any Updated schedule
     * @throws ApiError
     */
    public static putApiHostsSchedules(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/hosts/schedules/{id}',
            path: {
                'id': id,
            },
            errors: {
                400: `Invalid request parameters`,
                401: `Missing or invalid authentication`,
                404: `Resource not found`,
            },
        });
    }
    /**
     * Delete wake schedule by id
     * @param id
     * @returns any Deleted schedule
     * @throws ApiError
     */
    public static deleteApiHostsSchedules(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/hosts/schedules/{id}',
            path: {
                'id': id,
            },
            errors: {
                401: `Missing or invalid authentication`,
                404: `Resource not found`,
            },
        });
    }
}
