/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateHostWakeScheduleRequest = {
    scheduledTime: string;
    frequency: 'once' | 'daily' | 'weekly' | 'weekdays' | 'weekends';
    enabled?: boolean;
    notifyOnWake?: boolean;
    timezone?: string;
};

