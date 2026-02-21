/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type Command = {
    /**
     * Command ID
     */
    id?: string;
    /**
     * Command type
     */
    type?: 'wake' | 'update-host' | 'delete-host' | 'scan' | 'scan-host-ports' | 'ping-host' | 'sleep-host' | 'shutdown-host' | 'ping';
    /**
     * Target node ID
     */
    nodeId?: string;
    /**
     * Command status
     */
    status?: 'pending' | 'completed' | 'failed' | 'timeout';
    createdAt?: string;
    completedAt?: string | null;
};

