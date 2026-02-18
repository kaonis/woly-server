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
const wolPortSchema = z
  .number()
  .int('WoL port must be an integer')
  .min(1, 'WoL port must be between 1 and 65535')
  .max(65_535, 'WoL port must be between 1 and 65535');
const sshPortSchema = z
  .number()
  .int('SSH port must be an integer')
  .min(1, 'SSH port must be between 1 and 65535')
  .max(65_535, 'SSH port must be between 1 and 65535');
const hostPowerControlSchema = z
  .object({
    enabled: z.boolean(),
    transport: z.literal('ssh'),
    platform: z.enum(['linux', 'macos', 'windows']),
    ssh: z
      .object({
        username: z
          .string()
          .min(1, 'powerControl.ssh.username is required')
          .max(255, 'powerControl.ssh.username must not exceed 255 characters')
          .trim(),
        port: sshPortSchema.optional(),
        privateKeyPath: z
          .string()
          .min(1, 'powerControl.ssh.privateKeyPath must not be empty')
          .max(2_048, 'powerControl.ssh.privateKeyPath must not exceed 2048 characters')
          .trim()
          .optional(),
        strictHostKeyChecking: z.enum(['enforce', 'accept-new', 'off']).optional(),
      })
      .strict(),
    commands: z
      .object({
        sleep: z
          .string()
          .min(1, 'powerControl.commands.sleep must not be empty')
          .max(1_024, 'powerControl.commands.sleep must not exceed 1024 characters')
          .trim()
          .optional(),
        shutdown: z
          .string()
          .min(1, 'powerControl.commands.shutdown must not be empty')
          .max(1_024, 'powerControl.commands.shutdown must not exceed 1024 characters')
          .trim()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

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
  powerControl: hostPowerControlSchema.nullable().optional(),
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
    secondaryMacs: z
      .array(
        z.string().regex(
          macAddressPattern,
          'Secondary MAC addresses must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX'
        )
      )
      .max(32, 'secondaryMacs must not exceed 32 entries')
      .optional(),
    notes: hostNotesSchema.optional(),
    tags: hostTagsSchema.optional(),
    wolPort: wolPortSchema.optional(),
    powerControl: hostPowerControlSchema.nullable().optional(),
  })
  .refine((value) =>
      value.name !== undefined ||
      value.ip !== undefined ||
      value.mac !== undefined ||
      value.secondaryMacs !== undefined ||
      value.notes !== undefined ||
      value.tags !== undefined ||
      value.wolPort !== undefined ||
      value.powerControl !== undefined, {
    message:
      'At least one field is required: name, ip, mac, secondaryMacs, notes, tags, wolPort, or powerControl',
  });

/**
 * Schema for validating host MAC merge body.
 */
export const mergeHostMacSchema = z.object({
  mac: z.string().regex(
    macAddressPattern,
    'MAC address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX'
  ),
  makePrimary: z.boolean().optional(),
  sourceHostName: z
    .string()
    .min(1, 'sourceHostName must be at least 1 character')
    .max(255, 'sourceHostName must not exceed 255 characters')
    .trim()
    .optional(),
  deleteSourceHost: z.boolean().optional(),
});

/**
 * Schema for validating wake-up request body
 */
export const wakeHostSchema = z
  .object({
    wolPort: wolPortSchema.optional(),
  })
  .strict()
  .optional()
  .transform((value) => value ?? {});

export const sleepHostSchema = z
  .object({
    confirm: z.literal('sleep'),
  })
  .strict();

export const shutdownHostSchema = z
  .object({
    confirm: z.literal('shutdown'),
  })
  .strict();

/**
 * Schema for validating host name path parameter
 */
export const hostNameParamSchema = z.object({
  name: z.string().min(1, 'Hostname must be at least 1 character').max(255, 'Hostname must not exceed 255 characters').trim(),
});

/**
 * Schema for validating host name + MAC path parameters.
 */
export const hostNameAndMacParamSchema = z.object({
  name: z.string().min(1, 'Hostname must be at least 1 character').max(255, 'Hostname must not exceed 255 characters').trim(),
  mac: z.string().regex(
    macAddressPattern,
    'MAC address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX'
  ),
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
