import { z } from 'zod';

/**
 * MAC address validation pattern
 * Accepts formats: XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX
 */
const macAddressPattern = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

/**
 * IPv4 and IPv6 validation regex patterns
 */
const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const ipv6Pattern = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

/**
 * Schema for validating MAC address parameter
 */
export const macAddressSchema = z.object({
  mac: z.string().regex(macAddressPattern, 'MAC address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX'),
});

/**
 * Schema for validating host creation/update data
 */
export const updateHostSchema = z.object({
  name: z.string().min(1, 'Hostname must be at least 1 character').max(255, 'Hostname must not exceed 255 characters').trim(),
  ip: z.string().refine(
    (val) => ipv4Pattern.test(val) || ipv6Pattern.test(val),
    'IP address must be a valid IPv4 or IPv6 address'
  ),
  mac: z.string().regex(macAddressPattern, 'MAC address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX'),
});

/**
 * Schema for validating host name path parameter
 */
export const hostNameParamSchema = z.object({
  name: z.string().min(1, 'Hostname must be at least 1 character').max(255, 'Hostname must not exceed 255 characters').trim(),
});

/**
 * Schema for validating delete host request
 */
export const deleteHostSchema = z.object({
  macAddress: z.string().regex(macAddressPattern, 'MAC address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX'),
});
