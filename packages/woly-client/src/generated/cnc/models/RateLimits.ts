/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RateLimitDescriptor } from './RateLimitDescriptor';
export type RateLimits = {
    strictAuth: RateLimitDescriptor;
    auth: RateLimitDescriptor;
    api: RateLimitDescriptor;
    scheduleSync: RateLimitDescriptor;
    wsInboundMessages: RateLimitDescriptor;
    wsConnectionsPerIp: RateLimitDescriptor;
    macVendorLookup: RateLimitDescriptor;
};

