/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type HealthCheck = {
    /**
     * Overall system status
     */
    status?: string;
    /**
     * Current timestamp
     */
    timestamp?: string;
    /**
     * API version
     */
    version?: string;
    /**
     * Runtime observability snapshot (nodes, commands, protocol validation)
     */
    metrics?: Record<string, any>;
};

