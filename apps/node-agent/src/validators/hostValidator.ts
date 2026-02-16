import { z } from 'zod';
import { isIP } from 'node:net';

/**
 * MAC address validation pattern
 * Accepts formats: XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX
 */
const macAddressPattern = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
const ipAddressSchema = z.string().refine((value) => isIP(value) !== 0, {
  message: 'IP address must be a valid IPv4 or IPv6 address',
});
const hostNotesSchema = z
  .union([z.string().max(2_000, 'Notes must not exceed 2000 characters').trim(), z.null()]);
const hostTagsSchema = z
  .array(z.string().min(1, 'Tags cannot be empty').max(64, 'Tags must not exceed 64 characters').trim())
  .max(32, 'Tags must not exceed 32 entries');

/**
 * Schema for validating MAC address parameter
 */
export const macAddressSchema = z.object({
  mac: z.string().regex(macAddressPattern, 'MAC address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX'),
});

/**
 * Schema for validating host creation data
 */
export const addHostSchema = z.object({
  name: z.string().min(1, 'Hostname must be at least 1 character').max(255, 'Hostname must not exceed 255 characters').trim(),
  ip: ipAddressSchema,
  mac: z.string().regex(macAddressPattern, 'MAC address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX'),
  notes: hostNotesSchema.optional(),
  tags: hostTagsSchema.optional(),
});

/**
 * Schema for validating partial host update data
 */
export const updateHostSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Hostname must be at least 1 character')
      .max(255, 'Hostname must not exceed 255 characters')
      .trim()
      .optional(),
    ip: ipAddressSchema.optional(),
    mac: z
      .string()
      .regex(
        macAddressPattern,
        'MAC address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX'
      )
      .optional(),
    notes: hostNotesSchema.optional(),
    tags: hostTagsSchema.optional(),
  })
  .refine((value) =>
      value.name !== undefined ||
      value.ip !== undefined ||
      value.mac !== undefined ||
      value.notes !== undefined ||
      value.tags !== undefined, {
    message: 'At least one field is required: name, ip, mac, notes, or tags',
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
  name: z
    .string()
    .min(1, 'Hostname must be at least 1 character')
    .max(255, 'Hostname must not exceed 255 characters')
    .trim(),
});
