/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type WakeupRequest = {
    /**
     * Enable asynchronous wake verification for this command
     */
    verify?: boolean;
    /**
     * Optional WoL UDP destination port override for this wake request
     */
    wolPort?: number;
};

