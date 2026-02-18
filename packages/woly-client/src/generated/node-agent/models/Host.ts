/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type Host = {
    /**
     * Unique hostname
     */
    name: string;
    /**
     * MAC address
     */
    mac: string;
    /**
     * IP address
     */
    ip: string;
    /**
     * Current host status
     */
    status: 'awake' | 'asleep';
    /**
     * Last time host was detected online
     */
    lastSeen?: string | null;
    /**
     * Whether host was discovered automatically (1) or added manually (0)
     */
    discovered?: number;
    /**
     * ICMP ping responsiveness: 1 (responds), 0 (no response), null (not tested)
     */
    pingResponsive?: number | null;
    /**
     * Optional operator notes for this host
     */
    notes?: string | null;
    /**
     * Optional tags for filtering/grouping hosts
     */
    tags?: Array<string>;
};

