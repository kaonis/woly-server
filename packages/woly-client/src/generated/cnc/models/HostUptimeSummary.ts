/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type HostUptimeSummary = {
    hostFqn: string;
    period: string;
    from: string;
    to: string;
    uptimePercentage: number;
    awakeMs: number;
    asleepMs: number;
    transitions: number;
    currentStatus: 'awake' | 'asleep';
};

