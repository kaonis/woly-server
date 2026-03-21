/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WakeVerificationPending } from './WakeVerificationPending';
export type WakeupResponse = {
    success: boolean;
    message: string;
    nodeId: string;
    location: string;
    commandId?: string;
    state?: 'queued' | 'sent' | 'acknowledged' | 'failed' | 'timed_out';
    correlationId?: string;
    wakeVerification?: WakeVerificationPending;
};

