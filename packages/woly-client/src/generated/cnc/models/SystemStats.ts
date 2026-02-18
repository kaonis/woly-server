/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { HostStats } from './HostStats';
export type SystemStats = {
    nodes?: {
        total?: number;
        online?: number;
        offline?: number;
    };
    hosts?: HostStats;
    websocket?: {
        connectedNodes?: number;
        protocolValidationFailures?: Record<string, number>;
    };
    /**
     * Runtime observability snapshot used by dashboards and alerts
     */
    observability?: Record<string, any>;
    timestamp?: string;
};

