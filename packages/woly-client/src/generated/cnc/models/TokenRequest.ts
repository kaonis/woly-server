/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type TokenRequest = {
    /**
     * Requested role (defaults to operator)
     */
    role?: 'operator' | 'admin';
    /**
     * Optional subject identifier (defaults to generated mobile UUID)
     */
    sub?: string;
};

