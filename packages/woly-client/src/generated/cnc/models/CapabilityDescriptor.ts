/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CapabilityDescriptor = {
    supported: boolean;
    routes?: Array<string>;
    persistence?: 'backend' | 'local' | 'none';
    transport?: 'websocket' | 'sse' | null;
    note?: string;
};

