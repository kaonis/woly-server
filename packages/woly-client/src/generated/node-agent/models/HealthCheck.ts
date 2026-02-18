/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type HealthCheck = {
    /**
     * Server uptime in seconds
     */
    uptime?: number;
    /**
     * Current timestamp
     */
    timestamp?: number;
    /**
     * Overall system status
     */
    status?: 'ok' | 'degraded';
    /**
     * Current environment
     */
    environment?: string;
    build?: {
        /**
         * Node-agent build version
         */
        version?: string;
        /**
         * Active protocol version
         */
        protocolVersion?: string;
    };
    agent?: {
        mode?: 'standalone' | 'agent';
        authMode?: 'standalone' | 'static-token' | 'session-token';
        connected?: boolean;
    };
    checks?: {
        database?: 'healthy' | 'unhealthy' | 'unknown';
        networkScan?: 'running' | 'idle';
    };
    /**
     * Runtime counters for reconnect/auth/protocol validation and command latency
     */
    telemetry?: Record<string, any>;
};

