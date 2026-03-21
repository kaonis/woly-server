/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type HostPingResponse = {
    target: string;
    checkedAt: string;
    latencyMs: number;
    success: boolean;
    status: 'awake' | 'asleep' | 'unknown';
    source: 'node-agent';
    correlationId?: string;
};

