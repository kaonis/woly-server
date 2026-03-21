/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CapabilityDescriptor } from './CapabilityDescriptor';
import type { RateLimits } from './RateLimits';
export type CapabilitiesResponse = {
    mode: 'cnc';
    versions: {
        cncApi: string;
        protocol: string;
    };
    capabilities: {
        scan: CapabilityDescriptor;
        notesTags: CapabilityDescriptor;
        schedules: CapabilityDescriptor;
        hostStateStreaming: CapabilityDescriptor;
        commandStatusStreaming: CapabilityDescriptor;
        wakeVerification: CapabilityDescriptor;
        sleep: CapabilityDescriptor;
        shutdown: CapabilityDescriptor;
    };
    rateLimits?: RateLimits;
};

