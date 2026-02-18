/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TokenRequest } from '../models/TokenRequest';
import type { TokenResponse } from '../models/TokenResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AuthenticationService {
    /**
     * Issue JWT token
     * Exchange an operator or admin Bearer token for a JWT token with specified role
     * @param requestBody
     * @returns TokenResponse JWT token issued successfully
     * @throws ApiError
     */
    public static postApiAuthToken(
        requestBody?: TokenRequest,
    ): CancelablePromise<TokenResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/token',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request parameters`,
                401: `Missing or invalid authentication`,
            },
        });
    }
}
