/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { HealthCheck } from '../models/HealthCheck';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class HealthService {
    /**
     * Health check endpoint
     * Returns the current health status of the C&C service
     * @returns HealthCheck Service is healthy
     * @throws ApiError
     */
    public static getHealth(): CancelablePromise<HealthCheck> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/health',
        });
    }
    /**
     * Root endpoint
     * Returns basic information about the C&C service
     * @returns any Service information
     * @throws ApiError
     */
    public static get(): CancelablePromise<{
        name?: string;
        version?: string;
        status?: string;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/',
        });
    }
}
