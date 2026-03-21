/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type HostPowerResponse = {
    success: boolean;
    action: 'sleep' | 'shutdown';
    message: string;
    nodeId: string;
    location: string;
    commandId?: string;
    state?: 'queued' | 'sent' | 'acknowledged' | 'failed' | 'timed_out';
    correlationId?: string;
};

