/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Command } from '../models/Command';
import type { SystemStats } from '../models/SystemStats';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AdminService {
    /**
     * Deregister a node
     * Remove a node from the system (admin only)
     * @param id The node ID to delete
     * @returns any Node deleted successfully
     * @throws ApiError
     */
    public static deleteApiAdminNodes(
        id: string,
    ): CancelablePromise<{
        success?: boolean;
        message?: string;
    }> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/admin/nodes/{id}',
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
     * Get system statistics
     * Retrieve comprehensive system statistics including nodes, hosts, and WebSocket connections (admin only)
     * @returns SystemStats System statistics
     * @throws ApiError
     */
    public static getApiAdminStats(): CancelablePromise<SystemStats> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/stats',
            errors: {
                401: `Missing or invalid authentication`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * List recent command outcomes
     * Retrieve recent command history with optional filtering (admin only)
     * @param limit Maximum number of commands to return
     * @param nodeId Optional node ID to filter commands
     * @returns any List of recent commands
     * @throws ApiError
     */
    public static getApiAdminCommands(
        limit: number = 50,
        nodeId?: string,
    ): CancelablePromise<{
        commands?: Array<Command>;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/commands',
            query: {
                'limit': limit,
                'nodeId': nodeId,
            },
            errors: {
                401: `Missing or invalid authentication`,
                500: `Internal server error`,
            },
        });
    }
}
