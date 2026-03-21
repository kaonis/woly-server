/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type HostScanDispatchResponse = {
    state: 'queued' | 'sent' | 'acknowledged' | 'failed' | 'timed_out';
    commandId?: string;
    queuedAt: string;
    startedAt?: string | null;
    completedAt?: string | null;
    lastScanAt?: string | null;
    message?: string;
    error?: string | null;
};

