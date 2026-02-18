/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type Node = {
    /**
     * Unique node identifier
     */
    id?: string;
    /**
     * Physical or logical location of the node
     */
    location?: string;
    /**
     * Current node status
     */
    status?: 'online' | 'offline';
    /**
     * Timestamp of last heartbeat received
     */
    lastHeartbeat?: string;
    /**
     * Node registration timestamp
     */
    createdAt?: string;
    /**
     * Whether node is currently connected via WebSocket
     */
    connected?: boolean;
};

