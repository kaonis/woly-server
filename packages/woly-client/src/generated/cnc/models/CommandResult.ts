/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CommandResult = {
    /**
     * Whether the command succeeded
     */
    success?: boolean;
    /**
     * Result message
     */
    message?: string;
    /**
     * Unique command identifier
     */
    commandId?: string;
    /**
     * Request correlation identifier for end-to-end tracing
     */
    correlationId?: string;
};

