/**
 * Configuration management for C&C backend
 */

import dotenv from 'dotenv';
import { ServerConfig } from '../types';

// Load environment variables
dotenv.config();

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvVarOptional(key: string, defaultValue = ''): string {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export const config: ServerConfig = {
  port: getEnvNumber('PORT', 8080),
  nodeEnv: getEnvVar('NODE_ENV', 'development'),
  corsOrigins: getEnvVarOptional('CORS_ORIGINS', '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  dbType: getEnvVar('DB_TYPE', 'postgres'),
  databaseUrl: getEnvVar('DATABASE_URL'),
  nodeAuthTokens: getEnvVar('NODE_AUTH_TOKENS', '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  // For mobile/operator token exchange. Defaults to NODE_AUTH_TOKENS for backwards compatibility in dev.
  operatorAuthTokens: getEnvVar('OPERATOR_TOKENS', getEnvVar('NODE_AUTH_TOKENS', ''))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  // Optional: separate admin token list for minting admin JWTs.
  adminAuthTokens: getEnvVarOptional('ADMIN_TOKENS', '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  jwtSecret: getEnvVar('JWT_SECRET'),
  jwtIssuer: getEnvVar('JWT_ISSUER', 'woly-cnc'),
  jwtAudience: getEnvVar('JWT_AUDIENCE', 'woly-api'),
  jwtTtlSeconds: getEnvNumber('JWT_TTL_SECONDS', 3600),
  wsRequireTls: getEnvBoolean('WS_REQUIRE_TLS', getEnvVar('NODE_ENV', 'development') === 'production'),
  wsAllowQueryTokenAuth: getEnvBoolean(
    'WS_ALLOW_QUERY_TOKEN_AUTH',
    getEnvVar('NODE_ENV', 'development') !== 'production'
  ),
  // Rotation format: "newSecret,oldSecret". We always sign with the first secret and verify against all.
  wsSessionTokenSecrets: getEnvVar('WS_SESSION_TOKEN_SECRETS', getEnvVar('JWT_SECRET'))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  wsSessionTokenIssuer: getEnvVar('WS_SESSION_TOKEN_ISSUER', getEnvVar('JWT_ISSUER', 'woly-cnc')),
  wsSessionTokenAudience: getEnvVar('WS_SESSION_TOKEN_AUDIENCE', 'woly-ws-node'),
  wsSessionTokenTtlSeconds: getEnvNumber('WS_SESSION_TOKEN_TTL_SECONDS', 300),
  wsMessageRateLimitPerSecond: getEnvNumber('WS_MESSAGE_RATE_LIMIT_PER_SECOND', 100),
  nodeHeartbeatInterval: getEnvNumber('NODE_HEARTBEAT_INTERVAL', 30000),
  nodeTimeout: getEnvNumber('NODE_TIMEOUT', 90000),
  commandTimeout: getEnvNumber('COMMAND_TIMEOUT', 30000),
  commandRetentionDays: getEnvNumber('COMMAND_RETENTION_DAYS', 30),
  commandMaxRetries: getEnvNumber('COMMAND_MAX_RETRIES', 3),
  commandRetryBaseDelayMs: getEnvNumber('COMMAND_RETRY_BASE_DELAY_MS', 1000),
  logLevel: getEnvVar('LOG_LEVEL', 'info'),
};

// Validate configuration
if (config.nodeAuthTokens.length === 0) {
  throw new Error('At least one NODE_AUTH_TOKEN must be configured');
}

if (config.operatorAuthTokens.length === 0) {
  throw new Error('At least one OPERATOR_TOKENS entry must be configured');
}

if (config.nodeTimeout < config.nodeHeartbeatInterval * 2) {
  throw new Error('NODE_TIMEOUT must be at least 2x NODE_HEARTBEAT_INTERVAL');
}

if (config.wsSessionTokenSecrets.length === 0) {
  throw new Error('WS_SESSION_TOKEN_SECRETS must contain at least one non-empty secret');
}

if (!Number.isFinite(config.wsSessionTokenTtlSeconds) || config.wsSessionTokenTtlSeconds <= 0) {
  throw new Error('WS_SESSION_TOKEN_TTL_SECONDS must be a finite number > 0');
}

if (!Number.isFinite(config.wsMessageRateLimitPerSecond) || config.wsMessageRateLimitPerSecond <= 0) {
  throw new Error('WS_MESSAGE_RATE_LIMIT_PER_SECOND must be a finite number > 0');
}

if (!Number.isFinite(config.jwtTtlSeconds) || config.jwtTtlSeconds <= 0) {
  throw new Error('JWT_TTL_SECONDS must be a finite number > 0');
}

export default config;
