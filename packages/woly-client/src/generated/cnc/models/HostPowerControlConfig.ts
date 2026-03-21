/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { HostPowerControlCommandOverrides } from './HostPowerControlCommandOverrides';
import type { HostPowerControlSshConfig } from './HostPowerControlSshConfig';
export type HostPowerControlConfig = {
    enabled: boolean;
    transport: 'ssh';
    platform: 'linux' | 'macos' | 'windows';
    ssh: HostPowerControlSshConfig;
    commands?: HostPowerControlCommandOverrides;
};

