/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CapabilitiesResponse = {
    mode: 'cnc';
    versions: {
        cncApi: string;
        protocol: string;
    };
    /**
     * Capability descriptors keyed by feature name
     */
    capabilities: Record<string, any>;
    /**
     * Optional CNC rate limit descriptors
     */
    rateLimits?: Record<string, any>;
};

