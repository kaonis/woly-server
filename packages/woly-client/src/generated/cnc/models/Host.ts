/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type Host = {
    /**
     * Hostname
     */
    name?: string;
    /**
     * MAC address
     */
    mac?: string;
    /**
     * IP address
     */
    ip?: string;
    /**
     * Current host status (based on ARP response)
     */
    status?: 'awake' | 'asleep';
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
     * Optional host tags for filtering/grouping
     */
    tags?: Array<string>;
    /**
     * Cached open TCP ports from the most recent per-host scan (when still fresh)
     */
    openPorts?: Array<{
        port?: number;
        protocol?: 'tcp';
        service?: string;
    }>;
    /**
     * Timestamp of the cached per-host port scan snapshot
     */
    portsScannedAt?: string | null;
    /**
     * Expiration timestamp for cached open ports
     */
    portsExpireAt?: string | null;
    /**
     * ID of the node managing this host
     */
    nodeId?: string;
    /**
     * Location inherited from managing node
     */
    location?: string;
    /**
     * Fully qualified name (hostname@location)
     */
    fqn?: string;
};

