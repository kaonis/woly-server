import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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

  // Heartbeat interval in milliseconds
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30000', 10), // 30 seconds

  // Reconnection settings
  reconnectInterval: parseInt(process.env.RECONNECT_INTERVAL || '5000', 10), // 5 seconds
  maxReconnectAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS || '0', 10), // 0 = infinite
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
  }
}
