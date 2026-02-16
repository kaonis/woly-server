import dotenv from 'dotenv';

// Load environment variables
dotenv.config({
  quiet: process.env.NODE_ENV === 'test' || process.env.DOTENV_CONFIG_QUIET === 'true',
});

function getEnvNumber(key: string, defaultValue: number): number {
  const rawValue = process.env[key];
  const parsedValue = rawValue ? parseInt(rawValue, 10) : defaultValue;
  return Number.isNaN(parsedValue) ? defaultValue : parsedValue;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const rawValue = process.env[key];
  if (rawValue === undefined) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(rawValue.toLowerCase());
}

/**
 * Agent Mode Configuration
 * Controls whether woly-backend operates as standalone or connects to C&C
 */
export const agentConfig = {
  // Operating mode: 'standalone' or 'agent'
  mode: (process.env.NODE_MODE || 'standalone') as 'standalone' | 'agent',

  // C&C backend WebSocket URL (required in agent mode)
  cncUrl: process.env.CNC_URL || '',

  // Unique identifier for this node (required in agent mode)
  nodeId: process.env.NODE_ID || '',

  // Human-readable location (required in agent mode)
  location: process.env.NODE_LOCATION || '',

  // Authentication token for C&C connection (required in agent mode)
  authToken: process.env.NODE_AUTH_TOKEN || '',

  // Public URL for this node (optional, for reverse connections)
  publicUrl: process.env.NODE_PUBLIC_URL || '',

  // Optional session token endpoint for short-lived node tokens
  sessionTokenUrl: process.env.NODE_SESSION_TOKEN_URL || '',
  sessionTokenRequestTimeoutMs: getEnvNumber('NODE_SESSION_TOKEN_TIMEOUT_MS', 5000),
  sessionTokenRefreshBufferSeconds: getEnvNumber('NODE_SESSION_TOKEN_REFRESH_BUFFER_SECONDS', 60),

  // If enabled, include query token for transition compatibility
  wsAllowQueryTokenFallback: getEnvBoolean(
    'WS_ALLOW_QUERY_TOKEN_FALLBACK',
    (process.env.NODE_ENV || 'development') !== 'production'
  ),

  // Heartbeat interval in milliseconds
  heartbeatInterval: getEnvNumber('HEARTBEAT_INTERVAL', 30000), // 30 seconds

  // Reconnection settings
  reconnectInterval: getEnvNumber('RECONNECT_INTERVAL', 5000), // 5 seconds
  maxReconnectAttempts: getEnvNumber('MAX_RECONNECT_ATTEMPTS', 0), // 0 = infinite

  // Host event backpressure and data quality controls
  hostUpdateDebounceMs: getEnvNumber('NODE_HOST_UPDATE_DEBOUNCE_MS', 500),
  maxBufferedHostEvents: getEnvNumber('NODE_MAX_BUFFERED_HOST_EVENTS', 2000),
  hostEventFlushBatchSize: getEnvNumber('NODE_HOST_EVENT_FLUSH_BATCH_SIZE', 100),
  initialSyncChunkSize: getEnvNumber('NODE_INITIAL_SYNC_CHUNK_SIZE', 100),
  hostStaleAfterMs: getEnvNumber('NODE_HOST_STALE_AFTER_MS', 15 * 60 * 1000),
};

/**
 * Validates agent configuration
 * Throws error if agent mode is enabled but required fields are missing
 */
export function validateAgentConfig(): void {
  if (agentConfig.mode === 'agent') {
    const missing: string[] = [];

    if (!agentConfig.cncUrl) missing.push('CNC_URL');
    if (!agentConfig.nodeId) missing.push('NODE_ID');
    if (!agentConfig.location) missing.push('NODE_LOCATION');
    if (!agentConfig.authToken) missing.push('NODE_AUTH_TOKEN');

    if (missing.length > 0) {
      throw new Error(
        `Agent mode enabled but missing required configuration: ${missing.join(', ')}`
      );
    }

    // Enforce TLS in production to prevent token interception
    const isProduction = (process.env.NODE_ENV || 'development') === 'production';
    if (isProduction && agentConfig.cncUrl && !agentConfig.cncUrl.startsWith('wss://')) {
      throw new Error(
        'CNC_URL must use wss:// in production to prevent token interception'
      );
    }
  }
}
