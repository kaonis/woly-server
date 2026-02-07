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
 * Schema for validating host creation/update data
 */
export const updateHostSchema = Joi.object({
  name: Joi.string().min(1).max(255).trim().required().messages({
    'string.min': 'Hostname must be at least 1 character',
    'string.max': 'Hostname must not exceed 255 characters',
    'any.required': 'Hostname is required',
  }),
  ip: Joi.string()
    .ip({ version: ['ipv4', 'ipv6'] })
    .required()
    .messages({
      'string.ip': 'IP address must be a valid IPv4 or IPv6 address',
      'any.required': 'IP address is required',
    }),
  mac: Joi.string().pattern(macAddressPattern).required().messages({
    'string.pattern.base': 'MAC address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX',
    'any.required': 'MAC address is required',
  }),
});

/**
 * Schema for validating host name path parameter
 */
export const hostNameParamSchema = Joi.object({
  name: Joi.string().min(1).max(255).trim().required().messages({
    'string.min': 'Hostname must be at least 1 character',
    'string.max': 'Hostname must not exceed 255 characters',
    'any.required': 'Hostname is required',
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
