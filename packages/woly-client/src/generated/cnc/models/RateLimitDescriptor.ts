/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type RateLimitDescriptor = {
    maxCalls: number;
    windowMs: number | null;
    scope: 'ip' | 'connection' | 'global';
    appliesTo?: Array<string>;
    note?: string;
};

