/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type HostWakeSchedule = {
    id?: string;
    hostFqn?: string;
    hostName?: string;
    hostMac?: string;
    scheduledTime?: string;
    frequency?: 'once' | 'daily' | 'weekly' | 'weekdays' | 'weekends';
    enabled?: boolean;
    notifyOnWake?: boolean;
    timezone?: string;
    lastTriggered?: string | null;
    nextTrigger?: string | null;
    createdAt?: string;
    updatedAt?: string;
};

