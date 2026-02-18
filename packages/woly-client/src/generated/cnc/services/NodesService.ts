/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Node } from '../models/Node';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class NodesService {
    /**
     * List all nodes
     * Retrieve a list of all registered nodes with connection status
     * @returns any List of nodes
     * @throws ApiError
     */
    public static getApiNodes(): CancelablePromise<{
        nodes?: Array<Node>;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/nodes',
            errors: {
                401: `Missing or invalid authentication`,
                403: `Authenticated but not authorized for this operation`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Get node by ID
     * Retrieve detailed information about a specific node
     * @param id The node ID
     * @returns Node Node found
     * @throws ApiError
     */
    public static getApiNodes1(
        id: string,
    ): CancelablePromise<Node> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/nodes/{id}',
            path: {
                'id': id,
            },
            errors: {
                401: `Missing or invalid authentication`,
                403: `Authenticated but not authorized for this operation`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Check node health
     * Get detailed health status of a specific node
     * @param id The node ID
     * @returns any Node health status
     * @throws ApiError
     */
    public static getApiNodesHealth(
        id: string,
    ): CancelablePromise<{
        nodeId?: string;
        status?: 'online' | 'offline';
        connected?: boolean;
        lastHeartbeat?: string;
        /**
         * Milliseconds since last heartbeat
         */
        timeSinceHeartbeat?: number;
        healthy?: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/nodes/{id}/health',
            path: {
                'id': id,
            },
            errors: {
                401: `Missing or invalid authentication`,
                403: `Authenticated but not authorized for this operation`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
}
