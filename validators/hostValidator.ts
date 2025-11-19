import Joi from 'joi';

/**
 * MAC address validation pattern
 * Accepts formats: XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX
 */
const macAddressPattern = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

/**
 * Schema for validating MAC address parameter
 */
export const macAddressSchema = Joi.object({
  mac: Joi.string().pattern(macAddressPattern).required().messages({
    'string.pattern.base': 'MAC address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX',
    'any.required': 'MAC address is required',
  }),
});

/**
 * Schema for validating host update data
 */
export const updateHostSchema = Joi.object({
  name: Joi.string().min(1).max(255).trim().optional().messages({
    'string.min': 'Hostname must be at least 1 character',
    'string.max': 'Hostname must not exceed 255 characters',
  }),
  ip: Joi.string()
    .ip({ version: ['ipv4', 'ipv6'] })
    .optional()
    .messages({
      'string.ip': 'IP address must be a valid IPv4 or IPv6 address',
    }),
  macAddress: Joi.string().pattern(macAddressPattern).optional().messages({
    'string.pattern.base': 'MAC address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX',
  }),
})
  .min(1)
  .messages({
    'object.min': 'At least one field (name, ip, or macAddress) must be provided for update',
  });

/**
 * Schema for validating wake-on-LAN request
 */
export const wakeHostSchema = Joi.object({
  macAddress: Joi.string().pattern(macAddressPattern).required().messages({
    'string.pattern.base': 'MAC address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX',
    'any.required': 'MAC address is required',
  }),
  ip: Joi.string()
    .ip({ version: ['ipv4'] })
    .optional()
    .messages({
      'string.ip': 'IP address must be a valid IPv4 address',
    }),
});

/**
 * Schema for validating delete host request
 */
export const deleteHostSchema = Joi.object({
  macAddress: Joi.string().pattern(macAddressPattern).required().messages({
    'string.pattern.base': 'MAC address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX',
    'any.required': 'MAC address is required',
  }),
});
