/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { HostPort } from './HostPort';
export type HostPortScanResponse = {
    target: string;
    scannedAt: string;
    openPorts: Array<HostPort>;
    scan?: {
        commandId?: string;
        state?: 'queued' | 'sent' | 'acknowledged' | 'failed' | 'timed_out';
        nodeId?: string;
        message?: string;
    };
    message?: string;
    correlationId?: string;
};

