/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { NodeMetadata } from './NodeMetadata';
export type Node = {
    /**
     * Unique node identifier
     */
    id: string;
    /**
     * Human-readable node name
     */
    name: string;
    /**
     * Physical or logical location of the node
     */
    location: string;
    /**
     * Optional public URL exposed by the node for diagnostics
     */
    publicUrl?: string | null;
    /**
     * Current node status
     */
    status: 'online' | 'offline';
    /**
     * Timestamp of last heartbeat received
     */
    lastHeartbeat: string;
    /**
     * Capabilities advertised by the node agent
     */
    capabilities: Array<string>;
    metadata: NodeMetadata;
    /**
     * Node registration timestamp
     */
    createdAt: string;
    /**
     * Timestamp of the most recent node update
     */
    updatedAt: string;
    /**
     * Whether node is currently connected via WebSocket
     */
    connected: boolean;
};

