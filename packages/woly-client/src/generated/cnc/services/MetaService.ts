/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CapabilitiesResponse } from '../models/CapabilitiesResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class MetaService {
    /**
     * Get CNC capability flags and version metadata
     * Returns a machine-readable capability map so clients can negotiate feature behavior without endpoint probing.
     * @returns CapabilitiesResponse Capability descriptor payload
     * @throws ApiError
     */
    public static getApiCapabilities(): CancelablePromise<CapabilitiesResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/capabilities',
            errors: {
                401: `Missing or invalid authentication`,
                403: `Authenticated but not authorized for this operation`,
                500: `Internal server error`,
            },
        });
    }
}
